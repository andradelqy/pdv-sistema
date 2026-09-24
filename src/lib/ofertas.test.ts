import { describe, expect, it } from 'vitest'
import { criarLinkWhatsApp, montarMensagemSimples, normalizarTelefoneWhatsApp, personalizarMensagem, type Oferta } from './ofertas'

describe('central de ofertas', () => {
  it('normaliza telefones brasileiros para E.164', () => {
    expect(normalizarTelefoneWhatsApp('(11) 98765-4321')).toBe('+5511987654321')
    expect(normalizarTelefoneWhatsApp('+55 11 98765-4321')).toBe('+5511987654321')
    expect(normalizarTelefoneWhatsApp('123')).toBeNull()
  })

  it('personaliza a mensagem sem alterar o modelo salvo', () => {
    const oferta: Oferta = {
      id: 'oferta-1', nome: 'Sábado', titulo: 'Combo em dobro', descricao: 'Duas unidades pelo preço promocional.',
      produtoIds: [], descontoTipo: 'percentual', descontoValor: 10, mensagemPadrao: '', status: 'ativa',
      validadeFim: '2026-09-30T23:59:00-03:00', criadoEm: '2026-09-20T12:00:00Z',
    }
    const modelo = 'Oi, {nome}! {oferta}: {descricao} Até {validade}.'
    expect(personalizarMensagem(modelo, { nome: 'Ana' }, oferta)).toBe(
      'Oi, Ana! Combo em dobro: Duas unidades pelo preço promocional. Até 30/09/2026.',
    )
    expect(modelo).toContain('{nome}')
  })

  it('cria o link individual do WhatsApp com a mensagem codificada', () => {
    expect(criarLinkWhatsApp('(11) 98765-4321', 'Olá, Ana!')).toBe(
      'https://wa.me/5511987654321?text=Ol%C3%A1%2C%20Ana!',
    )
    expect(() => criarLinkWhatsApp('123', 'teste')).toThrow('Telefone inválido')
  })

  it('inclui a imagem pública da oferta apenas uma vez no modo simples', () => {
    const oferta: Oferta = {
      id: 'oferta-2', nome: 'Oferta', titulo: 'Combo', descricao: 'Descrição', imagemUrl: 'https://cdn.exemplo/oferta.jpg',
      produtoIds: [], descontoTipo: 'sem_desconto', descontoValor: 0, mensagemPadrao: '', status: 'ativa', criadoEm: '2026-09-20T12:00:00Z',
    }
    expect(montarMensagemSimples('Oi, {nome}! {oferta}', { nome: 'Bia' }, oferta)).toBe(
      'Oi, Bia! Combo\n\nVeja a imagem da oferta: https://cdn.exemplo/oferta.jpg',
    )
    expect(montarMensagemSimples('Confira https://cdn.exemplo/oferta.jpg', { nome: 'Bia' }, oferta))
      .toBe('Confira https://cdn.exemplo/oferta.jpg')
  })
})
