import { supabase } from './supabase';
import type { Caixa, Cliente, EntradaCaixa, ItemVenda, Movimentacao, PedidoCompra, PedidoEntrega, Produto, Venda } from './store';

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

const QUEUE_KEY = 'sync_queue';
const STATUS_KEY = 'sync_queue_status';
const SYNC_EVENT = 'orbita:sync-status';
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

let processamentoAtual: Promise<SyncQueueStatus> | null = null;
let sincronizacaoAutomaticaAtiva = false;
let timerRetry: number | undefined;

function readQueue(): SyncJob[] {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Array<Partial<SyncJob> & { timestamp?: number }>;
    return value.filter(job => job?.opName && Array.isArray(job.args)).map(job => ({
      id: job.id ?? crypto.randomUUID(), opName: String(job.opName), args: job.args!,
      createdAt: Number(job.createdAt ?? job.timestamp ?? Date.now()),
      updatedAt: Number(job.updatedAt ?? job.createdAt ?? job.timestamp ?? Date.now()),
      attempts: Number(job.attempts ?? 0), lastError: job.lastError,
    }));
  } catch { return []; }
}

function readStoredStatus(): SyncQueueStatus {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}') as SyncQueueStatus; }
  catch { return { pending: 0, failed: 0 }; }
}

function writeQueue(queue: SyncJob[], changes: Partial<SyncQueueStatus> = {}) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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
  localStorage.setItem(STATUS_KEY, JSON.stringify(status));
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

/**
 * A API do Supabase pagina respostas grandes. Trazer apenas a primeira página
 * faria o motor enxergar um histórico parcial e subestimar a demanda.
 */
async function carregarTabelaDaLoja(table: string, lojaId: string): Promise<Row[]> {
  const tamanhoPagina = 1_000
  const rows: Row[] = []
  let inicio = 0

  while (true) {
    const resultado = await supabase.from(table).select('*').eq('loja_id', lojaId).range(inicio, inicio + tamanhoPagina - 1)
    check(resultado.error)
    const pagina = (resultado.data ?? []) as Row[]
    rows.push(...pagina)
    if (pagina.length < tamanhoPagina) return rows
    inicio += tamanhoPagina
  }
}

