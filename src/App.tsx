import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3, Bell, Boxes, ChartNoAxesCombined, Clock3, Database, Gauge, MapPinned,
  Menu, Moon, Package, ShoppingCart, Sun, Truck, Users, Wallet, LogOut, Loader2,
  FileChartColumn, LockKeyhole, Megaphone
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useStore } from './lib/store';
import { carregarTudo, configurarEscopoSync, getSyncQueueStatus, iniciarSincronizacaoAutomatica, subscribeSyncQueueStatus, type SyncQueueStatus } from './lib/sync';
import { assinaturaEstaLiberada, dataDaAssinatura, type AssinaturaLoja } from './lib/assinatura';
import { configurarContextoTelemetry, registrarErroAplicacao } from './lib/telemetry';
import { ToastProvider } from './lib/toast';
import { deveRecarregarContextoDaSessao } from './lib/authSession';
import { Login } from './Login';
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const PDV = lazy(() => import('./pages/PDV').then(module => ({ default: module.PDV })));
const EntregasPDV = lazy(() => import('./pages/EntregasPDV').then(module => ({ default: module.EntregasPDV })));
const Produtos = lazy(() => import('./pages/Produtos').then(module => ({ default: module.Produtos })));
const Movimentacoes = lazy(() => import('./pages/Movimentacoes').then(module => ({ default: module.Movimentacoes })));
const Compras = lazy(() => import('./pages/Compras').then(module => ({ default: module.Compras })));
const Clientes = lazy(() => import('./pages/Clientes').then(module => ({ default: module.Clientes })));
const Ofertas = lazy(() => import('./pages/Ofertas').then(module => ({ default: module.Ofertas })));
const Analises = lazy(() => import('./pages/Analises').then(module => ({ default: module.Analises })));
const Relatorios = lazy(() => import('./pages/Relatorios').then(module => ({ default: module.Relatorios })));
const PontoEletronico = lazy(() => import('./PontoEletronico').then(module => ({ default: module.PontoEletronico })));
const AppEntregador = lazy(() => import('./AppEntregador').then(module => ({ default: module.AppEntregador })));
const PainelMapa = lazy(() => import('./PainelMapa').then(module => ({ default: module.PainelMapa })));
import { Termos } from './pages/Termos';
import { Privacidade } from './pages/Privacidade';
import { AcompanharEntrega } from './pages/AcompanharEntrega';

type Page = 'dashboard' | 'pdv' | 'entregas_pdv' | 'ponto' | 'entregador' | 'mapa' | 'produtos' | 'movimentacoes' | 'compras' | 'clientes' | 'ofertas' | 'caixa' | 'relatorios' | 'historico' | 'abc' | 'qpr' | 'alertas' | 'backup';

const nav: { group: string; items: { page: Page; label: string; icon: typeof Gauge }[] }[] = [
  { group: 'Visão Geral', items: [{ page: 'dashboard', label: 'Dashboard', icon: Gauge }] },
  { group: 'Vendas', items: [{ page: 'pdv', label: 'PDV', icon: ShoppingCart }, { page: 'entregas_pdv', label: 'Entregas', icon: Truck }, { page: 'historico', label: 'Histórico', icon: Clock3 }] },
  { group: 'Estoque', items: [{ page: 'produtos', label: 'Produtos', icon: Package }, { page: 'movimentacoes', label: 'Movimentações', icon: Boxes }, { page: 'compras', label: 'Compras', icon: ShoppingCart }] },
  { group: 'Pessoas', items: [{ page: 'clientes', label: 'Clientes', icon: Users }, { page: 'ponto', label: 'Ponto Eletrônico', icon: Clock3 }] },
  { group: 'Marketing', items: [{ page: 'ofertas', label: 'Ofertas e WhatsApp', icon: Megaphone }] },
  { group: 'Entregas', items: [{ page: 'entregador', label: 'App Entregador', icon: Truck }, { page: 'mapa', label: 'Rastreamento', icon: MapPinned }] },
  { group: 'Financeiro', items: [{ page: 'caixa', label: 'Caixa', icon: Wallet }, { page: 'relatorios', label: 'Relatórios', icon: FileChartColumn }] },
  { group: 'Análise', items: [{ page: 'abc', label: 'Curva ABC', icon: BarChart3 }, { page: 'qpr', label: 'Matriz QPR', icon: ChartNoAxesCombined }, { page: 'alertas', label: 'Alertas', icon: Bell }] },
  { group: 'Sistema', items: [{ page: 'backup', label: 'Backup', icon: Database }] },
];

