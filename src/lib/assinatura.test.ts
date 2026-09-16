import { describe, expect, it } from 'vitest';
import { assinaturaEstaLiberada, type AssinaturaLoja } from './assinatura';

const agora = new Date('2026-09-16T12:00:00Z').getTime();
const base: AssinaturaLoja = {
  loja_id: 'loja-teste', nome_loja: 'Loja Teste', plano: 'mensal', status: 'active',
  periodo_teste_ate: null, acesso_ate: null, carencia_ate: null, mensagem_bloqueio: null,
};

describe('controle de assinatura', () => {
  it('mantém ativo sem vencimento e bloqueia ativo vencido', () => {
    expect(assinaturaEstaLiberada(base, agora)).toBe(true);
    expect(assinaturaEstaLiberada({ ...base, acesso_ate: '2026-09-15T23:59:59Z' }, agora)).toBe(false);
  });

  it('libera trial somente durante o período de teste', () => {
    expect(assinaturaEstaLiberada({ ...base, status: 'trial', periodo_teste_ate: '2026-09-20T00:00:00Z' }, agora)).toBe(true);
    expect(assinaturaEstaLiberada({ ...base, status: 'trial', periodo_teste_ate: '2026-09-15T00:00:00Z' }, agora)).toBe(false);
  });

  it('respeita carência e bloqueia suspenso ou cancelado', () => {
    expect(assinaturaEstaLiberada({ ...base, status: 'past_due', carencia_ate: '2026-09-17T00:00:00Z' }, agora)).toBe(true);
    expect(assinaturaEstaLiberada({ ...base, status: 'suspended' }, agora)).toBe(false);
    expect(assinaturaEstaLiberada({ ...base, status: 'cancelled' }, agora)).toBe(false);
  });
});
