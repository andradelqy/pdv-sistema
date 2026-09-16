import type { PedidoCompra, Produto, Venda } from '../store'
import { getInventoryPolicy } from './engine'
import type { InventoryEngineResult } from './types'

export type FaixaCompra = 'COMPRAR_AGORA' | 'PLANEJAR' | 'MONITORAR' | 'CORRIGIR_DADOS'

export type ItemPlanoCompra = {
  produto: Produto
  politica: InventoryEngineResult
  faixa: FaixaCompra
  emTransito: number
  quantidadeSugerida: number
  custoEstimado: number
  bloqueio?: string
  explicacao: string
}

function vendasParaProdutoFisico(vendas: Venda[], produtos: Produto[]): Venda[] {
  return vendas.map(venda => {
    const itens = new Map<string, Venda['itens'][number]>()
    venda.itens.forEach(item => {
      const produto = produtos.find(p => p.id === item.produtoId)
      const origemId = produto?.produtoEstoqueOrigemId || item.produtoId
      const divisor = Math.max(1, produto?.unidadesPorEstoqueOrigem || 1)
      const atual = itens.get(origemId)
      itens.set(origemId, { produtoId: origemId, quantidade: (atual?.quantidade || 0) + item.quantidade / divisor, precoUnit: produto?.produtoEstoqueOrigemId ? item.precoUnit * divisor : item.precoUnit })
    })
    return { ...venda, itens: [...itens.values()] }
  })
}

function quantidadeEmTransito(produtoId: string, pedidos: PedidoCompra[]) {
  return pedidos.filter(p => p.status === 'pending' || p.status === 'in_transit').reduce((total, pedido) => total + (pedido.itens.find(item => item.produtoId === produtoId)?.quantidade || 0), 0)
}

/**
 * Converte a política estatística em uma ação operacional explicável. A regra
 * de segurança impede que um produto com demanda medida e estoque zerado seja
 * escondido por uma classificação ou confiança baixa.
 */
export function montarPlanoCompra(produtos: Produto[], vendas: Venda[], pedidos: PedidoCompra[], lojaId: string): ItemPlanoCompra[] {
  const fisicos = produtos.filter(produto => !produto.produtoEstoqueOrigemId)
  const vendasFisicas = vendasParaProdutoFisico(vendas, produtos)

  return fisicos.map(produto => {
    const politica = getInventoryPolicy(produto, vendasFisicas, pedidos, lojaId, fisicos)
    const emTransito = quantidadeEmTransito(produto.id, pedidos)
    const posicao = Math.max(0, produto.estoque) + emTransito
    const faltaAtePonto = Math.max(0, Math.ceil(politica.reorderPoint - posicao))
    const demandaMedida = politica.demandForecast > 0
    // A quantidade do motor é o alvo principal; a diferença até o ponto de
    // pedido é uma proteção contra qualquer arredondamento a zero.
    const necessidadeBase = demandaMedida ? Math.max(politica.recommendedPurchaseQty, faltaAtePonto) : 0
    const minimoCompra = Math.max(1, Math.ceil(produto.quantidadeMinimaCompra || 1))
    const multiploCompra = Math.max(1, Math.ceil(produto.multiploCompra || 1))
    const quantidadeSugerida = necessidadeBase > 0
      ? Math.ceil(Math.max(necessidadeBase, minimoCompra) / multiploCompra) * multiploCompra
      : 0
    const semCusto = !Number.isFinite(produto.precoCompra) || produto.precoCompra <= 0
    const semHistorico = !demandaMedida
    const bloqueio = semCusto ? 'Cadastre um custo de compra maior que zero.' : semHistorico && produto.estoque <= 0 ? 'Não há itens de venda vinculados a este produto para calcular a demanda.' : undefined

    let faixa: FaixaCompra
    let explicacao: string
    if (bloqueio) {
      faixa = 'CORRIGIR_DADOS'
      explicacao = bloqueio
    } else if (quantidadeSugerida > 0 && (produto.estoque <= produto.estoqueMin || politica.recommendation === 'BUY_NOW' || politica.ruptureRisk >= 0.7)) {
      faixa = 'COMPRAR_AGORA'
      explicacao = `Estoque em ${produto.estoque} un.; a demanda e o prazo pedem reposição antes de faltar.`
    } else if (quantidadeSugerida > 0) {
      faixa = 'PLANEJAR'
      explicacao = `Repor para manter a cobertura calculada sem criar excesso.`
    } else {
      faixa = 'MONITORAR'
      explicacao = emTransito > 0 ? `${emTransito} un. já estão em reposição.` : 'O estoque atual já cobre a demanda prevista.'
    }

    return { produto, politica, faixa, emTransito, quantidadeSugerida, custoEstimado: quantidadeSugerida * produto.precoCompra, bloqueio, explicacao }
  }).sort((a, b) => {
    const ordem: Record<FaixaCompra, number> = { COMPRAR_AGORA: 0, PLANEJAR: 1, CORRIGIR_DADOS: 2, MONITORAR: 3 }
    return ordem[a.faixa] - ordem[b.faixa] || b.politica.ruptureRisk - a.politica.ruptureRisk || b.politica.automaticImportanceScore - a.politica.automaticImportanceScore
  })
}
