// src/lib/sync.ts
// Write-through: cada mutação local espelha no Supabase.
// Load inicial: tenta Supabase primeiro; se falhar/estiver vazio, usa LS.

import { supabase } from './supabase'
import { hojeBRT } from './dateBR'
import type {
  Produto, Movimentacao, Venda, ItemVenda,
  Cliente, EntradaCaixa, Caixa, PedidoEntrega,
} from './store'

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

async function userOrThrow(): Promise<string> {
  const id = await getUserId()
  if (!id) throw new Error('Sem usuário logado — não dá pra sincronizar.')
  return id
}

function dataValidaOuHoje(value?: string | null): string {
  if (!value) return hojeBRT()
  const data = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data
  return hojeBRT()
}

function dataValidaOuNull(value?: string | null): string | null {
  if (!value) return null
  const data = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null
}

function isoValidoOuAgora(value?: string | null): string {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// -------- produtos --------
function toRowProduto(p: Produto, userId: string) {
  return {
    id: p.id, user_id: userId,
    sku: p.sku, nome: p.nome,
    barcode: p.barcode ?? null,
    descricao: p.descricao ?? null,
    categoria: p.categoria ?? null,
    fornecedor: p.fornecedor ?? null,
    lead_time: p.leadTime,
    preco_compra: p.precoCompra,
    preco_venda: p.precoVenda,
    imposto: p.imposto,
    frete: p.frete,
    comissao: p.comissao,
    preco_competidor: p.precoCompetidor ?? null,
    margem_alvo: p.margemAlvo,
    estoque: p.estoque,
    estoque_min: p.estoqueMin,
    ponto_pedido: p.pontoPedido,
    qualidade: p.qualidade,
    imagem: p.imagem ?? null,
    updated_at: new Date().toISOString(),
  }
}
function fromRowProduto(r: any): Produto {
  return {
    id: r.id, sku: r.sku, nome: r.nome,
    barcode: r.barcode ?? undefined,
    descricao: r.descricao ?? undefined,
    categoria: r.categoria ?? undefined,
    fornecedor: r.fornecedor ?? undefined,
    leadTime: r.lead_time,
    precoCompra: Number(r.preco_compra),
    precoVenda: Number(r.preco_venda),
    imposto: Number(r.imposto),
    frete: Number(r.frete),
    comissao: Number(r.comissao),
    precoCompetidor: r.preco_competidor != null ? Number(r.preco_competidor) : undefined,
    margemAlvo: Number(r.margem_alvo),
    estoque: r.estoque, estoqueMin: r.estoque_min, pontoPedido: r.ponto_pedido,
    qualidade: r.qualidade,
    imagem: r.imagem ?? undefined,
  }
}

export async function upsertProduto(p: Produto) {
  const uid = await userOrThrow()
  await supabase.from('produtos').upsert(toRowProduto(p, uid))
}
export async function deleteProduto(id: string) {
  const uid = await userOrThrow()
  await supabase.from('produtos').delete().eq('id', id).eq('user_id', uid)
}

// -------- movimentacoes --------
function toRowMov(m: Movimentacao, userId: string) {
  return {
    id: m.id, user_id: userId,
    produto_id: m.produtoId, tipo: m.tipo,
    quantidade: m.quantidade, data: dataValidaOuHoje(m.data),
    lote: m.lote ?? null, validade: dataValidaOuNull(m.validade), obs: m.obs ?? null,
  }
}
function fromRowMov(r: any): Movimentacao {
  return {
    id: r.id, produtoId: r.produto_id, tipo: r.tipo,
    quantidade: r.quantidade, data: r.data,
    lote: r.lote ?? undefined, validade: r.validade ?? undefined, obs: r.obs ?? undefined,
  }
}
export async function insertMovimentacao(m: Movimentacao) {
  const uid = await userOrThrow()
  await supabase.from('movimentacoes').insert(toRowMov(m, uid))
}
export async function deleteMovimentacao(id: string) {
  const uid = await userOrThrow()
  await supabase.from('movimentacoes').delete().eq('id', id).eq('user_id', uid)
}

// -------- clientes --------
function toRowCliente(c: Cliente, userId: string) {
  return {
    id: c.id, user_id: userId, nome: c.nome,
    telefone: c.telefone ?? null,
    limite: c.limite, saldo: c.saldo, compras: c.compras,
    ultima_cobranca: dataValidaOuNull(c.ultimaCobranca),
  }
}
function fromRowCliente(r: any): Cliente {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone ?? undefined,
    limite: Number(r.limite), saldo: Number(r.saldo), compras: r.compras,
    ultimaCobranca: r.ultima_cobranca ?? undefined,
  }
}
export async function upsertCliente(c: Cliente) {
  const uid = await userOrThrow()
  await supabase.from('clientes').upsert(toRowCliente(c, uid))
}
export async function deleteCliente(id: string) {
  const uid = await userOrThrow()
  await supabase.from('clientes').delete().eq('id', id).eq('user_id', uid)
}

