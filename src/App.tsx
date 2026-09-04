import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3, Bell, Boxes, ChartNoAxesCombined, Clock3, Database, Gauge, MapPinned,
  Menu, Moon, Package, ShoppingCart, Sun, Truck, Users, Wallet, Wine, LogOut, Loader2
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useStore } from './lib/store';
import { carregarTudo } from './lib/sync';
import { processarFilaSync } from './lib/sync';
import { ToastProvider } from './lib/toast';
import { Login } from './Login';
import { Dashboard } from './pages/Dashboard';
import { PDV } from './pages/PDV';
import { EntregasPDV } from './pages/EntregasPDV';
import { Produtos } from './pages/Produtos';
import { Movimentacoes } from './pages/Movimentacoes';
import { Compras } from './pages/Compras';
import { Clientes } from './pages/Clientes';
import { Analises } from './pages/Analises';
import { PontoEletronico } from './PontoEletronico';
import { AppEntregador } from './AppEntregador';
import { PainelMapa } from './PainelMapa';
import { Termos } from './pages/Termos';
import { Privacidade } from './pages/Privacidade';

type Page = 'dashboard' | 'pdv' | 'entregas_pdv' | 'ponto' | 'entregador' | 'mapa' | 'produtos' | 'movimentacoes' | 'compras' | 'clientes' | 'caixa' | 'historico' | 'abc' | 'qpr' | 'alertas' | 'backup';

const nav: { group: string; items: { page: Page; label: string; icon: typeof Gauge }[] }[] = [
  { group: 'Visão Geral', items: [{ page: 'dashboard', label: 'Dashboard', icon: Gauge }] },
  { group: 'Vendas', items: [{ page: 'pdv', label: 'PDV', icon: ShoppingCart }, { page: 'entregas_pdv', label: 'Entregas', icon: Truck }, { page: 'historico', label: 'Histórico', icon: Clock3 }] },
  { group: 'Estoque', items: [{ page: 'produtos', label: 'Produtos', icon: Package }, { page: 'movimentacoes', label: 'Movimentações', icon: Boxes }, { page: 'compras', label: 'Compras', icon: ShoppingCart }] },
  { group: 'Pessoas', items: [{ page: 'clientes', label: 'Clientes', icon: Users }, { page: 'ponto', label: 'Ponto Eletrônico', icon: Clock3 }] },
  { group: 'Entregas', items: [{ page: 'entregador', label: 'App Entregador', icon: Truck }, { page: 'mapa', label: 'Rastreamento', icon: MapPinned }] },
  { group: 'Financeiro', items: [{ page: 'caixa', label: 'Caixa', icon: Wallet }] },
  { group: 'Análise', items: [{ page: 'abc', label: 'Curva ABC', icon: BarChart3 }, { page: 'qpr', label: 'Matriz QPR', icon: ChartNoAxesCombined }, { page: 'alertas', label: 'Alertas', icon: Bell }] },
  { group: 'Sistema', items: [{ page: 'backup', label: 'Backup', icon: Database }] },
];

const titles: Record<Page, string> = {
  dashboard: 'Dashboard', pdv: 'Ponto de Venda', entregas_pdv: 'PDV Entregas', ponto: 'Ponto Eletrônico', entregador: 'App do Entregador', mapa: 'Rastreamento de Entregas', produtos: 'Produtos', movimentacoes: 'Movimentações', compras: 'Compras Inteligentes', clientes: 'Clientes', caixa: 'Caixa', historico: 'Histórico de Vendas', abc: 'Curva ABC', qpr: 'Matriz QPR', alertas: 'Alertas', backup: 'Backup'
};

// ============ SIDEBAR ============

function Sidebar({
  page,
  setPage,
  menuOpen,
  setMenuOpen,
  tema,
  toggleTema,
  alertas,
  entregasPendentes
}: {
  page: Page;
  setPage: (p: Page) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  tema: 'light' | 'dark';
  toggleTema: () => void;
  alertas: number;
  entregasPendentes: number;
}) {
  const isDark = tema === 'dark';

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
          <Wine className="text-primary" size={24} strokeWidth={1.5} />
          <span className={`font-bold text-lg tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Órbita</span>
          <span className={`text-[10px] font-mono ml-auto ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>v1.0</span>
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
          {nav.map((group) => (
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
        <span className={`text-xs hidden md:block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
        </span>
      </div>
    </header>
  );
}

// ============ APP CONTENT ============

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const { tema, toggleTema, produtos, entregas, caixaAberto, hydrateFromRemote } = useStore();
  const location = useLocation();

  const alertas = produtos.filter(p => p.estoque <= p.estoqueMin).length;
  const entregasPendentes = entregas.filter(e => e.status === 'pendente').length;
  const pageBlocked = !caixaAberto && (page === 'pdv' || page === 'entregas_pdv' || page === 'entregador');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setVerificandoSessao(false);
      if (data.session) {
        try {
          const remoto = await carregarTudo();
          if (remoto) hydrateFromRemote(remoto);
        } catch (_) {}
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, value) => {
      setSession(value);
      if (value) {
        try {
          const remoto = await carregarTudo();
          if (remoto) hydrateFromRemote(remoto);
        } catch (_) {}
      }
    });

    return () => subscription.unsubscribe();
  }, [tema, hydrateFromRemote]);

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

  const content = {
    dashboard: <Dashboard onNavigate={(p: Page) => setPage(p)} />,
    pdv: <PDV />,
    entregas_pdv: <EntregasPDV />,
    produtos: <Produtos />,
    movimentacoes: <Movimentacoes />,
    compras: <Compras />,
    clientes: <Clientes />,
    ponto: <PontoEletronico />,
    entregador: <AppEntregador />,
    mapa: <PainelMapa />,
    caixa: <Analises tipo="caixa" />,
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
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden lg:ml-64">
          <Topbar page={page} setMenuOpen={setMenuOpen} tema={tema} />
          <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${isDark ? 'bg-black' : 'bg-white'}`}>
            {pageBlocked ? <Analises tipo="caixa" /> : content}
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
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}