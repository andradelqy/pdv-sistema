import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  BarChart3, Bell, Boxes, ChartNoAxesCombined, Clock3, Database, Gauge, MapPinned,
  Menu, Moon, Package, ShoppingCart, Sun, Truck, Users, Wallet, Wine
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import { carregarTudo, migrarDoLocalStorage } from './lib/sync'
import { toast, ToastProvider } from './lib/toast'
import { Login } from './Login'
import { Dashboard } from './pages/Dashboard'
import { PDV } from './pages/PDV'
import { EntregasPDV } from './pages/EntregasPDV'
import { Produtos } from './pages/Produtos'
import { Movimentacoes } from './pages/Movimentacoes'
import { Compras } from './pages/Compras'
import { Clientes } from './pages/Clientes'
import { Analises } from './pages/Analises'
import { PontoEletronico } from './PontoEletronico'
import { AppEntregador } from './AppEntregador'
import { PainelMapa } from './PainelMapa'

type Page = 'dashboard' | 'pdv' | 'entregas_pdv' | 'ponto' | 'entregador' | 'mapa' | 'produtos' | 'movimentacoes' | 'compras' | 'clientes' | 'caixa' | 'historico' | 'abc' | 'qpr' | 'alertas' | 'backup'

const nav: { group: string; items: { page: Page; label: string; icon: typeof Gauge }[] }[] = [
  { group: 'Visão Geral', items: [{ page: 'dashboard', label: 'Dashboard', icon: Gauge }] },
  { group: 'Vendas', items: [{ page: 'pdv', label: 'PDV', icon: ShoppingCart }, { page: 'entregas_pdv', label: 'Entregas', icon: Truck }, { page: 'historico', label: 'Histórico', icon: Clock3 }] },
  { group: 'Estoque', items: [{ page: 'produtos', label: 'Produtos', icon: Package }, { page: 'movimentacoes', label: 'Movimentações', icon: Boxes }, { page: 'compras', label: 'Compras', icon: ShoppingCart }] },
  { group: 'Pessoas', items: [{ page: 'clientes', label: 'Clientes', icon: Users }, { page: 'ponto', label: 'Ponto Eletrônico', icon: Clock3 }] },
  { group: 'Entregas', items: [{ page: 'entregador', label: 'App Entregador', icon: Truck }, { page: 'mapa', label: 'Rastreamento', icon: MapPinned }] },
  { group: 'Financeiro', items: [{ page: 'caixa', label: 'Caixa', icon: Wallet }] },
  { group: 'Análise', items: [{ page: 'abc', label: 'Curva ABC', icon: BarChart3 }, { page: 'qpr', label: 'Matriz QPR', icon: ChartNoAxesCombined }, { page: 'alertas', label: 'Alertas', icon: Bell }] },
  { group: 'Sistema', items: [{ page: 'backup', label: 'Backup', icon: Database }] },
]

