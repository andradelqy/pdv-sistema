import type { ItemPlanoCompra } from './purchasePlanner'

export type ItemAlocado = ItemPlanoCompra & { quantidade: number; custo: number }

export function alocarOrcamento(
  itens: ItemPlanoCompra[],
  orcamento: number,
  opcoes: { somenteUrgentesConfiaveis?: boolean; excluidos?: Iterable<string> } = {},
): ItemAlocado[] {
  let saldo = Math.max(0, Number.isFinite(orcamento) ? orcamento : 0)
  const excluidos = new Set(opcoes.excluidos ?? [])

  return itens.flatMap(item => {
    if (excluidos.has(item.produto.id) || item.bloqueio || item.quantidadeSugerida <= 0) return []
    if (item.faixa !== 'COMPRAR_AGORA' && item.faixa !== 'PLANEJAR') return []
    if (opcoes.somenteUrgentesConfiaveis && (item.faixa !== 'COMPRAR_AGORA' || item.politica.confidenceScore < 70)) return []
    const custoUnitario = item.produto.precoCompra
    if (!Number.isFinite(custoUnitario) || custoUnitario <= 0) return []
    const minimo = Math.max(1, Math.ceil(item.produto.quantidadeMinimaCompra || 1))
    const multiplo = Math.max(1, Math.ceil(item.produto.multiploCompra || 1))
    const capacidade = Math.floor(Math.floor(saldo / custoUnitario) / multiplo) * multiplo
    const quantidade = Math.min(item.quantidadeSugerida, capacidade)
    if (quantidade < minimo) return []
    const custo = quantidade * custoUnitario
    saldo -= custo
    return [{ ...item, quantidade, custo }]
  })
}
