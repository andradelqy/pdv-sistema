import { describe, expect, it } from 'vitest'
import { dentroDoIntervalo, intervaloAnterior, intervaloDashboard, ultimosMeses } from './dashboardPeriods'

describe('períodos do dashboard', () => {
  it('usa o mês civil e encerra no dia atual', () => {
    expect(intervaloDashboard('mes', '2026-10-03')).toEqual({
      inicio: '2026-10-01',
      fim: '2026-10-03',
      rotulo: 'Mês atual',
    })
  })

  it('usa segunda-feira como início da semana', () => {
    expect(intervaloDashboard('semana', '2026-10-04')).toEqual({
      inicio: '2026-09-28',
      fim: '2026-10-04',
      rotulo: 'Semana atual',
    })
  })

  it('abre um mês histórico completo', () => {
    expect(intervaloDashboard('historico', '2026-10-03', '2026-02')).toMatchObject({
      inicio: '2026-02-01',
      fim: '2026-02-28',
    })
  })

  it('compara o mês atual com o mês civil anterior', () => {
    expect(intervaloAnterior('mes', intervaloDashboard('mes', '2026-03-15'))).toEqual({
      inicio: '2026-02-01',
      fim: '2026-02-28',
      rotulo: 'vs mês ant.',
    })
  })

  it('mantém limites inclusivos e gera doze meses em ordem', () => {
    const intervalo = intervaloDashboard('historico', '2026-10-03', '2026-09')
    expect(dentroDoIntervalo('2026-09-01', intervalo)).toBe(true)
    expect(dentroDoIntervalo('2026-09-30', intervalo)).toBe(true)
    expect(dentroDoIntervalo('2026-10-01', intervalo)).toBe(false)
    expect(ultimosMeses('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})