const titles: Record<Page, string> = {
  dashboard: 'Dashboard', pdv: 'Ponto de Venda', entregas_pdv: 'PDV Entregas', ponto: 'Ponto Eletrônico', entregador: 'App do Entregador', mapa: 'Rastreamento de Entregas', produtos: 'Produtos', movimentacoes: 'Movimentações', compras: 'Compras Inteligentes', clientes: 'Clientes', caixa: 'Caixa', historico: 'Histórico de Vendas', abc: 'Curva ABC', qpr: 'Matriz QPR', alertas: 'Alertas', backup: 'Backup'
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [page, setPage] = useState<Page>('caixa')
  const [menuOpen, setMenuOpen] = useState(false)
  const [migrando, setMigrando] = useState(false)
  const { tema, toggleTema, produtos, entregas, caixaAberto, hydrateFromRemote } = useStore()
  const alertas = produtos.filter(p => p.estoque <= p.estoqueMin).length
  const entregasPendentes = entregas.filter(e => e.status === 'pendente').length
  const pageBlocked = !caixaAberto && (page === 'pdv' || page === 'entregas_pdv' || page === 'entregador')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) {
        try {
          const remoto = await carregarTudo()
          if (remoto) hydrateFromRemote(remoto)
        } catch (_) { /* fallback localStorage */ }
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, value) => {
      setSession(value)
      if (value) {
        try {
          const remoto = await carregarTudo()
          if (remoto) hydrateFromRemote(remoto)
        } catch (_) { /* fallback localStorage */ }
      }
    })
    return () => subscription.unsubscribe()
  }, [tema, hydrateFromRemote])

  if (!session) return <Login />

  const handleMigrar = async () => {
    if (!confirm('Migrar dados locais deste navegador para o Supabase agora?')) return
    setMigrando(true)
    try {
      const raw = localStorage.getItem('adega-pro-store')
      const state = raw ? JSON.parse(raw)?.state : null
      if (!state) {
        toast('Nenhum dado local encontrado', 'warning')
        return
      }
      const result = await migrarDoLocalStorage({
        produtos: state.produtos || [],
        movimentacoes: state.movimentacoes || [],
        vendas: state.vendas || [],
        clientes: state.clientes || [],
        caixaEntradas: state.caixaEntradas || [],
        caixas: state.caixas || [],
        entregas: state.entregas || [],
      })
      if (!result.ok) throw new Error(result.erro)
      localStorage.setItem('adega-pro-migrado-supabase', new Date().toISOString())
      toast('Migração concluída')
    } catch (e: any) {
      toast(e?.message || 'Falha ao migrar', 'danger')
    } finally {
      setMigrando(false)
    }
  }

  const content = {
    dashboard: <Dashboard onNavigate={(p: Page) => setPage(p)} />, pdv: <PDV />, entregas_pdv: <EntregasPDV />, produtos: <Produtos />, movimentacoes: <Movimentacoes />, compras: <Compras />, clientes: <Clientes />,
    ponto: <PontoEletronico />, entregador: <AppEntregador />, mapa: <PainelMapa />,
    caixa: <Analises tipo="caixa" />, historico: <Analises tipo="historico" />, abc: <Analises tipo="abc" />, qpr: <Analises tipo="qpr" />, alertas: <Analises tipo="alertas" />, backup: <Analises tipo="backup" />,
  }[page]

  return <div className="min-h-screen bg-background text-foreground">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="sidebar-brand"><Wine className="text-primary mb-1" size={25} /><div className="text-sm font-bold text-white uppercase tracking-wider">Adega's</div><div className="text-[10px] text-[hsl(var(--sidebar-text))] uppercase tracking-wider">Gestor · v1.0</div></div>
      <nav className="sidebar-nav">{nav.map(group => <div key={group.group}><div className="nav-group-label">{group.group}</div>{group.items.map(item => { const Icon = item.icon; return <button key={item.page} onClick={() => { setPage(item.page); setMenuOpen(false) }} className={`nav-item w-full text-left ${page === item.page ? 'active' : ''}`}><Icon />{item.label}{item.page === 'alertas' && alertas > 0 && <span className="nav-badge">{alertas}</span>}{item.page === 'entregas_pdv' && entregasPendentes > 0 && <span className="nav-badge bg-amber-500 text-white">{entregasPendentes}</span>}</button> })}</div>)}</nav>
      <div className="sidebar-footer"><button onClick={toggleTema} className="flex items-center gap-2 text-xs text-[hsl(var(--sidebar-text))] hover:text-white"><span>{tema === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span>{tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</button></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><button onClick={() => setMenuOpen(x => !x)} className="lg:hidden p-2 rounded hover:bg-muted"><Menu size={19} /></button><h1 className="font-semibold text-base">{titles[page]}</h1><button onClick={handleMigrar} disabled={migrando} className="ml-auto px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-60">{migrando ? 'Migrando...' : 'Migrar p/ Supabase'}</button><div className="text-xs font-mono text-muted-foreground hidden sm:block">{new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</div><button onClick={() => supabase.auth.signOut()} className="px-3 py-1.5 text-xs font-semibold bg-destructive text-destructive-foreground rounded-lg hover:opacity-90">Sair</button></header><main className="p-4 md:p-5">{pageBlocked ? <Analises tipo="caixa" /> : content}</main></div><ToastProvider />
  </div>
}