// -------- vendas + itens (split) --------
function toRowVenda(v: Venda, userId: string) {
  return {
    id: v.id, user_id: userId,
    data: dataValidaOuHoje(v.data), cliente_id: v.clienteId ?? null,
    pagamento: v.pagamento, total: v.total,
    obs: v.obs ?? null, criado_em: isoValidoOuAgora(v.criadoEm),
  }
}
function fromRowVenda(r: any): Omit<Venda, 'itens'> {
  return {
    id: r.id, data: r.data, clienteId: r.cliente_id ?? undefined,
    pagamento: r.pagamento, total: Number(r.total),
    obs: r.obs ?? undefined, criadoEm: r.criado_em,
  }
}
export async function insertVenda(v: Venda, itens: ItemVenda[]) {
  const uid = await userOrThrow()
  await supabase.from('vendas').upsert(toRowVenda(v, uid))
  if (itens.length) {
    const { data: existentes } = await supabase
      .from('itens_venda').select('id').eq('venda_id', v.id).eq('user_id', uid)
    if (existentes && existentes.length) {
      await supabase.from('itens_venda').delete().eq('venda_id', v.id).eq('user_id', uid)
    }
    await supabase.from('itens_venda').insert(
      itens.map(i => ({ user_id: uid, venda_id: v.id, produto_id: i.produtoId, quantidade: i.quantidade, preco_unit: i.precoUnit }))
    )
  }
}

// -------- caixa --------
function toRowCaixa(c: Caixa, userId: string) {
  return {
    id: c.id, user_id: userId,
    aberto_em: isoValidoOuAgora(c.abertoEm), fechado_em: c.fechadoEm ? isoValidoOuAgora(c.fechadoEm) : null,
    faturamento_bruto: c.faturamentoBruto ?? null,
    lucro_liquido: c.lucroLiquido ?? null,
    vendas: c.vendas ?? null,
  }
}
function fromRowCaixa(r: any): Caixa {
  return {
    id: r.id, abertoEm: r.aberto_em, fechadoEm: r.fechado_em ?? undefined,
    faturamentoBruto: r.faturamento_bruto != null ? Number(r.faturamento_bruto) : undefined,
    lucroLiquido: r.lucro_liquido != null ? Number(r.lucro_liquido) : undefined,
    vendas: r.vendas ?? undefined,
  }
}
export async function upsertCaixa(c: Caixa) {
  const uid = await userOrThrow()
  await supabase.from('caixas').upsert(toRowCaixa(c, uid))
}

function toRowCaixaEntrada(e: EntradaCaixa, userId: string) {
  return {
    user_id: userId, caixa_id: e.caixaId ?? null,
    tipo: e.tipo, pagamento: e.pagamento ?? null,
    valor: e.valor, data: dataValidaOuHoje(e.data), descricao: e.descricao ?? null,
  }
}
function fromRowCaixaEntrada(r: any): EntradaCaixa {
  return {
    tipo: r.tipo, pagamento: r.pagamento ?? undefined,
    valor: Number(r.valor), data: r.data,
    descricao: r.descricao ?? undefined,
    caixaId: r.caixa_id ?? undefined,
  }
}
export async function insertCaixaEntrada(e: EntradaCaixa) {
  const uid = await userOrThrow()
  await supabase.from('caixa_entradas').insert(toRowCaixaEntrada(e, uid))
}

