import { supabase } from './supabase'
import { hojeBRT } from './dateBR'
import type { Produto, Movimentacao, Venda, ItemVenda, Cliente, EntradaCaixa, Caixa, PedidoEntrega } from './store'

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

async function userOrThrow(): Promise<string> {
  const id = await getUserId()
  if (!id) throw new Error('Sem usuário logado.')
  return id
}

// Helpers adicionados para garantir data válida
function dataValidaOuHoje(value?: string | null): string {
  if (!value) return hojeBRT()
  const data = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeBRT()
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
function toRowProduto(p: Produto, userId: string, lojaId: string) {
  return {
    id: p.id, user_id: userId, loja_id: lojaId,
    sku: p.sku, nome: p.nome, barcode: p.barcode ?? null,
    descricao: p.descricao ?? null, categoria: p.categoria ?? null,
    fornecedor: p.fornecedor ?? null, lead_time: p.leadTime,
    preco_compra: p.precoCompra, preco_venda: p.precoVenda,
    imposto: p.imposto, frete: p.frete, comissao: p.comissao,
    preco_competidor: p.precoCompetidor ?? null, margem_alvo: p.margemAlvo,
    estoque: p.estoque, estoque_min: p.estoqueMin, ponto_pedido: p.pontoPedido,
    qualidade: p.qualidade, imagem: p.imagem ?? null,
    updated_at: new Date().toISOString(),
  }
}

export async function upsertProduto(p: Produto, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('produtos').upsert(toRowProduto(p, uid, lojaId))
}

export async function deleteProduto(id: string, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('produtos').delete().eq('id', id).eq('user_id', uid).eq('loja_id', lojaId)
}

// -------- movimentacoes --------
function toRowMov(m: Movimentacao, userId: string, lojaId: string) {
  return {
    id: m.id, user_id: userId, loja_id: lojaId,
    produto_id: m.produtoId, tipo: m.tipo,
    quantidade: m.quantidade, data: dataValidaOuHoje(m.data),
    lote: m.lote ?? null, validade: dataValidaOuNull(m.validade), obs: m.obs ?? null,
  }
}

export async function insertMovimentacao(m: Movimentacao, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('movimentacoes').insert(toRowMov(m, uid, lojaId))
}

export async function deleteMovimentacao(id: string, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('movimentacoes').delete().eq('id', id).eq('user_id', uid).eq('loja_id', lojaId)
}

// -------- clientes --------
function toRowCliente(c: Cliente, userId: string, lojaId: string) {
  return {
    id: c.id, user_id: userId, loja_id: lojaId, nome: c.nome,
    telefone: c.telefone ?? null, limite: c.limite,
    saldo: c.saldo, compras: c.compras,
    ultima_cobranca: dataValidaOuNull(c.ultimaCobranca),
  }
}

export async function upsertCliente(c: Cliente, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('clientes').upsert(toRowCliente(c, uid, lojaId))
}

export async function deleteCliente(id: string, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('clientes').delete().eq('id', id).eq('user_id', uid).eq('loja_id', lojaId)
}

// -------- vendas + itens --------
function toRowVenda(v: Venda, userId: string, lojaId: string) {
  return {
    id: v.id, user_id: userId, loja_id: lojaId,
    data: dataValidaOuHoje(v.data), cliente_id: v.clienteId ?? null,
    pagamento: v.pagamento, total: v.total,
    obs: v.obs ?? null, criado_em: isoValidoOuAgora(v.criadoEm),
  }
}

export async function insertVenda(v: Venda, itens: ItemVenda[], lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('vendas').upsert(toRowVenda(v, uid, lojaId))
  if (itens.length) {
    await supabase.from('itens_venda').insert(
      itens.map(i => ({ user_id: uid, loja_id: lojaId, venda_id: v.id, produto_id: i.produtoId, quantidade: i.quantidade, preco_unit: i.precoUnit }))
    )
  }
}

// -------- caixa --------
function toRowCaixa(c: Caixa, userId: string, lojaId: string) {
  return {
    id: c.id, user_id: userId, loja_id: lojaId,
    aberto_em: isoValidoOuAgora(c.abertoEm), fechado_em: c.fechadoEm ? isoValidoOuAgora(c.fechadoEm) : null,
    faturamento_bruto: c.faturamentoBruto ?? null,
    lucro_liquido: c.lucroLiquido ?? null,
    vendas: c.vendas ?? null,
  }
}

export async function upsertCaixa(c: Caixa, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('caixas').upsert(toRowCaixa(c, uid, lojaId))
}

function toRowCaixaEntrada(e: EntradaCaixa, userId: string, lojaId: string) {
  return {
    user_id: userId, loja_id: lojaId, caixa_id: e.caixaId ?? null,
    tipo: e.tipo, pagamento: e.pagamento ?? null,
    valor: e.valor, data: dataValidaOuHoje(e.data), descricao: e.descricao ?? null,
  }
}

export async function insertCaixaEntrada(e: EntradaCaixa, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('caixa_entradas').insert(toRowCaixaEntrada(e, uid, lojaId))
}

// -------- entregas --------
function toRowEntrega(p: PedidoEntrega, userId: string, lojaId: string) {
  return {
    id: p.id, user_id: userId, loja_id: lojaId,
    cliente_nome: p.clienteNome, total: p.total,
    pagamento: p.pagamento, status: p.status,
    data: dataValidaOuHoje(p.data), criado_em: isoValidoOuAgora(p.criadoEm),
  }
}

export async function upsertEntrega(p: PedidoEntrega, lojaId: string) {
  const uid = await userOrThrow()
  await supabase.from('entregas').upsert(toRowEntrega(p, uid, lojaId))
}

// -------- Carga e Migração (simplificado) --------
export type CargaRemota = {
  produtos: Produto[]
  movimentacoes: Movimentacao[]
  vendas: Venda[]
  clientes: Cliente[]
  caixaEntradas: EntradaCaixa[]
  caixas: Caixa[]
  entregas: PedidoEntrega[]
}

export async function carregarTudo(lojaId: string): Promise<CargaRemota | null> {
  const uid = await userOrThrow()
  // Adicionado filtro por loja_id em todas as consultas
  const [p, m, v, c, cx, ce, en] = await Promise.all([
    supabase.from('produtos').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('movimentacoes').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('vendas').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('clientes').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('caixas').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('caixa_entradas').select('*').eq('user_id', uid).eq('loja_id', lojaId),
    supabase.from('entregas').select('*').eq('user_id', uid).eq('loja_id', lojaId),
  ])
  
  if (p.error || m.error || v.error || c.error || cx.error || ce.error || en.error) {
    throw new Error('Falha ao carregar dados')
  }
  
  return {
    produtos: (p.data || []).map((r:any):Produto => ({id: r.id, sku: r.sku, nome: r.nome, estoque: r.estoque, precoCompra: Number(r.preco_compra), precoVenda: Number(r.preco_venda), imposto: Number(r.imposto), frete: Number(r.frete), comissao: Number(r.comissao), estoqueMin: r.estoque_min, pontoPedido: r.ponto_pedido, qualidade: r.qualidade, leadTime: r.lead_time, margemAlvo: Number(r.margem_alvo)})),
    movimentacoes: [], vendas: [], clientes: [], caixaEntradas: [], caixas: [], entregas: [] // Mapear restante se necessário
  }
}
