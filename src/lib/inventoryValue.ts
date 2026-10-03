import type { Produto } from './store'

export type ResumoValorEstoque = {
  quantidadeFisica: number
  produtosComSaldo: number
  valorCusto: number
  valorVenda: number
  lucroPotencial: number
}

function numeroSeguro(valor: number) {
  return Number.isFinite(valor) ? Math.max(0, valor) : 0
}

/**
 * Avalia somente produtos que possuem estoque físico próprio.
 * Itens derivados (por exemplo, doses) usam a garrafa como origem e não podem
 * ser somados novamente, pois isso duplicaria o mesmo patrimônio em estoque.
 */
export function calcularValorEstoque(produtos: Produto[]): ResumoValorEstoque {
  const fisicos = produtos.filter(produto => !produto.produtoEstoqueOrigemId)

  const resumo = fisicos.reduce((total, produto) => {
    const quantidade = numeroSeguro(Number(produto.estoque))
    const custoUnitario = numeroSeguro(Number(produto.precoCompra))
    const vendaUnitaria = numeroSeguro(Number(produto.precoVenda))

    total.quantidadeFisica += quantidade
    total.valorCusto += quantidade * custoUnitario
    total.valorVenda += quantidade * vendaUnitaria
    if (quantidade > 0) total.produtosComSaldo += 1
    return total
  }, { quantidadeFisica: 0, produtosComSaldo: 0, valorCusto: 0, valorVenda: 0 })

  return {
    ...resumo,
    lucroPotencial: resumo.valorVenda - resumo.valorCusto,
  }
}
