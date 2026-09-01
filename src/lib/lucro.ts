// src/lib/lucro.ts
// Fórmula ÚNICA de lucro líquido, usada pelo Dashboard, fechamento de caixa
// e qualquer outra página que precisar desse número.
// Lucro = Receita das vendas (pagamento !== 'fiado' + fiado quitado no período)
//       - Custo CMV (soma dos itens vendidos * precoCompra do produto).

import type { Produto, Venda, EntradaCaixa } from './store'

export function cmvDaVenda(venda: Venda, produtos: Produto[]): number {
  return venda.itens.reduce((s, item) => {
    const p = produtos.find(x => x.id === item.produtoId)
    return s + (p?.precoCompra || 0) * item.quantidade
  }, 0)
}

export function lucroDoPeriodo(
  vendas: Venda[],
  produtos: Produto[],
  caixaEntradas: EntradaCaixa[] = [],
  opts: { incluiFiado?: boolean } = {}
): { receita: number; cmv: number; lucro: number; vendasCount: number } {
  const incluiFiado = opts.incluiFiado ?? true
  const vendasEfetivas = vendas.filter(v => {
    if (incluiFiado) return true
    if (v.pagamento === 'fiado') {
      // Considera fiado quitado se houver entrada de caixa correspondente
      return caixaEntradas.some(
        e => e.tipo === 'venda' && e.descricao?.includes(`Quitação Fiado`)
      )
    }
    return v.pagamento !== 'devolucao'
  })

  const receita = vendasEfetivas.reduce((s, v) => s + v.total, 0)
  const cmv = vendasEfetivas.reduce((s, v) => s + cmvDaVenda(v, produtos), 0)
  return {
    receita,
    cmv,
    lucro: receita - cmv,
    vendasCount: vendasEfetivas.length,
  }
}
