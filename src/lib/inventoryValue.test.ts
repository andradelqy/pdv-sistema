import { describe, expect, it } from 'vitest'
import type { Produto } from './store'
import { calcularValorEstoque } from './inventoryValue'

const produto = (dados: Partial<Produto>): Produto => ({
  id: 'produto', sku: 'SKU', nome: 'Produto', leadTime: 1,
  precoCompra: 10, precoVenda: 20, imposto: 0, frete: 0, comissao: 0,
  margemAlvo: 30, estoque: 0, estoqueMin: 0, pontoPedido: 0, qualidade: 3,
  ...dados,
})

describe('valor atual do estoque', () => {
  it('multiplica o saldo atual pelo custo de cada produto', () => {
    const resumo = calcularValorEstoque([
      produto({ id: 'a', estoque: 3, precoCompra: 10, precoVenda: 18 }),
      produto({ id: 'b', estoque: 2, precoCompra: 7.5, precoVenda: 12 }),
    ])

    expect(resumo.quantidadeFisica).toBe(5)
    expect(resumo.valorCusto).toBe(45)
    expect(resumo.valorVenda).toBe(78)
    expect(resumo.lucroPotencial).toBe(33)
  })

  it('retira integralmente do valor um produto que chegou a zero', () => {
    expect(calcularValorEstoque([produto({ estoque: 4 })]).valorCusto).toBe(40)
    expect(calcularValorEstoque([produto({ estoque: 0 })]).valorCusto).toBe(0)
  })

  it('não duplica o valor de doses vinculadas à garrafa', () => {
    const garrafa = produto({ id: 'garrafa', estoque: 2, precoCompra: 50, precoVenda: 90 })
    const dose = produto({
      id: 'dose', estoque: 20, precoCompra: 5, precoVenda: 12,
      produtoEstoqueOrigemId: 'garrafa', unidadesPorEstoqueOrigem: 10,
    })

    expect(calcularValorEstoque([garrafa, dose])).toMatchObject({
      quantidadeFisica: 2,
      produtosComSaldo: 1,
      valorCusto: 100,
      valorVenda: 180,
    })
  })

  it('protege o total contra saldos negativos ou números inválidos', () => {
    const resumo = calcularValorEstoque([
      produto({ id: 'negativo', estoque: -3 }),
      produto({ id: 'invalido', estoque: Number.NaN }),
    ])
    expect(resumo.valorCusto).toBe(0)
    expect(resumo.quantidadeFisica).toBe(0)
  })
})
