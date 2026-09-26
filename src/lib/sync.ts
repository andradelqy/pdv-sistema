import { supabase } from './supabase';
import type { Caixa, Cliente, EntradaCaixa, ItemVenda, Movimentacao, PedidoCompra, PedidoEntrega, Produto, Venda } from './store';
import { ordenarVendasRecentes } from './sales';
import { dataISOValidaOuHoje, dataISOValidaOuNula, timestampISOValidoOuAgora, timestampISOValidoOuNulo } from './dates';

type Row = Record<string, unknown>;

export type SyncJob = {
  id: string;
  opName: string;
  args: unknown[];
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
};

export type SyncQueueStatus = {
  pending: number;
  failed: number;
  syncing?: boolean;
  lastProcessedAt?: number;
  lastError?: string;
  nextRetryAt?: number;
};

const LEGACY_QUEUE_KEY = 'sync_queue';
const LEGACY_STATUS_KEY = 'sync_queue_status';
const QUARANTINE_KEY = 'orbita:sync:legacy-quarantine';
const SYNC_EVENT = 'orbita:sync-status';
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

let processamentoAtual: Promise<SyncQueueStatus> | null = null;
let sincronizacaoAutomaticaAtiva = false;
let timerRetry: number | undefined;
let activeSyncScope = 'unscoped';

function scopedKey(kind: 'queue' | 'status') {
  return `orbita:sync:${activeSyncScope}:${kind}`;
}

function parseQueue(raw: string | null): SyncJob[] {
  try {
    const value = JSON.parse(raw ?? '[]') as Array<Partial<SyncJob> & { timestamp?: number }>;
    return value.filter(job => job?.opName && Array.isArray(job.args)).map(job => ({
      id: job.id ?? crypto.randomUUID(), opName: String(job.opName), args: job.args!,
      createdAt: Number(job.createdAt ?? job.timestamp ?? Date.now()),
      updatedAt: Number(job.updatedAt ?? job.createdAt ?? job.timestamp ?? Date.now()),
      attempts: Number(job.attempts ?? 0), lastError: job.lastError,
    }));
  } catch { return []; }
}

/**
 * Isola operações locais por loja e usuário. A fila legada só é migrada se
 * pertencer à loja atual; o restante fica em quarentena para não ser executado
 * por outra conta nem perdido silenciosamente.
 */
export function configurarEscopoSync(lojaId?: string | null, userId?: string | null) {
  activeSyncScope = lojaId && userId
    ? `${encodeURIComponent(lojaId)}:${encodeURIComponent(userId)}`
    : 'unscoped';
  if (!lojaId || !userId) return;

  const targetKey = scopedKey('queue');
  if (localStorage.getItem(targetKey) === null) {
    const legacy = parseQueue(localStorage.getItem(LEGACY_QUEUE_KEY));
    const belongsToStore = (job: SyncJob) => job.args.some(value => value === lojaId);
    const eligible = legacy.filter(belongsToStore);
    const quarantined = legacy.filter(job => !belongsToStore(job));
    if (eligible.length) localStorage.setItem(targetKey, JSON.stringify(eligible));
    if (quarantined.length) {
      const previous = parseQueue(localStorage.getItem(QUARANTINE_KEY));
      localStorage.setItem(QUARANTINE_KEY, JSON.stringify([...previous, ...quarantined]));
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY);
    localStorage.removeItem(LEGACY_STATUS_KEY);
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: getSyncQueueStatus() }));
}

function readQueue(): SyncJob[] {
  return parseQueue(localStorage.getItem(scopedKey('queue')));
}

function readStoredStatus(): SyncQueueStatus {
  try { return JSON.parse(localStorage.getItem(scopedKey('status')) ?? '{}') as SyncQueueStatus; }
  catch { return { pending: 0, failed: 0 }; }
}

function writeQueue(queue: SyncJob[], changes: Partial<SyncQueueStatus> = {}) {
  localStorage.setItem(scopedKey('queue'), JSON.stringify(queue));
  const previous = readStoredStatus();
  const lastError = [...queue].reverse().find(job => job.lastError)?.lastError;
  const status: SyncQueueStatus = {
    ...previous,
    pending: queue.length,
    failed: queue.filter(job => job.attempts > 0).length,
    syncing: previous.syncing ?? false,
    lastError,
    ...changes,
  };
  if (!queue.length) {
    status.lastError = undefined;
    status.nextRetryAt = undefined;
  }
  localStorage.setItem(scopedKey('status'), JSON.stringify(status));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: status }));
  return status;
}

export function getSyncQueueStatus(): SyncQueueStatus {
  const queue = readQueue();
  const stored = readStoredStatus();
  return {
    ...stored,
    pending: queue.length,
    failed: queue.filter(job => job.attempts > 0).length,
    syncing: Boolean(processamentoAtual),
    lastError: [...queue].reverse().find(job => job.lastError)?.lastError,
  };
}

