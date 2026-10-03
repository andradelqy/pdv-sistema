import { describe, expect, it } from 'vitest';
import { configuracaoDoPlano, normalizarPlano, planoPermitePagina, planoPermitePapel } from './plans';

describe('planos comerciais', () => {
  it('preserva acesso de planos legados sem liberar trial além do Pro', () => {
    expect(normalizarPlano('cortesia')).toBe('empresarial');
    expect(normalizarPlano('mensal')).toBe('empresarial');
    expect(normalizarPlano('teste')).toBe('pro');
  });

  it('aplica limites comerciais por plano', () => {
    expect(configuracaoDoPlano('basico').limiteUsuarios).toBe(2);
    expect(configuracaoDoPlano('pro').limiteUsuarios).toBe(7);
    expect(configuracaoDoPlano('empresarial').limiteUsuarios).toBe(20);
  });

  it('mantém operação essencial no Básico e restringe módulos avançados', () => {
    expect(planoPermitePagina('basico', 'pdv')).toBe(true);
    expect(planoPermitePagina('basico', 'backup')).toBe(true);
    expect(planoPermitePagina('basico', 'compras')).toBe(false);
    expect(planoPermitePapel('basico', 'atendente')).toBe(true);
    expect(planoPermitePapel('basico', 'entregador')).toBe(false);
  });
});

