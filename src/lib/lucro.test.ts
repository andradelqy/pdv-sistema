import { describe, it, expect } from 'vitest'
import { lucroDoPeriodo } from './lucro'
import type { Produto, Venda } from './store'

describe('Cálculo de Lucro Líquido', () => {
  it('deve calcular corretamente o lucro (receita - cmv)', () => {
    const produtos: Produto[] = [{
      id: 'p1', precoCompra: 50, precoVenda: 100, estoque: 10, leadTime: 3, margemAlvo: 50, estoqueMin: 1, pontoPedido: 3, qualidade: 3, sku: 'PROD', nome: 'Produto 1',
      imposto: 0, frete: 0, comissao: 0
    }]
    const vendas: Venda[] = [{
      id: 'v1', data: '2026-09-01', pagamento: 'pix', total: 100, criadoEm: '2026-09-01T10:00:00Z',
      itens: [{ produtoId: 'p1', quantidade: 1, precoUnit: 100 }]
    }]

    // Lucro = 100 (Receita) - (1 * 50 (CustoCompra)) = 50
    const resultado = lucroDoPeriodo(vendas, produtos)
    expect(resultado.lucro).toBe(50)
  })
})
