import { describe, expect, it } from 'vitest'
import { interpretarCoordenada, validarCoordenadas } from './geo'

describe('coordenadas de entrega', () => {
  it('aceita ponto ou vírgula decimal no preenchimento manual', () => {
    expect(interpretarCoordenada('-23,5505')).toBe(-23.5505)
    expect(interpretarCoordenada('-46.6333')).toBe(-46.6333)
  })

  it('rejeita valores vazios, não numéricos ou fora do planeta', () => {
    expect(interpretarCoordenada('')).toBeUndefined()
    expect(interpretarCoordenada('abc')).toBeUndefined()
    expect(validarCoordenadas(91, -46)).toContain('latitude')
    expect(validarCoordenadas(-23, -181)).toContain('longitude')
  })

  it('valida um ponto brasileiro possível', () => {
    expect(validarCoordenadas(-23.5505, -46.6333)).toBeNull()
  })
})