/** Lê uma loja inteira. O acesso de membros é garantido por RLS; nunca por user_id nesta consulta. */
export async function carregarTudo(lojaId: string): Promise<CargaRemota> {
  const [p, m, v, iv, c, cx, ce, en, pc, ipc] = await Promise.all(['produtos', 'movimentacoes', 'vendas', 'itens_venda', 'clientes', 'caixas', 'caixa_entradas', 'entregas', 'pedidos_compra', 'itens_pedido_compra'].map(table => carregarTabelaDaLoja(table, lojaId)));
  const by = <T>(rows: Row[], key: string, fn: (r: Row) => T): Map<string, T[]> => rows.reduce((map, r) => { const id = String(r[key]); map.set(id, [...(map.get(id) ?? []), fn(r)]); return map; }, new Map<string, T[]>());
  const itensVenda = by<ItemVenda>(iv, 'venda_id', r => ({ produtoId: String(r.produto_id), quantidade: Number(r.quantidade), precoUnit: Number(r.preco_unit), produtoNome: r.produto_nome as string | undefined }));
  const itensPedido = by<PedidoCompra['itens'][number]>(ipc, 'pedido_id', r => ({ produtoId: String(r.produto_id), quantidade: Number(r.quantidade_solicitada), precoCusto: Number(r.preco_unit_custo) }));
  return {
    produtos: p.map(r => ({ id: String(r.id), sku: String(r.sku), nome: String(r.nome), barcode: r.barcode as string | undefined, descricao: r.descricao as string | undefined, categoria: r.categoria as string | undefined, fornecedor: r.fornecedor as string | undefined, leadTime: Number(r.lead_time), precoCompra: Number(r.preco_compra), precoVenda: Number(r.preco_venda), imposto: Number(r.imposto), frete: Number(r.frete), comissao: Number(r.comissao), precoCompetidor: r.preco_competidor == null ? undefined : Number(r.preco_competidor), margemAlvo: Number(r.margem_alvo), estoque: Number(r.estoque), estoqueMin: Number(r.estoque_min), pontoPedido: Number(r.ponto_pedido), qualidade: Number(r.qualidade), imagem: r.imagem as string | undefined, produtoEstoqueOrigemId: r.produto_estoque_origem_id as string | undefined, unidadesPorEstoqueOrigem: r.unidades_por_estoque_origem == null ? undefined : Number(r.unidades_por_estoque_origem), automaticQualityScore: r.automatic_quality_score == null ? undefined : Number(r.automatic_quality_score), automaticQualityLevel: r.automatic_quality_level == null ? undefined : Number(r.automatic_quality_level), confidenceScore: r.confidence_score == null ? undefined : Number(r.confidence_score), quantidadeMinimaCompra: r.quantidade_minima_compra == null ? undefined : Number(r.quantidade_minima_compra), multiploCompra: r.multiplo_compra == null ? undefined : Number(r.multiplo_compra) })),
    movimentacoes: m.map(r => ({ id: String(r.id), produtoId: String(r.produto_id), tipo: r.tipo as Movimentacao['tipo'], quantidade: Number(r.quantidade), data: String(r.data), lote: r.lote as string | undefined, validade: r.validade as string | undefined, obs: r.obs as string | undefined, motivo: r.motivo as Movimentacao['motivo'], aprovadoPor: r.aprovado_por as string | undefined, aprovadoEm: r.aprovado_em as string | undefined })),
    vendas: v.map(r => ({ id: String(r.id), data: String(r.data), clienteId: r.cliente_id as string | undefined, pagamento: String(r.pagamento), itens: itensVenda.get(String(r.id)) ?? [], total: Number(r.total), obs: r.obs as string | undefined, criadoEm: String(r.criado_em) })),
    clientes: c.map(r => ({ id: String(r.id), nome: String(r.nome), telefone: r.telefone as string | undefined, limite: Number(r.limite), saldo: Number(r.saldo), compras: Number(r.compras), ultimaCobranca: r.ultima_cobranca as string | undefined, email: r.email as string | undefined, tags: (r.tags ?? []) as string[], observacoes: r.observacoes as string | undefined })),
    caixas: cx.map(r => ({ id: String(r.id), abertoEm: String(r.aberto_em), fechadoEm: r.fechado_em as string | undefined, faturamentoBruto: r.faturamento_bruto == null ? undefined : Number(r.faturamento_bruto), lucroLiquido: r.lucro_liquido == null ? undefined : Number(r.lucro_liquido), vendas: r.vendas == null ? undefined : Number(r.vendas) })),
    caixaEntradas: ce.map(r => ({ tipo: r.tipo as EntradaCaixa['tipo'], pagamento: r.pagamento as string | undefined, valor: Number(r.valor), data: String(r.data), descricao: r.descricao as string | undefined, caixaId: r.caixa_id as string | undefined })),
    entregas: en.map(r => ({ id: String(r.id), clienteNome: String(r.cliente_nome), telefone: r.telefone as string | undefined, endereco: String(r.endereco), itens: (r.itens ?? []) as ItemVenda[], total: Number(r.total), taxaEntrega: Number(r.taxa_entrega), pagamento: String(r.pagamento), status: r.status as PedidoEntrega['status'], entregadorId: r.entregador_id as string | undefined, entregadorNome: r.entregador_nome as string | undefined, data: String(r.data), criadoEm: String(r.criado_em), obs: r.obs as string | undefined, lat: r.lat == null ? undefined : Number(r.lat), lng: r.lng == null ? undefined : Number(r.lng), aceitoEm: r.aceito_em as string | undefined, emRotaEm: r.em_rota_em as string | undefined, entregueEm: r.entregue_em as string | undefined, canceladoEm: r.cancelado_em as string | undefined, canceladoMotivo: r.cancelado_motivo as string | undefined, naoEntregueEm: r.nao_entregue_em as string | undefined, naoEntregueMotivo: r.nao_entregue_motivo as string | undefined, recebedorNome: r.recebedor_nome as string | undefined, codigoConfirmacao: r.codigo_confirmacao as string | undefined })),
    pedidosCompra: pc.map(r => ({ id: String(r.id), fornecedorId: r.fornecedor_id == null ? undefined : String(r.fornecedor_id), fornecedorNome: r.fornecedor_nome as string | undefined, status: r.status as PedidoCompra['status'], itens: itensPedido.get(String(r.id)) ?? [], dataPedido: String(r.data_pedido), lojaId, recebidoEm: r.recebido_em as string | undefined })),
  };
}

