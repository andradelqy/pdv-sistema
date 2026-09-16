import type { Cliente, EntradaCaixa, PedidoEntrega, Produto, Venda } from './store'
import { cmvDaVenda } from './lucro'

export type ResumoFinanceiro = {
  receita: number
  cmv: number
  taxasEstimadas: number
  perdas: number
  lucroOperacional: number
  margemOperacional: number
  contasAReceber: number
}

export function resumirFinanceiro(vendas: Venda[], produtos: Produto[], entradas: EntradaCaixa[], taxaCartaoPercentual = 0): ResumoFinanceiro {
  const receita = vendas.filter(v => v.pagamento !== 'devolucao').reduce((s, v) => s + v.total, 0)
  const cmv = vendas.reduce((s, v) => s + cmvDaVenda(v, produtos), 0)
  const vendasCartao = vendas.filter(v => v.pagamento.includes('cartao')).reduce((s, v) => s + v.total, 0)
  const taxasEstimadas = vendasCartao * Math.max(0, taxaCartaoPercentual) / 100
  const perdas = entradas.filter(e => e.tipo === 'sangria').reduce((s, e) => s + e.valor, 0)
  const contasAReceber = vendas.filter(v => v.pagamento === 'fiado').reduce((s, v) => s + v.total, 0)
  const lucroOperacional = receita - cmv - taxasEstimadas - perdas
  return { receita, cmv, taxasEstimadas, perdas, lucroOperacional, margemOperacional: receita ? lucroOperacional / receita * 100 : 0, contasAReceber }
}

export function segmentarCliente(cliente: Cliente, vendas: Venda[], hoje = new Date()): 'VIP' | 'Frequente' | 'Em risco' | 'Novo' | 'Inativo' {
  const compras = vendas.filter(v => v.clienteId === cliente.id && v.pagamento !== 'devolucao')
  if (!compras.length) return 'Novo'
  const ultima = compras.reduce((max, v) => v.data > max ? v.data : max, compras[0].data)
  const dias = Math.floor((hoje.getTime() - new Date(`${ultima}T12:00:00`).getTime()) / 86_400_000)
  const gasto = compras.reduce((s, v) => s + v.total, 0)
  if (dias > 90) return 'Inativo'
  if (cliente.saldo > cliente.limite || dias > 45) return 'Em risco'
  if (compras.length >= 8 || gasto >= 1000) return 'VIP'
  if (compras.length >= 3) return 'Frequente'
  return 'Novo'
}

export function desempenhoEntregadores(entregas: PedidoEntrega[]) {
  const grupos = new Map<string, { nome: string; total: number; entregues: number; minutos: number[] }>()
  entregas.filter(e => e.entregadorId).forEach(e => {
    const atual = grupos.get(e.entregadorId!) ?? { nome: e.entregadorNome || 'Entregador', total: 0, entregues: 0, minutos: [] }
    atual.total++
    if (e.status === 'entregue') atual.entregues++
    if (e.entregueEm) atual.minutos.push((new Date(e.entregueEm).getTime() - new Date(e.criadoEm).getTime()) / 60_000)
    grupos.set(e.entregadorId!, atual)
  })
  return [...grupos.values()].map(g => ({ ...g, taxaSucesso: g.total ? g.entregues / g.total * 100 : 0, tempoMedio: g.minutos.length ? g.minutos.reduce((s, n) => s + n, 0) / g.minutos.length : 0 }))
}