export function subscribeSyncQueueStatus(listener: (status: SyncQueueStatus) => void) {
  const callback = (event: Event) => listener((event as CustomEvent<SyncQueueStatus>).detail ?? getSyncQueueStatus());
  window.addEventListener(SYNC_EVENT, callback);
  return () => window.removeEventListener(SYNC_EVENT, callback);
}

/** Operações sem identificador não podem ser deduplicadas sem risco de perda. */
export function chaveDedupeSync(opName: string, args: unknown[]): string | null {
  const first = args[0];
  const entityId = typeof first === 'string'
    ? first
    : first && typeof first === 'object' && 'id' in first
      ? String((first as { id?: unknown }).id ?? '')
      : '';
  if (!entityId) return null;
  const lojaId = typeof args[1] === 'string'
    ? args[1]
    : typeof args[2] === 'string'
      ? args[2]
      : '';
  return `${opName}:${entityId}:${lojaId}`;
}

export function calcularAtrasoRetry(attempts: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(Math.max(0, attempts), 5));
}

function agendarSincronizacao(delayMs: number) {
  if (!sincronizacaoAutomaticaAtiva || !readQueue().length) return;
  if (timerRetry !== undefined) window.clearTimeout(timerRetry);
  const nextRetryAt = Date.now() + delayMs;
  writeQueue(readQueue(), { nextRetryAt });
  timerRetry = window.setTimeout(() => {
    timerRetry = undefined;
    void processarFilaSync();
  }, delayMs);
}

/** Enfileira uma mutação e aciona o processador automático. */
export function enfileirarSync(opName: string, args: unknown[], error?: unknown) {
  const queue = readQueue();
  const dedupeKey = chaveDedupeSync(opName, args);
  const existing = dedupeKey
    ? queue.find(job => chaveDedupeSync(job.opName, job.args) === dedupeKey)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? 'Falha de sincronização');
  const now = Date.now();
  if (existing) {
    existing.args = args;
    existing.updatedAt = now;
    existing.attempts = 0;
    existing.lastError = message;
  } else {
    queue.push({ id: crypto.randomUUID(), opName, args, createdAt: now, updatedAt: now, attempts: 0, lastError: message });
  }
  writeQueue(queue, { syncing: Boolean(processamentoAtual), nextRetryAt: undefined });
  agendarSincronizacao(750);
}

async function userOrThrow(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('Sem usuário logado.');
  return data.user.id;
}

function check(error: { message: string; hint?: string | null; details?: string | null; code?: string } | null): void {
  if (!error) return;
  const code = error.code ? `[${error.code}] ` : '';
  const hint = error.hint ? ` Sugestão: ${error.hint}` : '';
  const details = error.details ? ` Detalhes: ${error.details}` : '';
  throw new Error(`${code}${error.message}${hint}${details}`);
}

export type CargaRemota = { produtos: Produto[]; movimentacoes: Movimentacao[]; vendas: Venda[]; clientes: Cliente[]; caixaEntradas: EntradaCaixa[]; caixas: Caixa[]; entregas: PedidoEntrega[]; pedidosCompra: PedidoCompra[]; };

export type PapelOperacional = 'owner' | 'gerente' | 'atendente' | 'entregador';

export type EntregaEvento = {
  id: number;
  tipo: string;
  statusAnterior?: string;
  statusNovo?: string;
  detalhe: Record<string, unknown>;
  lat?: number;
  lng?: number;
  precisao?: number;
  criadoEm: string;
};

function mapEntrega(r: Row): PedidoEntrega {
  const itens = ((r.itens ?? []) as Row[]).map(item => ({
    produtoId: String(item.produtoId ?? item.produto_id),
    produtoNome: (item.produtoNome ?? item.produto_nome) as string | undefined,
    quantidade: Number(item.quantidade),
    precoUnit: Number(item.precoUnit ?? item.preco_unit),
  }));
  return {
    id: String(r.id),
    clienteId: r.cliente_id as string | undefined,
    clienteNome: String(r.cliente_nome),
    telefone: r.telefone as string | undefined,
    endereco: String(r.endereco),
    itens,
    total: Number(r.total ?? 0),
    taxaEntrega: Number(r.taxa_entrega ?? 0),
    pagamento: String(r.pagamento ?? ''),
    status: r.status as PedidoEntrega['status'],
    entregadorId: r.entregador_id as string | undefined,
    entregadorNome: r.entregador_nome as string | undefined,
    data: String(r.data ?? ''),
    criadoEm: String(r.criado_em),
    obs: r.obs as string | undefined,
    lat: r.lat == null ? undefined : Number(r.lat),
    lng: r.lng == null ? undefined : Number(r.lng),
    aceitoEm: r.aceito_em as string | undefined,
    emRotaEm: r.em_rota_em as string | undefined,
    entregueEm: r.entregue_em as string | undefined,
    canceladoEm: r.cancelado_em as string | undefined,
    canceladoMotivo: r.cancelado_motivo as string | undefined,
    naoEntregueEm: r.nao_entregue_em as string | undefined,
    naoEntregueMotivo: r.nao_entregue_motivo as string | undefined,
    recebedorNome: r.recebedor_nome as string | undefined,
    comprovanteFotoUrl: r.comprovante_foto_url as string | undefined,
    comprovanteLat: r.comprovante_lat == null ? undefined : Number(r.comprovante_lat),
    comprovanteLng: r.comprovante_lng == null ? undefined : Number(r.comprovante_lng),
    comprovantePrecisao: r.comprovante_precisao_m == null ? undefined : Number(r.comprovante_precisao_m),
    trackingToken: r.tracking_token as string | undefined,
    previsaoEntregaEm: r.previsao_entrega_em as string | undefined,
    caixaId: r.caixa_id as string | undefined,
    vendaId: r.venda_id as string | undefined,
  };
}

