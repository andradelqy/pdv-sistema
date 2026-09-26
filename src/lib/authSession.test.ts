import { describe, expect, it } from 'vitest'
import { deveRecarregarContextoDaSessao } from './authSession'

describe('eventos da sessão', () => {
  it('não remonta o aplicativo quando SIGNED_IN se repete para o mesmo usuário', () => {
    expect(deveRecarregarContextoDaSessao('SIGNED_IN', 'usuario-1', 'usuario-1')).toBe(false)
  })

  it('recarrega o contexto ao entrar com outro usuário', () => {
    expect(deveRecarregarContextoDaSessao('SIGNED_IN', 'usuario-1', 'usuario-2')).toBe(true)
  })

  it('mantém a tela montada durante renovação do token', () => {
    expect(deveRecarregarContextoDaSessao('TOKEN_REFRESHED', 'usuario-1', 'usuario-1')).toBe(false)
  })

  it('revalida perfil atualizado e encerra no logout', () => {
    expect(deveRecarregarContextoDaSessao('USER_UPDATED', 'usuario-1', 'usuario-1')).toBe(true)
    expect(deveRecarregarContextoDaSessao('SIGNED_OUT', 'usuario-1', null)).toBe(true)
  })
})
