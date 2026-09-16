import { describe, expect, it } from 'vitest'
import type { Produto } from '../store'
import type { ItemPlanoCompra } from './purchasePlanner'
import { alocarOrcamento } from './purchaseBudget'

function item(id: string, custo: number, sugerido: number, minimo = 1, multiplo = 1): ItemPlanoCompra {
  return { produto: { id, precoCompra: custo, quantidadeMinimaCompra: minimo, multiploCompra: multiplo } as Produto, faixa: 'COMPRAR_AGORA', emTransito: 0, quantidadeSugerida: sugerido, custoEstimado: custo * sugerido, explicacao: '', politica: { confidenceScore: 90, ruptureRisk: 1 } as ItemPlanoCompra['politica'] }
}

describe('alocação de orçamento de compras', () => {
  it('recalcula quantidade imediatamente quando o orçamento muda', () => {
    const plano = [item('p1', 10, 20)]
    expect(alocarOrcamento(plano, 50)[0].quantidade).toBe(5)
    expect(alocarOrcamento(plano, 120)[0].quantidade).toBe(12)
  })
  it('respeita mínimo, múltiplo e prioridade', () => {
    const alocados = alocarOrcamento([item('urgente', 10, 12, 6, 6), item('depois', 10, 10)], 100)
    expect(alocados).toHaveLength(2)
    expect(alocados[0]).toMatchObject({ quantidade: 6, custo: 60 })
    expect(alocados[1]).toMatchObject({ quantidade: 4, custo: 40 })
  })
  it('realoca o saldo quando um item é excluído', () => {
    const plano = [item('p1', 10, 10), item('p2', 10, 10)]
    expect(alocarOrcamento(plano, 100, { excluidos: ['p1'] })[0].produto.id).toBe('p2')
  })
})
