import { describe, expect, it } from 'vitest'
import {
  estoqueDisponivelProduto,
  encontrarEstoqueInsuficiente,
  quantidadeMaximaDisponivel,
  vendasParaControleEstoque,
  type Produto,
  type Venda,
} from './store'
import { sugerirEstoqueMinimo } from './intelligence/engine'

const garrafa: Produto = {
  id: 'garrafa', sku: 'GARRAFA', nome: 'Garrafa', leadTime: 3,
  precoCompra: 20, precoVenda: 40, imposto: 0, frete: 0, comissao: 0,
  margemAlvo: 30, estoque: 2, estoqueMin: 1, pontoPedido: 2, qualidade: 3,
}

const dose: Produto = {
  ...garrafa, id: 'dose', sku: 'DOSE', nome: 'Dose', precoVenda: 5,
  produtoEstoqueOrigemId: 'garrafa', unidadesPorEstoqueOrigem: 10,
}

describe('controle de estoque por composição', () => {
  it('converte doses vendidas no consumo da garrafa de origem', () => {
    const vendas: Venda[] = [{
      id: 'v1', data: '2026-09-15', pagamento: 'pix', total: 15,
      criadoEm: '2026-09-15T12:00:00.000Z',
      itens: [{ produtoId: 'dose', produtoNome: 'Dose', quantidade: 3, precoUnit: 5 }],
    }]

    expect(vendasParaControleEstoque(vendas, [garrafa, dose])[0].itens).toEqual([
      { produtoId: 'garrafa', quantidade: 0.3, precoUnit: 50 },
    ])
  })

  it('expõe para a dose o estoque vendável calculado pela garrafa', () => {
    expect(estoqueDisponivelProduto(dose, [garrafa, dose])).toBe(20)
  })

  it('considera outros itens que consomem a mesma garrafa', () => {
    const doseDupla: Produto = {
      ...dose,
      id: 'dose-dupla',
      sku: 'DOSE-DUPLA',
      nome: 'Dose dupla',
      unidadesPorEstoqueOrigem: 5,
    }
    const produtos = [garrafa, dose, doseDupla]
    const carrinho = [{ produtoId: 'dose-dupla', quantidade: 5 }]

    expect(quantidadeMaximaDisponivel('dose', carrinho, produtos)).toBe(10)
    expect(encontrarEstoqueInsuficiente([
      ...carrinho,
      { produtoId: 'dose', quantidade: 11 },
    ], produtos)?.produtoId).toBe('garrafa')
  })

  it('mantém ao menos uma unidade para produto sem histórico', () => {
    expect(sugerirEstoqueMinimo(garrafa, [], [])).toBe(1)
  })

  it('não trata devolução como demanda de reposição', () => {
    const devolucao: Venda = {
      id: 'dev1', data: '2026-09-17', pagamento: 'devolucao', total: -5,
      criadoEm: '2026-09-17T12:00:00.000Z',
      itens: [{ produtoId: 'dose', produtoNome: 'Dose', quantidade: 1, precoUnit: -5 }],
    }

    expect(vendasParaControleEstoque([devolucao], [garrafa, dose])).toEqual([])
  })
})
