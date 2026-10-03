import { useState, useMemo } from 'react'
import { useStore, fmtR, cortarData } from '../lib/store'
import { hojeBRT } from '../lib/dateBR'
import { lucroDoPeriodo } from '../lib/lucro'
import { calcularValorEstoque } from '../lib/inventoryValue'
import {
  chaveMesDaData,
  dentroDoIntervalo,
  formatarMes,
  intervaloAnterior,
  intervaloDashboard,
  ultimosMeses,
  type PeriodoDashboard,
} from '../lib/dashboardPeriods'
import { motion, type Variants } from 'motion/react'
import {
  Package,
  Coins,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  RefreshCw,
  DollarSign,
  type LucideIcon,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'

// ============================================================
// 1. COMPONENTE KPI CARD (reutilizável com glassmorphism)
// ============================================================
const KpiCard = ({
  label,
  value,
  sub,
  icon: Icon,
  color,
  variation,
}: {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  color: string
  variation?: { value: number; label: string } | null
}) => {
  const isPositive = variation ? variation.value >= 0 : false

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
      }}
      className={`
        group p-5 flex items-center gap-4 rounded-xl
        bg-white/60 dark:bg-white/5 backdrop-blur-sm
        border border-white/20 dark:border-white/10
        shadow-sm dark:shadow-none
        transition-all duration-300
        hover:bg-white/80 dark:hover:bg-white/10
        hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20
        hover:scale-[1.02]
      `}
    >
      <div className={`p-2.5 rounded-full bg-slate-100/80 dark:bg-white/5 ${color}`}>
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-500 dark:text-white/50 uppercase tracking-wider">
          {label}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="text-2xl font-semibold text-slate-900 dark:text-white">
            {value}
          </div>
          {variation && (
            <span
              className={`text-xs font-medium ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? '↑' : '↓'} {Math.abs(variation.value).toFixed(1)}%
              <span className="text-slate-400 dark:text-white/40 font-normal ml-0.5">
                {variation.label}
              </span>
            </span>
          )}
        </div>
        {sub && <div className="text-xs text-slate-400 dark:text-white/40">{sub}</div>}
      </div>
    </motion.div>
  )
}

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================
type DashboardDestination = 'compras' | 'produtos' | 'clientes' | 'alertas'

export function Dashboard({ onNavigate }: { onNavigate?: (page: DashboardDestination) => void }) {
  const { produtos, vendas, caixaEntradas, clientes } = useStore()

  // --- Estado de filtro de período ---
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('hoje')
  const hoje = hojeBRT()
  const [mesHistorico, setMesHistorico] = useState(chaveMesDaData(hoje))
  const [recarregando, setRecarregando] = useState(false)

  const handleRefresh = () => {
    setRecarregando(true)
    setTimeout(() => setRecarregando(false), 400)
  }

  // Períodos civis no horário de Brasília: semana começa na segunda e mês no dia 1.
  const intervalo = useMemo(
    () => intervaloDashboard(periodo, hoje, mesHistorico),
    [periodo, hoje, mesHistorico],
  )

  // --- Filtro de vendas por período ---
  const vendasFiltradas = useMemo(() => {
    return vendas.filter(v => dentroDoIntervalo(v.data, intervalo))
  }, [vendas, intervalo])

  // --- Cálculos principais ---
  const receitaPeriodo = vendasFiltradas.reduce((s, v) => s + v.total, 0)
  const valorEstoque = useMemo(() => calcularValorEstoque(produtos), [produtos])
  const criticos = produtos.filter(p => p.estoque <= p.estoqueMin)

  // Lucro líquido = Receita do período - CMV (custo dos itens vendidos).
  // Mesma fórmula usada no fechamento de caixa.
  const lucroLiquidoPeriodo = useMemo(() => {
    return lucroDoPeriodo(vendasFiltradas, produtos, caixaEntradas).lucro
  }, [vendasFiltradas, produtos, caixaEntradas])

  // Comparação para variação percentual
  const variacaoReceita = useMemo(() => {
    if (periodo === 'historico') return null
    const anterior = intervaloAnterior(periodo, intervalo)
    const receitaAnterior = vendas
      .filter(v => v.pagamento !== 'fiado' && dentroDoIntervalo(v.data, anterior))
      .reduce((s, v) => s + v.total, 0)
    return receitaAnterior > 0
      ? { value: ((receitaPeriodo - receitaAnterior) / receitaAnterior) * 100, label: anterior.rotulo }
      : null
  }, [vendas, periodo, intervalo, receitaPeriodo])

  const historicoMensal = useMemo(() => {
    return ultimosMeses(hoje).map(chave => {
      const vendasMes = vendas.filter(v => chaveMesDaData(v.data) === chave)
      const resultado = lucroDoPeriodo(vendasMes, produtos, caixaEntradas)
      return {
        chave,
        mes: formatarMes(chave),
        label: formatarMes(chave).replace(/ de /, '/').slice(0, 8),
        vendas: vendasMes.length,
        receita: resultado.receita,
        lucro: resultado.lucro,
        ticket: vendasMes.length ? resultado.receita / vendasMes.length : 0,
      }
    })
  }, [hoje, vendas, produtos, caixaEntradas])

  // --- Top 5 do período selecionado ---
  const topMap: Record<string, number> = {}
  vendasFiltradas.forEach(v =>
    v.itens.forEach(i => {
      topMap[i.produtoId] = (topMap[i.produtoId] || 0) + i.quantidade
    })
  )
  const top5 = Object.entries(topMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // --- Insights ---
  const insights: { tipo: string; msg: string; acao?: string; onClick?: () => void }[] = []
  criticos.forEach(p => {
    insights.push({
      tipo: 'critical',
      msg: `${p.nome} está com estoque crítico (${p.estoque} un).`,
      acao: 'Repor',
      onClick: () => onNavigate?.('compras'),
    })
  })
  const parados = produtos.filter(p => {
    const corte = cortarData(30)
    const vendeu = vendas
      .filter(v => !corte || v.data >= corte)
      .some(v => v.itens.find(i => i.produtoId === p.id))
    return !vendeu && p.estoque > 0
  })
  parados.slice(0, 2).forEach(p => {
    insights.push({
      tipo: 'warning',
      msg: `${p.nome} parado há 30 dias (${p.estoque} un).`,
      acao: 'Promoção',
      onClick: () => onNavigate?.('produtos'),
    })
  })
  clientes.filter(c => c.saldo > c.limite * 0.9).forEach(c => {
    insights.push({
      tipo: 'warning',
      msg: `${c.nome} com ${Math.round((c.saldo / c.limite) * 100)}% do limite.`,
      acao: 'Ver cliente',
      onClick: () => onNavigate?.('clientes'),
    })
  })

  // --- Rentabilidade (top 5 margem) ---
  const produtosComMargem = produtos
    .map(p => {
      const tax = (p.imposto || 0) / 100
      const com = (p.comissao || 0) / 100
      const custo =
        p.precoCompra +
        (p.frete || 0) +
        p.precoCompra * tax +
        p.precoVenda * com
      const margem =
        p.precoVenda > 0 ? ((p.precoVenda - custo) / p.precoVenda) * 100 : 0
      return { ...p, margem }
    })
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 5)

  // --- Dados para o gráfico (últimos 7 dias - apenas vendas liquidadas) ---
  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const key = hojeBRT(d)
      const total = vendas
        .filter(v => v.data === key && v.pagamento !== 'fiado')
        .reduce((s, v) => s + v.total, 0)
      return {
        dia: key,
        total,
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
      }
    })
  }, [vendas])

  const maxQty = top5.length ? Math.max(...top5.map(([, qty]) => qty)) : 1

  // ============================================================
  // ANIMAÇÕES (stagger em cascata)
  // ============================================================
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-slate-50 dark:bg-black transition-colors duration-300"
    >
      <div className="p-4 md:p-6 space-y-6">
        {/* Cabeçalho */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Dashboard</h1>
          <div className="flex items-center gap-2">
            {/* Seletor de período */}
            <div className="flex items-center gap-1 bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-lg p-1">
              {(['hoje', 'semana', 'mes', 'historico'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                    periodo === p
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-600 dark:text-white/70 hover:bg-white/20 dark:hover:bg-white/10'
                  }`}
                >
                  {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : 'Histórico'}
                </button>
              ))}
            </div>

            {periodo === 'historico' && (
              <input
                type="month"
                value={mesHistorico}
                max={chaveMesDaData(hoje)}
                onChange={event => setMesHistorico(event.target.value || chaveMesDaData(hoje))}
                aria-label="Mês histórico"
                className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            )}

            {/* Botão atualizar */}
            <button
              onClick={handleRefresh}
              title="Atualizar dados"
              className="p-2 rounded-lg bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw
                size={16}
                className={`text-slate-500 dark:text-white/70 ${recarregando ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </motion.div>

        {/* KPIs */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
        >
          <KpiCard
            label="Produtos"
            value={produtos.length}
            sub={`${valorEstoque.quantidadeFisica.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un físicas em estoque`}
            icon={Package}
            color="text-indigo-500 dark:text-indigo-400"
          />
          <KpiCard
            label="Valor em Estoque"
            value={fmtR(valorEstoque.valorCusto)}
            sub={`Potencial de lucro: ${fmtR(valorEstoque.lucroPotencial)}`}
            icon={Coins}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <KpiCard
            label={periodo === 'hoje' ? 'Vendas Hoje' : periodo === 'semana' ? 'Vendas Semana' : periodo === 'mes' ? 'Vendas Mês' : `Vendas · ${intervalo.rotulo}`}
            value={vendasFiltradas.length}
            sub={fmtR(receitaPeriodo)}
            icon={ShoppingCart}
            color="text-amber-600 dark:text-amber-400"
            variation={variacaoReceita}
          />
          <KpiCard
            label={periodo === 'hoje' ? 'Lucro Líquido Hoje' : periodo === 'semana' ? 'Lucro Líquido Semana' : periodo === 'mes' ? 'Lucro Líquido Mês' : `Lucro · ${intervalo.rotulo}`}
            value={fmtR(lucroLiquidoPeriodo)}
            sub={`CMV: -${fmtR(Math.max(0, receitaPeriodo - lucroLiquidoPeriodo))}`}
            icon={DollarSign}
            color={
              lucroLiquidoPeriodo >= 0
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-rose-600 dark:text-rose-400'
            }
          />
          <KpiCard
            label="Críticos"
            value={criticos.length}
            sub={criticos.length ? 'Abaixo do mínimo' : 'Estoque regular'}
            icon={AlertTriangle}
            color={
              criticos.length
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }
          />
        </motion.div>

        {/* Gráfico + Top 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            variants={itemVariants}
            className="col-span-1 lg:col-span-2 p-4 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm dark:shadow-none transition-all hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-white/90 flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-amber-500" />
              Vendas (últimos 7 dias)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.3} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => fmtR(v)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value) => fmtR(Number(value) || 0)}
                  contentStyle={{
                    background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#EAB308"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#EAB308' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="p-4 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm dark:shadow-none transition-all hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-white/90 flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-amber-500" />
              {periodo === 'hoje' ? 'Top 5 de Hoje' : periodo === 'semana' ? 'Top 5 da Semana' : periodo === 'mes' ? 'Top 5 do Mês' : `Top 5 · ${intervalo.rotulo}`}
            </h3>
            {top5.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">
                Nenhuma venda registrada {periodo === 'hoje' ? 'hoje' : periodo === 'semana' ? 'na semana' : `em ${intervalo.rotulo.toLocaleLowerCase('pt-BR')}`}.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {top5.map(([id, qty]) => {
                  const p = produtos.find(x => x.id === id)
                  if (!p) return null
                  const percent = (qty / maxQty) * 100
                  return (
                    <div key={id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700 dark:text-white/80 truncate">{p.nome}</span>
                        <span className="font-mono text-slate-900 dark:text-white font-medium">
                          {qty}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Histórico persistente calculado das vendas armazenadas */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-white/20 bg-white/60 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-white/90">
                <BarChart3 size={16} className="text-amber-500" />
                Histórico de desempenho
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                Os dados não são zerados: este painel recompõe os últimos 12 meses pelas vendas salvas.
              </p>
            </div>
            <button
              onClick={() => { setPeriodo('historico'); setMesHistorico(historicoMensal.at(-2)?.chave || chaveMesDaData(hoje)) }}
              className="text-xs font-semibold text-amber-600 transition hover:text-amber-700 dark:text-amber-400"
            >
              Consultar mês anterior
            </button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historicoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtR(v)} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={58} />
                  <Tooltip formatter={(value) => fmtR(Number(value) || 0)} labelFormatter={(_, payload) => payload?.[0]?.payload?.mes || ''} />
                  <Bar dataKey="receita" name="Faturamento" fill="#EAB308" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200/70 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-white/60">
                  <tr><th className="p-2">Mês</th><th className="p-2 text-right">Vendas</th><th className="p-2 text-right">Receita</th><th className="p-2 text-right">Ticket</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-white/10">
                  {[...historicoMensal].reverse().map(item => (
                    <tr key={item.chave} className="cursor-pointer hover:bg-amber-50/70 dark:hover:bg-amber-500/10" onClick={() => { setPeriodo('historico'); setMesHistorico(item.chave) }}>
                      <td className="p-2 font-medium capitalize text-slate-700 dark:text-white/80">{item.mes}</td>
                      <td className="p-2 text-right">{item.vendas}</td>
                      <td className="p-2 text-right font-medium">{fmtR(item.receita)}</td>
                      <td className="p-2 text-right">{fmtR(item.ticket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Assistente + Rentabilidade */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            variants={itemVariants}
            className="col-span-1 lg:col-span-2 p-4 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm dark:shadow-none transition-all hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-white/90 flex items-center gap-2">
                <BarChart3 size={16} className="text-amber-500" />
                Insights
              </h3>
              {insights.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/70">
                  {insights.length} alertas
                </span>
              )}
            </div>

            {insights.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">
                Tudo em ordem. Nenhum alerta no momento.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {insights.slice(0, 4).map((ins, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-2.5 rounded-lg border-l-2 ${
                      ins.tipo === 'critical'
                        ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-500/10'
                        : 'border-amber-500 bg-amber-50/70 dark:bg-amber-500/10'
                    }`}
                  >
                    <span className="text-sm text-slate-700 dark:text-white/80">
                      {ins.msg}
                    </span>
                    {ins.acao && (
                      <button
                        onClick={ins.onClick}
                        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors ml-2 whitespace-nowrap cursor-pointer"
                      >
                        {ins.acao}
                      </button>
                    )}
                  </div>
                ))}
                {insights.length > 4 && (
                  <button
                    onClick={() => onNavigate?.('alertas')}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors self-start mt-1 cursor-pointer"
                  >
                    Ver mais {insights.length - 4} alertas
                  </button>
                )}
              </div>
            )}
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="p-4 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-sm dark:shadow-none transition-all hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-white/90 flex items-center gap-2 mb-3">
              <Coins size={16} className="text-amber-500" />
              Margem por Produto
            </h3>
            <div className="flex flex-col gap-3">
              {produtosComMargem.map(p => {
                const cor =
                  p.margem > 30
                    ? 'bg-emerald-500'
                    : p.margem > 15
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-white/80 truncate">{p.nome}</span>
                      <span className="font-mono text-slate-900 dark:text-white font-medium">
                        {p.margem.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cor} rounded-full`}
                        style={{ width: `${Math.min(p.margem, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
