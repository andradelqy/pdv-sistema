import { describe, expect, it } from 'vitest'
import { resumirFinanceiro, segmentarCliente } from './analytics'
import type { Cliente, Produto, Venda } from './store'

const produto = { id: 'p1', precoCompra: 4 } as Produto
const venda = (id: string, data: string, total: number, pagamento = 'pix'): Venda => ({ id, data, total, pagamento, criadoEm: `${data}T12:00:00Z`, itens: [{ produtoId: 'p1', quantidade: 2, precoUnit: total / 2 }] })

describe('indicadores gerenciais', () => {
  it('calcula resultado descontando CMV, taxas e sangrias', () => {
    const r = resumirFinanceiro([venda('v1', '2026-09-10', 20, 'cartao_credito')], [produto], [{ tipo: 'sangria', valor: 2, data: '2026-09-10' }], 5)
    expect(r.receita).toBe(20)
    expect(r.cmv).toBe(8)
    expect(r.lucroOperacional).toBe(9)
  })

  it('identifica cliente inativo pela última compra', () => {
    const cliente = { id: 'c1', nome: 'Cliente', saldo: 0, limite: 100, compras: 1 } as Cliente
    const compra = { ...venda('v1', '2026-01-01', 20), clienteId: 'c1' }
    expect(segmentarCliente(cliente, [compra], new Date('2026-09-16T12:00:00'))).toBe('Inativo')
  })
})
