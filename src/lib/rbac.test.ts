import { describe, expect, it } from 'vitest'
import { hasPermission } from './rbac'

describe('permissões por cargo', () => {
  it('impede entregador de abrir PDV e financeiro', () => {
    expect(hasPermission('entregador', 'canAccessPDV')).toBe(false)
    expect(hasPermission('entregador', 'canAccessFinance')).toBe(false)
  })

  it('mantém PDV disponível ao atendente', () => {
    expect(hasPermission('atendente', 'canAccessPDV')).toBe(true)
  })
})