/**
 * A API do Supabase pagina respostas grandes. Trazer apenas a primeira página
 * faria o motor enxergar um histórico parcial e subestimar a demanda.
 */
async function carregarTabelaDaLoja(table: string, lojaId: string): Promise<Row[]> {
  const tamanhoPagina = 1_000
  const rows: Row[] = []
  let inicio = 0

  while (true) {
    const resultado = await supabase.from(table).select('*').eq('loja_id', lojaId).order('id', { ascending: true }).range(inicio, inicio + tamanhoPagina - 1)
    check(resultado.error)
    const pagina = (resultado.data ?? []) as Row[]
    rows.push(...pagina)
    if (pagina.length < tamanhoPagina) return rows
    inicio += tamanhoPagina
  }
}

/** Lê uma loja inteira. O acesso de membros é garantido por RLS; nunca por user_id nesta consulta. */
export async function carregarTudo(lojaId: string, papel?: PapelOperacional): Promise<CargaRemota> {
  if (papel === 'entregador') {
    const { data, error } = await supabase.rpc('listar_entregas_entregador');
    check(error);
    const entregas = (Array.isArray(data) ? data : []) as Row[];
    return { produtos: [], movimentacoes: [], vendas: [], clientes: [], caixaEntradas: [], caixas: [], entregas: entregas.map(mapEntrega), pedidosCompra: [] };
  }
  const [p, m, v, iv, c, cx, ce, en, pc, ipc] = await Promise.all(['produtos', 'movimentacoes', 'vendas', 'itens_venda', 'clientes', 'caixas', 'caixa_entradas', 'entregas', 'pedidos_compra', 'itens_pedido_compra'].map(table => carregarTabelaDaLoja(table, lojaId)));
  const by = <T>(rows: Row[], key: string, fn: (r: Row) => T): Map<string, T[]> => rows.reduce((map, r) => { const id = String(r[key]); map.set(id, [...(map.get(id) ?? []), fn(r)]); return map; }, new Map<string, T[]>());
  const itensVenda = by<ItemVenda>(iv, 'venda_id', r => ({ produtoId: String(r.produto_id), quantidade: Number(r.quantidade), precoUnit: Number(r.preco_unit), produtoNome: r.produto_nome as string | undefined }));
  const itensPedido = by<PedidoCompra['itens'][number]>(ipc, 'pedido_id', r => ({ produtoId: String(r.produto_id), quantidade: Number(r.quantidade_solicitada), precoCusto: Number(r.preco_unit_custo) }));
  return {
    produtos: p.map(r => ({ id: String(r.id), sku: String(r.sku), nome: String(r.nome), barcode: r.barcode as string | undefined, descricao: r.descricao as string | undefined, categoria: r.categoria as string | undefined, fornecedor: r.fornecedor as string | undefined, leadTime: Number(r.lead_time), precoCompra: Number(r.preco_compra), precoVenda: Number(r.preco_venda), imposto: Number(r.imposto), frete: Number(r.frete), comissao: Number(r.comissao), precoCompetidor: r.preco_competidor == null ? undefined : Number(r.preco_competidor), margemAlvo: Number(r.margem_alvo), estoque: Number(r.estoque), estoqueMin: Number(r.estoque_min), pontoPedido: Number(r.ponto_pedido), qualidade: Number(r.qualidade), imagem: r.imagem as string | undefined, produtoEstoqueOrigemId: r.produto_estoque_origem_id as string | undefined, unidadesPorEstoqueOrigem: r.unidades_por_estoque_origem == null ? undefined : Number(r.unidades_por_estoque_origem), automaticQualityScore: r.automatic_quality_score == null ? undefined : Number(r.automatic_quality_score), automaticQualityLevel: r.automatic_quality_level == null ? undefined : Number(r.automatic_quality_level), confidenceScore: r.confidence_score == null ? undefined : Number(r.confidence_score), quantidadeMinimaCompra: r.quantidade_minima_compra == null ? undefined : Number(r.quantidade_minima_compra), multiploCompra: r.multiplo_compra == null ? undefined : Number(r.multiplo_compra) })),
    movimentacoes: m.map(r => ({ id: String(r.id), produtoId: String(r.produto_id), tipo: r.tipo as Movimentacao['tipo'], quantidade: Number(r.quantidade), data: String(r.data), lote: r.lote as string | undefined, validade: r.validade as string | undefined, obs: r.obs as string | undefined, motivo: r.motivo as Movimentacao['motivo'], aprovadoPor: r.aprovado_por as string | undefined, aprovadoEm: r.aprovado_em as string | undefined })),
    vendas: ordenarVendasRecentes(v.map(r => ({ id: String(r.id), data: String(r.data), clienteId: r.cliente_id as string | undefined, pagamento: String(r.pagamento), itens: itensVenda.get(String(r.id)) ?? [], total: Number(r.total), obs: r.obs as string | undefined, criadoEm: String(r.criado_em ?? '') }))),
    clientes: c.map(r => ({ id: String(r.id), nome: String(r.nome), telefone: r.telefone as string | undefined, limite: Number(r.limite), saldo: Number(r.saldo), compras: Number(r.compras), ultimaCobranca: r.ultima_cobranca as string | undefined, email: r.email as string | undefined, tags: (r.tags ?? []) as string[], observacoes: r.observacoes as string | undefined, whatsappOptIn: Boolean(r.whatsapp_opt_in), whatsappOptInEm: r.whatsapp_opt_in_em as string | undefined, whatsappOptOutEm: r.whatsapp_opt_out_em as string | undefined })),
    caixas: cx.map(r => ({ id: String(r.id), abertoEm: String(r.aberto_em), fechadoEm: r.fechado_em as string | undefined, faturamentoBruto: r.faturamento_bruto == null ? undefined : Number(r.faturamento_bruto), lucroLiquido: r.lucro_liquido == null ? undefined : Number(r.lucro_liquido), vendas: r.vendas == null ? undefined : Number(r.vendas) })),
    caixaEntradas: ce.map(r => ({ tipo: r.tipo as EntradaCaixa['tipo'], pagamento: r.pagamento as string | undefined, valor: Number(r.valor), data: String(r.data), descricao: r.descricao as string | undefined, caixaId: r.caixa_id as string | undefined })),
    entregas: en.map(mapEntrega),
    pedidosCompra: pc.map(r => ({ id: String(r.id), fornecedorId: r.fornecedor_id == null ? undefined : String(r.fornecedor_id), fornecedorNome: r.fornecedor_nome as string | undefined, status: r.status as PedidoCompra['status'], itens: itensPedido.get(String(r.id)) ?? [], dataPedido: String(r.data_pedido), lojaId, recebidoEm: r.recebido_em as string | undefined })),
  };
}