// -------- entregas --------
function toRowEntrega(p: PedidoEntrega, userId: string) {
  return {
    id: p.id, user_id: userId,
    cliente_nome: p.clienteNome, telefone: p.telefone ?? null,
    endereco: p.endereco, itens: p.itens as any,
    total: p.total, taxa_entrega: p.taxaEntrega,
    pagamento: p.pagamento, status: p.status,
    entregador_id: p.entregadorId ?? null,
    entregador_nome: p.entregadorNome ?? null,
    data: dataValidaOuHoje(p.data), criado_em: isoValidoOuAgora(p.criadoEm), obs: p.obs ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null,
  }
}
function fromRowEntrega(r: any): PedidoEntrega {
  return {
    id: r.id, clienteNome: r.cliente_nome,
    telefone: r.telefone ?? undefined, endereco: r.endereco,
    itens: r.itens as ItemVenda[], total: Number(r.total),
    taxaEntrega: Number(r.taxa_entrega),
    pagamento: r.pagamento, status: r.status,
    entregadorId: r.entregador_id ?? undefined,
    entregadorNome: r.entregador_nome ?? undefined,
    data: r.data, criadoEm: r.criado_em,
    obs: r.obs ?? undefined,
    lat: r.lat ?? undefined, lng: r.lng ?? undefined,
  }
}
export async function upsertEntrega(p: PedidoEntrega) {
  const uid = await userOrThrow()
  await supabase.from('entregas').upsert(toRowEntrega(p, uid))
}

// -------- carga inicial --------
export type CargaRemota = {
  produtos: Produto[]
  movimentacoes: Movimentacao[]
  vendas: Venda[]
  clientes: Cliente[]
  caixaEntradas: EntradaCaixa[]
  caixas: Caixa[]
  entregas: PedidoEntrega[]
}

export async function carregarTudo(): Promise<CargaRemota | null> {
  const uid = await userOrThrow()
  const [p, m, v, iv, c, cx, ce, en] = await Promise.all([
    supabase.from('produtos').select('*').eq('user_id', uid),
    supabase.from('movimentacoes').select('*').eq('user_id', uid),
    supabase.from('vendas').select('*').eq('user_id', uid),
    supabase.from('itens_venda').select('*').eq('user_id', uid),
    supabase.from('clientes').select('*').eq('user_id', uid),
    supabase.from('caixas').select('*').eq('user_id', uid),
    supabase.from('caixa_entradas').select('*').eq('user_id', uid),
    supabase.from('entregas').select('*').eq('user_id', uid),
  ])
  if (p.error || m.error || v.error || iv.error || c.error || cx.error || ce.error || en.error) {
    throw new Error('Falha ao carregar dados do Supabase')
  }
  const total = (p.data?.length||0) + (m.data?.length||0) + (v.data?.length||0)
    + (c.data?.length||0) + (cx.data?.length||0) + (en.data?.length||0)
  if (total === 0) return null

  const itensByVenda = new Map<string, ItemVenda[]>()
  for (const r of iv.data || []) {
    const arr = itensByVenda.get(r.venda_id) || []
    arr.push({ produtoId: r.produto_id, quantidade: r.quantidade, precoUnit: Number(r.preco_unit) })
    itensByVenda.set(r.venda_id, arr)
  }

  return {
    produtos: (p.data || []).map(fromRowProduto),
    movimentacoes: (m.data || []).map(fromRowMov),
    vendas: (v.data || []).map(r => ({ ...fromRowVenda(r), itens: itensByVenda.get(r.id) || [] })),
    clientes: (c.data || []).map(fromRowCliente),
    caixas: (cx.data || []).map(fromRowCaixa),
    caixaEntradas: (ce.data || []).map(fromRowCaixaEntrada),
    entregas: (en.data || []).map(fromRowEntrega),
  }
}

// Processa a fila de operações offline
export async function processarFilaSync() {
  const qStr = localStorage.getItem('sync_queue')
  if (!qStr) return
  const queue: { opName: string; args: any[] }[] = JSON.parse(qStr)
  if (queue.length === 0) return

  console.log(`[sync] processando ${queue.length} operações pendentes...`)
  const ops: Record<string, Function> = {
    upsertProduto, deleteProduto, upsertCliente, deleteCliente,
    insertVenda, upsertCaixa, insertCaixaEntrada, upsertEntrega
  }

  const novaFila: typeof queue = []
  for (const op of queue) {
    try {
      if (ops[op.opName]) {
        await ops[op.opName](...op.args)
        console.log(`[sync] ${op.opName} concluído com sucesso`)
      } else {
        console.error(`[sync] Operação desconhecida: ${op.opName}`)
      }
    } catch (e: any) {
      console.error(`[sync] falhou ao processar ${op.opName}`, e)
      novaFila.push(op)
    }
  }
  localStorage.setItem('sync_queue', JSON.stringify(novaFila))
}
