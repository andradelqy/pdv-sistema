import { describe, expect, it } from 'vitest'
import { agruparRotasPorEntrega, entregaEstaAtrasada, podeOperarEntrega, validarComprovanteEntrega } from './delivery'

describe('rastreabilidade de entregas', () => {
  it('permite owner, gerente e entregador operarem uma entrega, mas não atendente', () => {
    expect(podeOperarEntrega('owner')).toBe(true)
    expect(podeOperarEntrega('gerente')).toBe(true)
    expect(podeOperarEntrega('entregador')).toBe(true)
    expect(podeOperarEntrega('atendente')).toBe(false)
  })

  it('não mistura duas entregas do mesmo entregador', () => {
    const rotas = agruparRotasPorEntrega([
      { entregadorId: 'u1', entregaId: 'e1', lat: -23.5, lng: -46.6, criadoEm: '2026-09-24T10:00:00Z' },
      { entregadorId: 'u1', entregaId: 'e2', lat: -23.51, lng: -46.61, criadoEm: '2026-09-24T11:00:00Z' },
    ])
    expect(rotas).toHaveLength(2)
    expect(rotas.map(rota => rota.entregaId)).toEqual(['e1', 'e2'])
  })

  it('descarta ponto impreciso e salto com velocidade impossível', () => {
    const rotas = agruparRotasPorEntrega([
      { entregadorId: 'u1', entregaId: 'e1', lat: -23.5, lng: -46.6, precisao: 12, criadoEm: '2026-09-24T10:00:00Z' },
      { entregadorId: 'u1', entregaId: 'e1', lat: -22.5, lng: -45.6, precisao: 10, criadoEm: '2026-09-24T10:00:10Z' },
      { entregadorId: 'u1', entregaId: 'e1', lat: -23.5001, lng: -46.6001, precisao: 400, criadoEm: '2026-09-24T10:00:20Z' },
    ])
    expect(rotas[0].pontos).toHaveLength(1)
  })

  it('exige a prova configurada pela loja', () => {
    const config = { exigirPin: true, exigirLocalizacao: true, exigirFoto: true, precisaoMaximaM: 150 }
    expect(validarComprovanteEntrega(config, { recebedor: 'Maria', pin: '1234', lat: -23.5, lng: -46.6, precisao: 20, temFoto: true })).toBeNull()
    expect(validarComprovanteEntrega(config, { recebedor: 'Maria', pin: '12', lat: -23.5, lng: -46.6, precisao: 20, temFoto: true })).toContain('PIN')
  })

  it('sinaliza atraso apenas enquanto a entrega está aberta', () => {
    expect(entregaEstaAtrasada('em_rota', '2026-09-24T10:00:00Z', Date.parse('2026-09-24T11:00:00Z'))).toBe(true)
    expect(entregaEstaAtrasada('entregue', '2026-09-24T10:00:00Z', Date.parse('2026-09-24T11:00:00Z'))).toBe(false)
  })
})