function productData(p: Produto, user_id: string, loja_id: string) { return { id: p.id, user_id, loja_id, sku: p.sku, nome: p.nome, barcode: p.barcode, descricao: p.descricao, categoria: p.categoria, fornecedor: p.fornecedor, lead_time: p.leadTime, preco_compra: p.precoCompra, preco_venda: p.precoVenda, imposto: p.imposto, frete: p.frete, comissao: p.comissao, preco_competidor: p.precoCompetidor, margem_alvo: p.margemAlvo, estoque: p.estoque, estoque_min: p.estoqueMin, ponto_pedido: p.pontoPedido, qualidade: p.qualidade, imagem: p.imagem, produto_estoque_origem_id: p.produtoEstoqueOrigemId, unidades_por_estoque_origem: p.unidadesPorEstoqueOrigem, automatic_quality_score: p.automaticQualityScore, automatic_quality_level: p.automaticQualityLevel, confidence_score: p.confidenceScore, quantidade_minima_compra: p.quantidadeMinimaCompra, multiplo_compra: p.multiploCompra }; }
export async function upsertProduto(p: Produto, lojaId: string) { const { error } = await supabase.from('produtos').upsert(productData(p, await userOrThrow(), lojaId)); check(error); }
export async function deleteProduto(id: string, lojaId: string) { const { error } = await supabase.from('produtos').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function insertMovimentacao(m: Movimentacao, lojaId: string) { const { error } = await supabase.from('movimentacoes').upsert({ id: m.id, user_id: await userOrThrow(), loja_id: lojaId, produto_id: m.produtoId, tipo: m.tipo, quantidade: m.quantidade, data: dataISOValidaOuHoje(m.data), lote: m.lote, validade: dataISOValidaOuNula(m.validade), obs: m.obs, motivo: m.motivo, aprovado_por: m.aprovadoPor, aprovado_em: timestampISOValidoOuNulo(m.aprovadoEm) }); check(error); }
export async function deleteMovimentacao(id: string, lojaId: string) { const { error } = await supabase.from('movimentacoes').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function upsertCliente(c: Cliente, lojaId: string) { const { error } = await supabase.from('clientes').upsert({ id: c.id, user_id: await userOrThrow(), loja_id: lojaId, nome: c.nome, telefone: c.telefone, limite: c.limite, saldo: c.saldo, compras: c.compras, ultima_cobranca: dataISOValidaOuNula(c.ultimaCobranca), email: c.email, tags: c.tags ?? [], observacoes: c.observacoes, whatsapp_opt_in: Boolean(c.whatsappOptIn), whatsapp_opt_in_em: c.whatsappOptIn ? timestampISOValidoOuAgora(c.whatsappOptInEm) : null, whatsapp_opt_out_em: c.whatsappOptIn ? null : timestampISOValidoOuNulo(c.whatsappOptOutEm) }); check(error); }
export async function deleteCliente(id: string, lojaId: string) { const { error } = await supabase.from('clientes').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function upsertCaixa(c: Caixa, lojaId: string) { const { error } = await supabase.from('caixas').upsert({ id: c.id, user_id: await userOrThrow(), loja_id: lojaId, aberto_em: timestampISOValidoOuAgora(c.abertoEm), fechado_em: timestampISOValidoOuNulo(c.fechadoEm), faturamento_bruto: c.faturamentoBruto, lucro_liquido: c.lucroLiquido, vendas: c.vendas }); check(error); }
export async function insertCaixaEntrada(e: EntradaCaixa, lojaId: string) { const { error } = await supabase.from('caixa_entradas').insert({ user_id: await userOrThrow(), loja_id: lojaId, caixa_id: e.caixaId, tipo: e.tipo, pagamento: e.pagamento, valor: e.valor, data: dataISOValidaOuHoje(e.data), descricao: e.descricao }); check(error); }
export async function insertVenda(v: Venda, itens: ItemVenda[], lojaId: string) { const user_id = await userOrThrow(); const { error } = await supabase.from('vendas').upsert({ id: v.id, user_id, loja_id: lojaId, data: dataISOValidaOuHoje(v.data), cliente_id: v.clienteId, pagamento: v.pagamento, total: v.total, obs: v.obs, criado_em: timestampISOValidoOuAgora(v.criadoEm) }); check(error); if (!itens.length) return; const { error: itemError } = await supabase.from('itens_venda').upsert(itens.map(i => ({ user_id, loja_id: lojaId, venda_id: v.id, produto_id: i.produtoId, produto_nome: i.produtoNome, quantidade: i.quantidade, preco_unit: i.precoUnit })), { onConflict: 'venda_id,produto_id' }); check(itemError); }
export async function confirmarVendaAtomica(v: Venda, caixaId: string, lojaId: string) {
  void lojaId;
  const itens = v.itens.map(item => ({ produto_id: item.produtoId, quantidade: item.quantidade, preco_unit: item.precoUnit, produto_nome: item.produtoNome }));
  const venda = { id: v.id, data: dataISOValidaOuHoje(v.data), cliente_id: v.clienteId, pagamento: v.pagamento, total: v.total, obs: v.obs, criado_em: timestampISOValidoOuAgora(v.criadoEm) };
  const { error } = await supabase.rpc('confirmar_venda_atomica', { p_venda: venda, p_itens: itens, p_caixa_id: caixaId });
  check(error);
}
function entregaParaRpc(e: PedidoEntrega, codigoConfirmacao?: string) {
  return {
    id: e.id,
    cliente_id: e.clienteId,
    cliente_nome: e.clienteNome,
    telefone: e.telefone,
    endereco: e.endereco,
    itens: e.itens.map(item => ({ produto_id: item.produtoId, produto_nome: item.produtoNome, quantidade: item.quantidade, preco_unit: item.precoUnit })),
    total: e.total,
    taxa_entrega: e.taxaEntrega,
    pagamento: e.pagamento,
    data: dataISOValidaOuHoje(e.data),
    criado_em: timestampISOValidoOuAgora(e.criadoEm),
    obs: e.obs,
    lat: e.lat,
    lng: e.lng,
    caixa_id: e.caixaId,
    tracking_token: e.trackingToken,
    codigo_confirmacao: codigoConfirmacao,
  };
}

export async function criarEntregaAtomica(e: PedidoEntrega, codigoConfirmacao: string, lojaId: string) {
  void lojaId;
  const { data, error } = await supabase.rpc('criar_entrega_atomica', { p_entrega: entregaParaRpc(e, codigoConfirmacao) });
  check(error);
  return mapEntrega((data ?? {}) as Row);
}

export type EntregaTransitionDetails = {
  motivo?: string;
  recebedorNome?: string;
  codigoConfirmacao?: string;
  comprovanteFotoUrl?: string;
  lat?: number;
  lng?: number;
  precisao?: number;
};

export async function transicionarEntregaAtomica(id: string, status: PedidoEntrega['status'], detalhes: EntregaTransitionDetails = {}) {
  const { data, error } = await supabase.rpc('transicionar_entrega_atomica', {
    p_entrega_id: id,
    p_novo_status: status,
    p_detalhes: {
      motivo: detalhes.motivo,
      recebedor_nome: detalhes.recebedorNome,
      codigo_confirmacao: detalhes.codigoConfirmacao,
      comprovante_foto_url: detalhes.comprovanteFotoUrl,
      lat: detalhes.lat,
      lng: detalhes.lng,
      precisao_m: detalhes.precisao,
    },
  });
  check(error);
  return mapEntrega((data ?? {}) as Row);
}

/** Compatibilidade com itens antigos da fila: novas telas não usam upsert direto. */
export async function upsertEntrega(e: PedidoEntrega, lojaId: string) {
  if (e.status === 'pendente') {
    await criarEntregaAtomica(e, e.codigoConfirmacao || '', lojaId);
    return;
  }
  await transicionarEntregaAtomica(e.id, e.status, {
    motivo: e.canceladoMotivo || e.naoEntregueMotivo,
    recebedorNome: e.recebedorNome,
    codigoConfirmacao: e.codigoConfirmacao,
    comprovanteFotoUrl: e.comprovanteFotoUrl,
    lat: e.comprovanteLat,
    lng: e.comprovanteLng,
    precisao: e.comprovantePrecisao,
  });
}

export type LocalizacaoEntrega = {
  id: string;
  entregaId: string;
  lat: number;
  lng: number;
  precisao?: number;
};

export async function atualizarLocalizacaoEntregador(localizacao: LocalizacaoEntrega, lojaId: string) {
  void lojaId;
  const { error } = await supabase.rpc('publicar_localizacao_entrega', {
    p_entrega_id: localizacao.entregaId,
    p_lat: localizacao.lat,
    p_lng: localizacao.lng,
    p_precisao_m: localizacao.precisao,
    p_cliente_evento_id: localizacao.id,
  });
  check(error);
}

export async function listarEventosEntrega(entregaId: string): Promise<EntregaEvento[]> {
  const { data, error } = await supabase.from('entrega_eventos')
    .select('id,tipo,status_anterior,status_novo,detalhe,lat,lng,precisao_m,criado_em')
    .eq('entrega_id', entregaId).order('criado_em', { ascending: true });
  check(error);
  return ((data ?? []) as Row[]).map(row => ({
    id: Number(row.id), tipo: String(row.tipo), statusAnterior: row.status_anterior as string | undefined,
    statusNovo: row.status_novo as string | undefined, detalhe: (row.detalhe ?? {}) as Record<string, unknown>,
    lat: row.lat == null ? undefined : Number(row.lat), lng: row.lng == null ? undefined : Number(row.lng),
    precisao: row.precisao_m == null ? undefined : Number(row.precisao_m), criadoEm: String(row.criado_em),
  }));
}

export type ConfigEntrega = {
  lojaId: string;
  nomeLoja?: string;
  enderecoOrigem?: string;
  latitudeOrigem?: number;
  longitudeOrigem?: number;
  contextoGeocodificacao: string;
  velocidadeMediaKmh: number;
  slaMinutos: number;
  precisaoMaximaM: number;
  exigirPin: boolean;
  exigirLocalizacao: boolean;
  exigirFoto: boolean;
};

export async function carregarConfigEntrega(lojaId: string): Promise<ConfigEntrega> {
  const { data, error } = await supabase.from('config_entregas').select('*').eq('loja_id', lojaId).maybeSingle();
  check(error);
  const row = (data ?? {}) as Row;
  return {
    lojaId, nomeLoja: row.nome_loja as string | undefined, enderecoOrigem: row.endereco_origem as string | undefined,
    latitudeOrigem: row.latitude_origem == null ? undefined : Number(row.latitude_origem),
    longitudeOrigem: row.longitude_origem == null ? undefined : Number(row.longitude_origem),
    contextoGeocodificacao: String(row.contexto_geocodificacao ?? 'Brasil'),
    velocidadeMediaKmh: Number(row.velocidade_media_kmh ?? 25), slaMinutos: Number(row.sla_minutos ?? 60),
    precisaoMaximaM: Number(row.precisao_maxima_m ?? 150), exigirPin: row.exigir_pin !== false,
    exigirLocalizacao: row.exigir_localizacao !== false, exigirFoto: Boolean(row.exigir_foto),
  };
}

export async function salvarConfigEntrega(config: ConfigEntrega) {
  const { error } = await supabase.from('config_entregas').upsert({
    loja_id: config.lojaId, nome_loja: config.nomeLoja, endereco_origem: config.enderecoOrigem,
    latitude_origem: config.latitudeOrigem, longitude_origem: config.longitudeOrigem,
    contexto_geocodificacao: config.contextoGeocodificacao, velocidade_media_kmh: config.velocidadeMediaKmh,
    sla_minutos: config.slaMinutos, precisao_maxima_m: config.precisaoMaximaM,
    exigir_pin: config.exigirPin, exigir_localizacao: config.exigirLocalizacao,
    exigir_foto: config.exigirFoto, updated_at: new Date().toISOString(),
  });
  check(error);
}

export async function geocodificarEntrega(endereco: string): Promise<{ lat: number; lng: number; distanciaKm?: number; etaMinutos?: number }> {
  const { data, error } = await supabase.functions.invoke('geocodificar-entrega', { body: { endereco } });
  check(error);
  if (data?.error) throw new Error(String(data.error));
  return {
    lat: Number(data.lat), lng: Number(data.lng),
    distanciaKm: data.distanciaKm == null ? undefined : Number(data.distanciaKm),
    etaMinutos: data.etaMinutos == null ? undefined : Number(data.etaMinutos),
  };
}

export async function uploadComprovanteEntrega(file: File, lojaId: string, entregaId: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.');
  const extensao = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${lojaId}/${entregaId}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from('entregas-comprovantes').upload(path, file, { contentType: file.type, upsert: false });
  check(error);
  return path;
}

export async function removerComprovanteEntrega(path: string) {
  const { error } = await supabase.storage.from('entregas-comprovantes').remove([path]);
  check(error);
}

export async function urlComprovanteEntrega(path: string) {
  const { data, error } = await supabase.storage.from('entregas-comprovantes').createSignedUrl(path, 60 * 10);
  check(error);
  if (!data) throw new Error('Não foi possível abrir o comprovante.');
  return data.signedUrl;
}

export async function acompanharEntregaPublica(token: string) {
  const { data, error } = await supabase.rpc('acompanhar_entrega_publica', { p_token: token });
  check(error);
  if (!data) throw new Error('Entrega não encontrada ou link inválido.');
  return data as Record<string, unknown>;
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Pedidos antigos usavam ids como `ped_xxx`. Converte-os de forma estável
 * para UUID: repetir o mesmo trabalho offline produz exatamente o mesmo id.
 */
export async function normalizarIdPedidoCompra(id: string) {
  const original = id.trim();
  if (!original) throw new Error('Pedido de compra sem identificador.');
  if (UUID_PATTERN.test(original)) return original;

  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`orbita:pedido-compra:${original}`),
  ));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Converte pedidos antigos, que usavam o nome como fornecedor_id, sem perder o nome. */
export function normalizarFornecedorPedido(p: Pick<PedidoCompra, 'fornecedorId' | 'fornecedorNome'>) {
  const idInformado = p.fornecedorId?.trim();
  const nomeInformado = p.fornecedorNome?.trim();
  const fornecedorId = idInformado && UUID_PATTERN.test(idInformado) ? idInformado : null;
  const nomeLegado = idInformado && !UUID_PATTERN.test(idInformado) && idInformado.toLowerCase() !== 'fornecedor a definir'
    ? idInformado
    : null;
  return { fornecedorId, fornecedorNome: nomeInformado || nomeLegado || null };
}

export async function upsertPedidoCompra(p: PedidoCompra, lojaId: string) {
  const user_id = await userOrThrow();
  const pedidoId = await normalizarIdPedidoCompra(p.id);
  const fornecedor = normalizarFornecedorPedido(p);
  const dadosBase = {
    id: pedidoId,
    user_id,
    loja_id: lojaId,
    fornecedor_id: fornecedor.fornecedorId,
    status: p.status,
    data_pedido: dataISOValidaOuHoje(p.dataPedido),
    recebido_em: timestampISOValidoOuNulo(p.recebidoEm),
  };
  let { error } = await supabase.from('pedidos_compra').upsert({ ...dadosBase, fornecedor_nome: fornecedor.fornecedorNome });
  // Compatibilidade durante a implantação: se a coluna nova ainda não chegou
  // ao projeto remoto, o pedido já pode sincronizar sem enviar o placeholder.
  if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message.includes('fornecedor_nome'))) {
    ({ error } = await supabase.from('pedidos_compra').upsert(dadosBase));
  }
  check(error);
  if (!p.itens.length) return;
  const { error: itemError } = await supabase.from('itens_pedido_compra').upsert(p.itens.map(i => ({ user_id, loja_id: lojaId, pedido_id: pedidoId, produto_id: i.produtoId, quantidade_solicitada: i.quantidade, preco_unit_custo: i.precoCusto })), { onConflict: 'pedido_id,produto_id' });
  check(itemError);
}

