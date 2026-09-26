import { describe, expect, it } from 'vitest'
import { dataISOValidaOuHoje, dataISOValidaOuNula, timestampISOValidoOuAgora, timestampISOValidoOuNulo } from './dates'

const agora = new Date(2026, 8, 25, 12, 30, 0)

describe('normalização de datas para sincronização', () => {
  it('preserva uma data comercial válida', () => {
    expect(dataISOValidaOuHoje('2026-09-24', agora)).toBe('2026-09-24')
  })

  it.each(['', '   ', '2026-02-30', '24/09/2026', undefined])(
    'substitui data inválida ou vazia (%s) pela data local atual',
    valor => expect(dataISOValidaOuHoje(valor, agora)).toBe('2026-09-25'),
  )

  it('substitui timestamp vazio e preserva timestamp válido', () => {
    expect(timestampISOValidoOuAgora('', agora)).toBe(agora.toISOString())
    expect(timestampISOValidoOuAgora('2026-09-24T18:20:00.000Z', agora)).toBe('2026-09-24T18:20:00.000Z')
  })

  it('converte datas e timestamps opcionais vazios em nulo', () => {
    expect(dataISOValidaOuNula('')).toBeNull()
    expect(dataISOValidaOuNula('2026-02-30')).toBeNull()
    expect(dataISOValidaOuNula('2026-09-25')).toBe('2026-09-25')
    expect(timestampISOValidoOuNulo('')).toBeNull()
    expect(timestampISOValidoOuNulo('2026-09-25T12:00:00.000Z')).toBe('2026-09-25T12:00:00.000Z')
  })
})
