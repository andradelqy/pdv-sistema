export type AssinaturaLoja = {
  loja_id: string;
  nome_loja: string;
  plano: string;
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  periodo_teste_ate: string | null;
  acesso_ate: string | null;
  carencia_ate: string | null;
  mensagem_bloqueio: string | null;
};

export function assinaturaEstaLiberada(assinatura: AssinaturaLoja, agora = Date.now()) {
  const vigente = (data: string | null) => Boolean(data && new Date(data).getTime() >= agora);
  if (assinatura.status === 'active') return !assinatura.acesso_ate || vigente(assinatura.acesso_ate);
  if (assinatura.status === 'trial') return vigente(assinatura.periodo_teste_ate);
  if (assinatura.status === 'past_due') return vigente(assinatura.carencia_ate);
  return false;
}

export function dataDaAssinatura(assinatura?: AssinaturaLoja) {
  const data = assinatura?.status === 'trial'
    ? assinatura.periodo_teste_ate
    : assinatura?.status === 'past_due'
      ? assinatura.carencia_ate
      : assinatura?.acesso_ate;
  return data ? new Date(data).toLocaleDateString('pt-BR') : null;
}