const titles: Record<Page, string> = {
  dashboard: 'Dashboard', pdv: 'Ponto de Venda', entregas_pdv: 'PDV Entregas', ponto: 'Ponto Eletrônico', entregador: 'App do Entregador', mapa: 'Rastreamento de Entregas', produtos: 'Produtos', movimentacoes: 'Movimentações', compras: 'Compras', clientes: 'Clientes', ofertas: 'Central de Ofertas', caixa: 'Caixa', relatorios: 'Relatórios', historico: 'Histórico de Vendas', abc: 'Curva ABC', qpr: 'Matriz QPR', alertas: 'Alertas', backup: 'Backup'
};

const paginasPorPapel: Record<'owner' | 'gerente' | 'atendente' | 'entregador', Page[]> = {
  owner: nav.flatMap(group => group.items.map(item => item.page)),
  gerente: nav.flatMap(group => group.items.map(item => item.page)),
  atendente: ['pdv', 'entregas_pdv', 'historico', 'clientes'],
  entregador: ['entregador'],
};

function paginaInicialDoPapel(role?: keyof typeof paginasPorPapel): Page {
  return role === 'entregador' ? 'entregador' : role === 'atendente' ? 'pdv' : 'dashboard';
}

/** Marca vetorial compacta baseada no símbolo orbital da identidade Órbita. */
function OrbitaMark() {
  return <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" role="img" aria-label="Órbita">
    <circle cx="24" cy="24" r="15" fill="#0b2545" />
    <circle cx="24" cy="24" r="8.5" fill="currentColor" className="text-white dark:text-black" />
    <g className="origin-center animate-[spin_9s_linear_infinite] motion-reduce:animate-none">
      <ellipse cx="24" cy="24" rx="22" ry="7.5" fill="none" stroke="#08b6d5" strokeWidth="2.3" />
      <circle cx="43" cy="24" r="3.4" fill="#08b6d5" />
    </g>
  </svg>
}

// ============ SIDEBAR ============