export async function receberPedidoCompraAtomico(id: string, lojaId: string) {
  void lojaId;
  const pedidoId = await normalizarIdPedidoCompra(id);
  const { error } = await supabase.rpc('receber_pedido_compra_atomico', { p_pedido_id: pedidoId });
  check(error);
}

type SyncOperation = (...args: never[]) => Promise<void>;
const operations: Record<string, SyncOperation> = { upsertProduto, deleteProduto, insertMovimentacao, deleteMovimentacao, upsertCliente, deleteCliente, upsertCaixa, insertCaixaEntrada, insertVenda, confirmarVendaAtomica, upsertEntrega, atualizarLocalizacaoEntregador, upsertPedidoCompra, receberPedidoCompraAtomico };

async function executarFilaSync(): Promise<SyncQueueStatus> {
  const jobs = readQueue();
  if (!jobs.length) return writeQueue([], { syncing: false, lastProcessedAt: Date.now() });
  if (!navigator.onLine) {
    return writeQueue(jobs, { syncing: false, lastError: 'Sem conexão com a internet.', nextRetryAt: undefined });
  }

  writeQueue(jobs, { syncing: true, nextRetryAt: undefined });
  const resultados = new Map<string, { original: SyncJob; failed?: SyncJob }>();

  for (const job of jobs) {
    const operation = operations[job.opName];
    try {
      if (!operation) throw new Error(`Operação de sincronização desconhecida: ${job.opName}`);
      await (operation as unknown as (...args: unknown[]) => Promise<void>)(...job.args);
      resultados.set(job.id, { original: job });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error);
      console.error(`[sync] ${job.opName} falhou`, error);
      resultados.set(job.id, {
        original: job,
        failed: { ...job, attempts: job.attempts + 1, lastError },
      });
    }
  }

  // Preserva itens que chegaram enquanto a fila era processada. Se o mesmo
  // registro recebeu uma versão mais nova, a versão nova continua pendente.
  const latest = readQueue();
  const pending = latest.flatMap(current => {
    const result = resultados.get(current.id);
    if (!result) return [current];
    if (current.updatedAt > result.original.updatedAt) return [current];
    return result.failed ? [result.failed] : [];
  });

  const maxAttempts = pending.reduce((max, job) => Math.max(max, job.attempts), 0);
  const status = writeQueue(pending, { syncing: false, lastProcessedAt: Date.now(), nextRetryAt: undefined });
  if (pending.length) agendarSincronizacao(calcularAtrasoRetry(maxAttempts));
  return status;
}

