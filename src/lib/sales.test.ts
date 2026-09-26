import { describe, expect, it } from 'vitest'
import type { Venda } from './store'
import { ordenarVendasRecentes } from './sales'

function venda(id: string, data: string, criadoEm: string): Venda {
  return { id, data, criadoEm, pagamento: 'pix', itens: [], total: 10 }
}

describe('histórico de vendas', () => {
  it('coloca as vendas mais recentes no topo, inclusive no mesmo dia', () => {
    const resultado = ordenarVendasRecentes([
      venda('antiga', '2026-09-23', '2026-09-23T18:00:00.000Z'),
      venda('recente-dia', '2026-09-24', '2026-09-24T12:00:00.000Z'),
      venda('mais-recente', '2026-09-24', '2026-09-24T20:00:00.000Z'),
    ])
    expect(resultado.map(item => item.id)).toEqual(['mais-recente', 'recente-dia', 'antiga'])
  })

  it('usa a data comercial quando o horário antigo não está disponível', () => {
    const resultado = ordenarVendasRecentes([
      venda('1', '2026-09-20', ''),
      venda('2', '2026-09-22', 'inválido'),
    ])
    expect(resultado.map(item => item.id)).toEqual(['2', '1'])
  })
})
