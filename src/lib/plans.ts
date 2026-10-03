import type { Role } from './rbac';

export type PlanoComercial = 'basico' | 'pro' | 'empresarial';

export type PlanoConfig = {
  id: PlanoComercial;
  nome: string;
  precoMensal: number;
  precoAnualMensal?: number;
  limiteUsuarios: number;
  papeis: Role[];
  descricao: string;
  destaque?: boolean;
  recursos: string[];
};

export const PLANOS: Record<PlanoComercial, PlanoConfig> = {
  basico: {
    id: 'basico',
    nome: 'Básico',
    precoMensal: 69,
    limiteUsuarios: 2,
    papeis: ['owner', 'atendente'],
    descricao: 'Operação essencial de uma loja, do PDV ao inventário.',
    recursos: [
      'Uma loja',
      'Até 2 usuários',
      'PDV e fechamento de caixa',
      'Histórico de vendas',
      'Movimentações, perdas e inventário',
      'Backup e exportações',
      'Suporte em até 2 dias úteis',
    ],
  },
  pro: {
    id: 'pro',
    nome: 'Pro',
    precoMensal: 129,
    precoAnualMensal: 103.2,
    limiteUsuarios: 7,
    papeis: ['owner', 'gerente', 'atendente', 'entregador'],
    descricao: 'Inteligência de estoque, compras, entregas e gestão completa.',
    destaque: true,
    recursos: [
      'Tudo do Básico',
      'Até 7 usuários e todos os papéis',
      'Compras inteligentes e estoque mínimo automático',
      'Composição de doses e garrafas',
      'Curva ABC e Matriz QPR',
      'Pedidos de compra e recebimento',
      'App do entregador e rastreamento',
      'Ofertas e WhatsApp assistido',
      'Catálogo virtual personalizável',
      'Relatórios gerenciais avançados',
      'Uma sessão inicial de treinamento',
      'Suporte em até 1 dia útil',
    ],
  },
  empresarial: {
    id: 'empresarial',
    nome: 'Empresarial',
    precoMensal: 199.9,
    limiteUsuarios: 20,
    papeis: ['owner', 'gerente', 'atendente', 'entregador'],
    descricao: 'Acompanhamento próximo para operações que precisam de implantação assistida.',
    recursos: [
      'Tudo do Pro',
      'Até 20 usuários',
      'Implantação acompanhada',
      'Duas sessões de treinamento',
      'Configuração inicial assistida',
      'Conferência e organização dos cadastros',
      'Suporte no mesmo dia útil',
      'Reunião mensal de acompanhamento',
      'Canal direto e prioridade crítica',
    ],
  },
};

/** Planos antigos recebem acesso compatível, evitando bloquear clientes existentes. */
export function normalizarPlano(plano?: string | null): PlanoComercial {
  const valor = plano?.trim().toLowerCase();
  if (valor === 'basico' || valor === 'pro' || valor === 'empresarial') return valor;
  if (valor === 'teste' || valor === 'trial') return 'pro';
  return 'empresarial';
}

export function configuracaoDoPlano(plano?: string | null) {
  return PLANOS[normalizarPlano(plano)];
}

const PAGINAS_BASICAS = new Set([
  'dashboard', 'pdv', 'produtos', 'movimentacoes', 'caixa', 'historico', 'backup', 'equipe', 'plano',
]);

export function planoPermitePagina(plano: string | null | undefined, pagina: string) {
  return normalizarPlano(plano) !== 'basico' || PAGINAS_BASICAS.has(pagina);
}

export function planoPermitePapel(plano: string | null | undefined, papel: Role) {
  return configuracaoDoPlano(plano).papeis.includes(papel);
}