function Sidebar({
  page,
  setPage,
  menuOpen,
  setMenuOpen,
  tema,
  toggleTema,
  alertas,
  entregasPendentes,
  role,
}: {
  page: Page;
  setPage: (p: Page) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  tema: 'light' | 'dark';
  toggleTema: () => void;
  alertas: number;
  entregasPendentes: number;
  role?: 'owner' | 'gerente' | 'atendente' | 'entregador';
}) {
  const isDark = tema === 'dark';
  const paginasPermitidas = role ? paginasPorPapel[role] : nav.flatMap(group => group.items.map(item => item.page));
  const navegacaoVisivel = nav
    .filter(group => group.items.some(item => paginasPermitidas.includes(item.page)))
    .map(group => ({ ...group, items: group.items.filter(item => paginasPermitidas.includes(item.page)) }));

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 h-screen
          transform transition-transform duration-300 ease-in-out
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          flex flex-col
          ${isDark ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}
          border-r
        `}
        role="navigation"
        aria-label="Navegação principal"
      >
        {/* Brand */}
        <div className={`flex items-center gap-2 h-16 px-4 border-b flex-shrink-0 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <OrbitaMark />
          <span className={`font-bold text-lg tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Órbita</span>
          <span className={`text-[10px] font-mono ml-auto ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>versão {__APP_VERSION__}</span>
        </div>

        {/* Navegação com scroll suave e invisível */}
        <nav
          className="flex-1 overflow-y-auto p-3 space-y-6 min-h-0 scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            transform: 'translateZ(0)',
            willChange: 'scroll-position',
            overscrollBehavior: 'contain',
          }}
        >
          <style>
            {`
              nav::-webkit-scrollbar {
                display: none;
              }
            `}
          </style>
          {navegacaoVisivel.map((group) => (
            <div key={group.group}>
              <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {group.group}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = page === item.page;
                  return (
                    <button
                      key={item.page}
                      onClick={() => { setPage(item.page); setMenuOpen(false); }}
                      className={`
                        flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm
                        transition-colors duration-200
                        ${isActive
                          ? `bg-primary/10 text-primary font-medium`
                          : isDark
                            ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }
                      `}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon size={18} strokeWidth={1.5} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.page === 'alertas' && alertas > 0 && (
                        <span className="ml-auto bg-destructive/10 text-destructive text-xs font-medium px-2 py-0.5 rounded-full">
                          {alertas}
                        </span>
                      )}
                      {item.page === 'entregas_pdv' && entregasPendentes > 0 && (
                        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-600'}`}>
                          {entregasPendentes}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé fixo - Modo escuro e Sair */}
        <div className={`p-4 border-t flex-shrink-0 space-y-1 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Sistema
          </div>

          <button
            onClick={toggleTema}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-800 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            {isDark ? 'Modo claro' : 'Modo escuro'}
          </button>

          <button
            onClick={() => supabase.auth.signOut()}
            className={`
              flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${isDark
                ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300'
                : 'text-red-600 hover:bg-red-500/10 hover:text-red-700'
              }
            `}
          >
            <LogOut size={18} strokeWidth={1.5} />
            Sair
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

// ============ TOPBAR ============

function Topbar({
  page,
  setMenuOpen,
  tema
}: {
  page: Page;
  setMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  tema: 'light' | 'dark';
}) {
  const isDark = tema === 'dark';
  const [syncStatus, setSyncStatus] = useState<SyncQueueStatus>(() => getSyncQueueStatus());

  useEffect(() => subscribeSyncQueueStatus(setSyncStatus), []);
  const syncLabel = syncStatus.syncing
    ? `Sincronizando ${syncStatus.pending}`
    : syncStatus.failed
      ? `${syncStatus.pending} com erro`
      : syncStatus.pending
        ? `${syncStatus.pending} aguardando`
        : 'Sincronizado';
  const syncTitle = syncStatus.lastError
    ? `A sincronização é automática. Último erro: ${syncStatus.lastError}`
    : syncStatus.pending
      ? 'Alterações aguardando sincronização automática'
      : 'Todos os dados foram sincronizados';
  return (
    <header className={`
      flex items-center justify-between h-16 px-4 border-b flex-shrink-0
      ${isDark ? 'bg-black border-gray-800' : 'bg-white border-gray-200'}
    `}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMenuOpen(x => !x)}
          className={`p-2 rounded-md transition-colors lg:hidden ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          aria-label="Abrir menu"
        >
          <Menu size={20} strokeWidth={1.5} className={isDark ? 'text-white' : 'text-gray-900'} />
        </button>
        <h1 className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{titles[page]}</h1>
        {page !== 'dashboard' && (
          <span className={`text-xs hidden sm:inline ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>/ {titles[page]}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          title={syncTitle}
          aria-live="polite"
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${syncStatus.failed ? 'bg-red-500/15 text-red-700 dark:text-red-300' : syncStatus.pending ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}
        >
          {syncStatus.syncing && <Loader2 size={12} className="animate-spin" />}
          {syncLabel}
        </span>
        <span className={`text-xs hidden md:block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
        </span>
      </div>
    </header>
  );
}

// ============ APP CONTENT ============

type EstadoAcesso = {
  liberado: boolean;
  assinatura?: AssinaturaLoja;
  erro?: string;
};

async function consultarAcessoDaLoja(lojaId: string): Promise<EstadoAcesso> {
  const { data, error } = await supabase
    .from('assinaturas_lojas')
    .select('loja_id,nome_loja,plano,status,periodo_teste_ate,acesso_ate,carencia_ate,mensagem_bloqueio')
    .eq('loja_id', lojaId)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível validar a assinatura: ${error.message}`);
  if (!data) return { liberado: false, erro: 'Esta loja ainda não possui uma assinatura configurada.' };
  const assinatura = data as AssinaturaLoja;
  return { liberado: assinaturaEstaLiberada(assinatura), assinatura };
}

function AcessoBloqueado({ acesso, tema }: { acesso: EstadoAcesso; tema: 'light' | 'dark' }) {
  const validade = dataDaAssinatura(acesso.assinatura);
  const mensagem = acesso.erro
    || acesso.assinatura?.mensagem_bloqueio
    || (validade ? `O acesso contratado terminou em ${validade}.` : 'O acesso desta loja está temporariamente suspenso.');

  return (
    <div className={`min-h-screen grid place-items-center p-6 ${tema === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className={`w-full max-w-md rounded-2xl border p-7 shadow-sm ${tema === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
          <LockKeyhole size={24} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Assinatura</p>
        <h1 className="mt-2 text-2xl font-bold">Acesso à loja indisponível</h1>
        <p className={`mt-3 text-sm leading-6 ${tema === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>{mensagem}</p>
        {acesso.assinatura && (
          <div className={`mt-5 rounded-xl border p-4 text-sm ${tema === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex justify-between gap-4"><span>Loja</span><strong>{acesso.assinatura.nome_loja}</strong></div>
            <div className="mt-2 flex justify-between gap-4"><span>Plano</span><strong className="capitalize">{acesso.assinatura.plano}</strong></div>
            <div className="mt-2 flex justify-between gap-4"><span>Status</span><strong className="capitalize">{acesso.assinatura.status.replace('_', ' ')}</strong></div>
          </div>
        )}
        <p className={`mt-5 text-xs ${tema === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Entre em contato com o responsável pela sua assinatura para renovar ou regularizar o acesso.
        </p>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          <LogOut size={17} /> Sair da conta
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [acesso, setAcesso] = useState<EstadoAcesso | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const usuarioCarregadoId = useRef<string | null>(null);
  const { tema, toggleTema, produtos, entregas, caixaAberto, hydrateFromRemote, currentRole } = useStore();
  const location = useLocation();

  const alertas = produtos.filter(p => p.estoque <= p.estoqueMin).length;
  const entregasPendentes = entregas.filter(e => e.status === 'pendente').length;
  const pageBlocked = !caixaAberto && (page === 'pdv' || page === 'entregas_pdv');

  useEffect(() => {
    if (!currentRole || paginasPorPapel[currentRole].includes(page)) return;
    const redirect = window.setTimeout(() => setPage(paginaInicialDoPapel(currentRole)), 0);
    return () => window.clearTimeout(redirect);
  }, [currentRole, page]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
  }, [tema]);

  useEffect(() => {
    let ativo = true;

    const carregarSessao = async (value: Session | null, mostrarCarregamento = false, forcar = false) => {
      if (!ativo) return;
      setSession(value);
      if (!value) {
        usuarioCarregadoId.current = null;
        configurarEscopoSync(null, null);
        configurarContextoTelemetry({});
        setAcesso(null);
        setVerificandoSessao(false);
        return;
      }

      if (!forcar && usuarioCarregadoId.current === value.user.id) return;

      if (mostrarCarregamento) setVerificandoSessao(true);
      try {
        const { data: perfil, error: perfilError } = await supabase
          .from('perfis')
          .select('id,email,nome,role,loja_id')
          .eq('id', value.user.id)
          .single();
        if (perfilError || !perfil?.loja_id) throw new Error(perfilError?.message || 'Perfil sem loja_id configurado.');

        configurarEscopoSync(perfil.loja_id, value.user.id);
        configurarContextoTelemetry({ lojaId: perfil.loja_id, userId: value.user.id });

        const estadoAcesso = await consultarAcessoDaLoja(perfil.loja_id);
        if (!ativo) return;
        usuarioCarregadoId.current = value.user.id;
        setAcesso(estadoAcesso);
        if (!estadoAcesso.liberado) return;

        useStore.getState().setRole(perfil.role, perfil.loja_id, {
          id: value.user.id,
          nome: perfil.nome || perfil.email || value.user.email || 'Usuário',
        });
        const remoto = await carregarTudo(perfil.loja_id, perfil.role);
        if (ativo) hydrateFromRemote(remoto);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : 'Não foi possível validar o acesso desta loja.';
        console.error('Falha ao carregar remoto:', error);
        void registrarErroAplicacao({
          origem: 'app.carregar-sessao',
          mensagem,
          stack: error instanceof Error ? error.stack : undefined,
        });
        if (ativo) setAcesso({ liberado: false, erro: mensagem });
      } finally {
        if (ativo) setVerificandoSessao(false);
      }
    };

    void supabase.auth.getSession().then(({ data }) => carregarSessao(data.session, true, true));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => {
      const proximoUsuarioId = value?.user.id ?? null;
      if (!deveRecarregarContextoDaSessao(event, usuarioCarregadoId.current, proximoUsuarioId)) {
        // Renova o objeto da sessão sem desmontar a página atual, seus modais
        // ou os campos que o operador ainda está preenchendo.
        if (value) setSession(value);
        return;
      }
      const trocouDeUsuario = Boolean(
        usuarioCarregadoId.current
        && proximoUsuarioId
        && usuarioCarregadoId.current !== proximoUsuarioId,
      );
      window.setTimeout(() => void carregarSessao(value, trocouDeUsuario, event === 'USER_UPDATED'), 0);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, [hydrateFromRemote]);

  // Uma suspensão manual entra em vigor sem exigir novo login. O banco já
  // bloqueia as operações imediatamente; esta verificação atualiza também a UI.
  useEffect(() => {
    if (!session || !acesso?.liberado) return;
    const revalidar = async () => {
      const lojaId = useStore.getState().lojaId;
      if (!lojaId) return;
      try {
        const estado = await consultarAcessoDaLoja(lojaId);
        if (!estado.liberado) setAcesso(estado);
      } catch (error) {
        console.error('Falha ao revalidar assinatura:', error);
        void registrarErroAplicacao({
          origem: 'app.revalidar-assinatura',
          mensagem: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };
    const intervalo = window.setInterval(() => void revalidar(), 60_000);
    const aoFocar = () => void revalidar();
    window.addEventListener('focus', aoFocar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', aoFocar);
    };
  }, [session, acesso?.liberado]);

  useEffect(() => {
    if (!acesso?.liberado) return;
    return iniciarSincronizacaoAutomatica();
  }, [acesso?.liberado]);

  if (verificandoSessao) {
    const isDark = tema === 'dark';
    return (
      <div className={`min-h-screen grid place-items-center ${isDark ? 'bg-black text-white' : 'bg-white text-gray-900'}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Verificando sessão…</span>
        </div>
      </div>
    );
  }

  if (!session && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (session && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }
  if (session && acesso && !acesso.liberado) {
    return <AcessoBloqueado acesso={acesso} tema={tema} />;
  }

  const content = {
    dashboard: <Dashboard onNavigate={(p: Page) => setPage(p)} />,
    pdv: <PDV />,
    entregas_pdv: <EntregasPDV />,
    produtos: <Produtos />,
    movimentacoes: <Movimentacoes />,
    compras: <Compras />,
    clientes: <Clientes />,
    ofertas: <Ofertas />,
    ponto: <PontoEletronico />,
    entregador: <AppEntregador />,
    mapa: <PainelMapa />,
    caixa: <Analises tipo="caixa" />,
    relatorios: <Relatorios />,
    historico: <Analises tipo="historico" />,
    abc: <Analises tipo="abc" />,
    qpr: <Analises tipo="qpr" />,
    alertas: <Analises tipo="alertas" />,
    backup: <Analises tipo="backup" />,
  }[page];

  const isDark = tema === 'dark';

  return (
    <>
      <ToastProvider />
      <div className="h-screen flex overflow-hidden">
        <Sidebar
          page={page}
          setPage={setPage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          tema={tema}
          toggleTema={toggleTema}
          alertas={alertas}
          entregasPendentes={entregasPendentes}
          role={currentRole}
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden lg:ml-64">
          <Topbar page={page} setMenuOpen={setMenuOpen} tema={tema} />
          <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${isDark ? 'bg-black' : 'bg-white'}`}>
            <Suspense fallback={<div className="grid min-h-48 place-items-center text-sm text-muted-foreground">Carregando módulo…</div>}>
              {pageBlocked ? <Analises tipo="caixa" /> : content}
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}

// ============ ROOT ============

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/acompanhar/:token" element={<AcompanharEntrega />} />
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