function productData(p: Produto, user_id: string, loja_id: string) { return { id: p.id, user_id, loja_id, sku: p.sku, nome: p.nome, barcode: p.barcode, descricao: p.descricao, categoria: p.categoria, fornecedor: p.fornecedor, lead_time: p.leadTime, preco_compra: p.precoCompra, preco_venda: p.precoVenda, imposto: p.imposto, frete: p.frete, comissao: p.comissao, preco_competidor: p.precoCompetidor, margem_alvo: p.margemAlvo, estoque: p.estoque, estoque_min: p.estoqueMin, ponto_pedido: p.pontoPedido, qualidade: p.qualidade, imagem: p.imagem, produto_estoque_origem_id: p.produtoEstoqueOrigemId, unidades_por_estoque_origem: p.unidadesPorEstoqueOrigem, automatic_quality_score: p.automaticQualityScore, automatic_quality_level: p.automaticQualityLevel, confidence_score: p.confidenceScore, quantidade_minima_compra: p.quantidadeMinimaCompra, multiplo_compra: p.multiploCompra }; }
export async function upsertProduto(p: Produto, lojaId: string) { const { error } = await supabase.from('produtos').upsert(productData(p, await userOrThrow(), lojaId)); check(error); }
export async function deleteProduto(id: string, lojaId: string) { const { error } = await supabase.from('produtos').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function insertMovimentacao(m: Movimentacao, lojaId: string) { const { error } = await supabase.from('movimentacoes').upsert({ id: m.id, user_id: await userOrThrow(), loja_id: lojaId, produto_id: m.produtoId, tipo: m.tipo, quantidade: m.quantidade, data: m.data, lote: m.lote, validade: m.validade, obs: m.obs, motivo: m.motivo, aprovado_por: m.aprovadoPor, aprovado_em: m.aprovadoEm }); check(error); }
export async function deleteMovimentacao(id: string, lojaId: string) { const { error } = await supabase.from('movimentacoes').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function upsertCliente(c: Cliente, lojaId: string) { const { error } = await supabase.from('clientes').upsert({ id: c.id, user_id: await userOrThrow(), loja_id: lojaId, nome: c.nome, telefone: c.telefone, limite: c.limite, saldo: c.saldo, compras: c.compras, ultima_cobranca: c.ultimaCobranca, email: c.email, tags: c.tags ?? [], observacoes: c.observacoes }); check(error); }
export async function deleteCliente(id: string, lojaId: string) { const { error } = await supabase.from('clientes').delete().eq('id', id).eq('loja_id', lojaId); check(error); }
export async function upsertCaixa(c: Caixa, lojaId: string) { const { error } = await supabase.from('caixas').upsert({ id: c.id, user_id: await userOrThrow(), loja_id: lojaId, aberto_em: c.abertoEm, fechado_em: c.fechadoEm, faturamento_bruto: c.faturamentoBruto, lucro_liquido: c.lucroLiquido, vendas: c.vendas }); check(error); }
export async function insertCaixaEntrada(e: EntradaCaixa, lojaId: string) { const { error } = await supabase.from('caixa_entradas').insert({ user_id: await userOrThrow(), loja_id: lojaId, caixa_id: e.caixaId, tipo: e.tipo, pagamento: e.pagamento, valor: e.valor, data: e.data, descricao: e.descricao }); check(error); }
export async function insertVenda(v: Venda, itens: ItemVenda[], lojaId: string) { const user_id = await userOrThrow(); const { error } = await supabase.from('vendas').upsert({ id: v.id, user_id, loja_id: lojaId, data: v.data, cliente_id: v.clienteId, pagamento: v.pagamento, total: v.total, obs: v.obs, criado_em: v.criadoEm }); check(error); if (!itens.length) return; const { error: itemError } = await supabase.from('itens_venda').upsert(itens.map(i => ({ user_id, loja_id: lojaId, venda_id: v.id, produto_id: i.produtoId, produto_nome: i.produtoNome, quantidade: i.quantidade, preco_unit: i.precoUnit })), { onConflict: 'venda_id,produto_id' }); check(itemError); }
export async function confirmarVendaAtomica(v: Venda, caixaId: string, lojaId: string) {
  void lojaId;
  const itens = v.itens.map(item => ({ produto_id: item.produtoId, quantidade: item.quantidade, preco_unit: item.precoUnit, produto_nome: item.produtoNome }));
  const venda = { id: v.id, data: v.data, cliente_id: v.clienteId, pagamento: v.pagamento, total: v.total, obs: v.obs, criado_em: v.criadoEm };
  const { error } = await supabase.rpc('confirmar_venda_atomica', { p_venda: venda, p_itens: itens, p_caixa_id: caixaId });
  check(error);
}
export async function upsertEntrega(e: PedidoEntrega, lojaId: string) { const { error } = await supabase.from('entregas').upsert({ id: e.id, user_id: await userOrThrow(), loja_id: lojaId, cliente_nome: e.clienteNome, telefone: e.telefone, endereco: e.endereco, itens: e.itens, total: e.total, taxa_entrega: e.taxaEntrega, pagamento: e.pagamento, status: e.status, entregador_id: e.entregadorId, entregador_nome: e.entregadorNome, data: e.data, criado_em: e.criadoEm, obs: e.obs, lat: e.lat, lng: e.lng, aceito_em: e.aceitoEm, em_rota_em: e.emRotaEm, entregue_em: e.entregueEm, cancelado_em: e.canceladoEm, cancelado_motivo: e.canceladoMotivo, nao_entregue_em: e.naoEntregueEm, nao_entregue_motivo: e.naoEntregueMotivo, recebedor_nome: e.recebedorNome, codigo_confirmacao: e.codigoConfirmacao }); check(error); }
export async function atualizarLocalizacaoEntregador(localizacao: { entregadorId: string; entregadorNome: string; entregaId: string; lat: number; lng: number; precisao?: number }, lojaId: string) {
  const atualizadoEm = new Date().toISOString();
  const [{ error: atualError }, { error: pontoError }] = await Promise.all([
    supabase.from('rastreio_entregadores').upsert({ entregador_id: localizacao.entregadorId, loja_id: lojaId, entregador_nome: localizacao.entregadorNome, lat: localizacao.lat, lng: localizacao.lng, atualizado_em: atualizadoEm }, { onConflict: 'entregador_id,loja_id' }),
    supabase.from('rastreio_pontos').insert({ entregador_id: localizacao.entregadorId, loja_id: lojaId, entrega_id: localizacao.entregaId, lat: localizacao.lat, lng: localizacao.lng, precisao_m: localizacao.precisao }),
  ]);
  check(atualError); check(pontoError);
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const fornecedor = normalizarFornecedorPedido(p);
  const dadosBase = {
    id: p.id,
    user_id,
    loja_id: lojaId,
    fornecedor_id: fornecedor.fornecedorId,
    status: p.status,
    data_pedido: p.dataPedido,
    recebido_em: p.recebidoEm,
  };
  let { error } = await supabase.from('pedidos_compra').upsert({ ...dadosBase, fornecedor_nome: fornecedor.fornecedorNome });
  // Compatibilidade durante a implantação: se a coluna nova ainda não chegou
  // ao projeto remoto, o pedido já pode sincronizar sem enviar o placeholder.
  if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message.includes('fornecedor_nome'))) {
    ({ error } = await supabase.from('pedidos_compra').upsert(dadosBase));
  }
  check(error);
  if (!p.itens.length) return;
  const { error: itemError } = await supabase.from('itens_pedido_compra').upsert(p.itens.map(i => ({ user_id, loja_id: lojaId, pedido_id: p.id, produto_id: i.produtoId, quantidade_solicitada: i.quantidade, preco_unit_custo: i.precoCusto })), { onConflict: 'pedido_id,produto_id' });
  check(itemError);
}

type SyncOperation = (...args: never[]) => Promise<void>;
const operations: Record<string, SyncOperation> = { upsertProduto, deleteProduto, insertMovimentacao, deleteMovimentacao, upsertCliente, deleteCliente, upsertCaixa, insertCaixaEntrada, insertVenda, confirmarVendaAtomica, upsertEntrega, upsertPedidoCompra };

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
    if (event.key === QUEUE_KEY) {
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
