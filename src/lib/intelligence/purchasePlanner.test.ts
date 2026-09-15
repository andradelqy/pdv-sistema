import { describe, expect, it } from 'vitest'
import type { Produto, Venda } from '../store'
import { montarPlanoCompra } from './purchasePlanner'

const produto: Produto = {
  id: 'p-1', sku: 'P1', nome: 'Produto de giro', fornecedor: 'Fornecedor', leadTime: 3,
  precoCompra: 10, precoVenda: 20, imposto: 0, frete: 0, comissao: 0,
  margemAlvo: 30, estoque: 0, estoqueMin: 1, pontoPedido: 2, qualidade: 4,
}

describe('planejador de compras', () => {
  it('recomenda compra positiva para item com venda recente e estoque zerado', () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const vendas: Venda[] = [{
      id: 'v-1', data: hoje, pagamento: 'pix', total: 240, criadoEm: new Date().toISOString(),
      itens: [{ produtoId: produto.id, quantidade: 12, precoUnit: 20 }],
    }]

    const [item] = montarPlanoCompra([produto], vendas, [], 'loja-teste')

    expect(item.faixa).toBe('COMPRAR_AGORA')
    expect(item.quantidadeSugerida).toBeGreaterThan(0)
    expect(item.politica.demandForecast).toBeGreaterThan(0)
  })
})