export function processarFilaSync(): Promise<SyncQueueStatus> {
  if (processamentoAtual) return processamentoAtual;
  processamentoAtual = executarFilaSync().finally(() => {
    processamentoAtual = null;
    const queue = readQueue();
    if (!queue.length) writeQueue([], { syncing: false, nextRetryAt: undefined });
  });
  return processamentoAtual;
}

/**
 * Mantém a fila funcionando sem depender de clique: inicia ao entrar no app,
 * ao enfileirar, ao reconectar, ao voltar para a aba e em verificações periódicas.
 */
export function iniciarSincronizacaoAutomatica() {
  sincronizacaoAutomaticaAtiva = true;

  const tentarAgora = () => {
    if (!readQueue().length || processamentoAtual) return;
    if (timerRetry !== undefined) {
      window.clearTimeout(timerRetry);
      timerRetry = undefined;
    }
    void processarFilaSync();
  };
  const aoVisibilizar = () => { if (document.visibilityState === 'visible') tentarAgora(); };
  const aoAlterarStorage = (event: StorageEvent) => {
    if (event.key === scopedKey('queue')) {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: getSyncQueueStatus() }));
      tentarAgora();
    }
  };

  window.addEventListener('online', tentarAgora);
  window.addEventListener('focus', tentarAgora);
  window.addEventListener('storage', aoAlterarStorage);
  document.addEventListener('visibilitychange', aoVisibilizar);
  const heartbeat = window.setInterval(() => {
    if (timerRetry === undefined) tentarAgora();
  }, 30_000);

  tentarAgora();

  return () => {
    sincronizacaoAutomaticaAtiva = false;
    if (timerRetry !== undefined) window.clearTimeout(timerRetry);
    timerRetry = undefined;
    window.clearInterval(heartbeat);
    window.removeEventListener('online', tentarAgora);
    window.removeEventListener('focus', tentarAgora);
    window.removeEventListener('storage', aoAlterarStorage);
    document.removeEventListener('visibilitychange', aoVisibilizar);
  };
}
