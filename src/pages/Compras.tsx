import { useState, useMemo } from 'react'
import { useStore, fmtR, cortarData, hoje } from '../lib/store'
import { toast } from '../lib/toast'
import { motion } from 'motion/react'
import {
  Wand2,
  PackagePlus,
  Copy,
  Building2,
  AlertTriangle,
} from 'lucide-react'

type Recomendacao = {
  id: string
  nome: string
  sku: string
  categoria?: string
  fornecedor: string
  estoque: number
  estoqueMin: number
  pontoPedido: number
  leadTime: number
  demandaDiaria: number
  diasEstoque: number
  classeAbc: 'A' | 'B' | 'C'
  necessidade: number
  sugerido: number
  custoUnit: number
  custoTotal: number
  urgencia: boolean
  critico: boolean
}

// ============================================================
// 1. ANIMAÇÕES
// ============================================================
const containerVariants: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}

const itemVariants: any = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
}

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================
export function Compras() {
  const { produtos, movimentacoes, addMovimentacao, addCaixaEntrada } = useStore()

  // Filtros e parâmetros
  const [periodo, setPeriodo] = useState<number>(30)
  const [orcamento, setOrcamento] = useState<string>('')
  const [seguranca, setSeguranca] = useState<number>(5)
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos')
  const [apenasUrgentes, setApenasUrgentes] = useState<boolean>(false)

  // Itens calculados e editáveis
  const [itens, setItens] = useState<Recomendacao[]>([])
  const [calculado, setCalculado] = useState<boolean>(false)
  const [processando, setProcessando] = useState<boolean>(false)

  // Lista única de fornecedores
  const fornecedores = useMemo(() => {
    const setF = new Set(produtos.map(p => p.fornecedor || 'Sem Fornecedor'))
    return Array.from(setF)
  }, [produtos])

  function calcular() {
    const orc = parseFloat(orcamento) || Infinity
    const corte = cortarData(periodo)
    const movsSaida = movimentacoes.filter(m => m.tipo === 'saida' && (!corte || m.data >= corte))

    // 1. Demanda total do período
    const demandaTotalMap: Record<string, number> = {}
    produtos.forEach(p => { demandaTotalMap[p.id] = 0 })
    movsSaida.forEach(m => {
      if (demandaTotalMap[m.produtoId] !== undefined) {
        demandaTotalMap[m.produtoId] += m.quantidade
      }
    })

    // 2. Classificação Curva ABC por receita vendida
    const receitaMap = produtos.map(p => ({
      id: p.id,
      receita: (demandaTotalMap[p.id] || 0) * p.precoVenda,
    })).sort((a, b) => b.receita - a.receita)

    const receitaTotal = receitaMap.reduce((s, x) => s + x.receita, 0)
    let acumulado = 0
    const abcMap: Record<string, 'A' | 'B' | 'C'> = {}
    receitaMap.forEach(item => {
      const pct = receitaTotal > 0 ? (item.receita / receitaTotal) * 100 : 0
      acumulado += pct
      abcMap[item.id] = acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C'
    })

    // 3. Cálculo de necessidade e score de prioridade
    const calculados = produtos.map(p => {
      const totalVendido = demandaTotalMap[p.id] || 0
      const demandaDiaria = totalVendido / periodo
      const tempoReposicao = (p.leadTime || 3) + seguranca
      const estoqueAlvo = Math.ceil(demandaDiaria * tempoReposicao + p.estoqueMin)
      const necessidade = Math.max(0, estoqueAlvo - p.estoque)

      const diasEstoque = demandaDiaria > 0 ? p.estoque / demandaDiaria : (p.estoque > 0 ? 999 : 0)
      const urgencia = diasEstoque <= tempoReposicao
      const critico = p.estoque <= p.estoqueMin
      const classeAbc = abcMap[p.id] || 'C'

      let score = 0
      if (critico) score += 120
      if (urgencia) score += 80
      if (classeAbc === 'A') score += 50
      if (classeAbc === 'B') score += 25
      if (necessidade > 0) score += 20

      return {
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        categoria: p.categoria,
        fornecedor: p.fornecedor || 'Sem Fornecedor',
        estoque: p.estoque,
        estoqueMin: p.estoqueMin,
        pontoPedido: p.pontoPedido,
        leadTime: p.leadTime || 3,
        demandaDiaria,
        diasEstoque,
        classeAbc,
        necessidade,
        sugerido: necessidade,
        custoUnit: p.precoCompra,
        custoTotal: necessidade * p.precoCompra,
        urgencia,
        critico,
        score,
      }
    }).sort((a, b) => b.score - a.score)

    // 4. Rateio com base no orçamento (se informado)
    let saldo = orc
    const resultado: Recomendacao[] = []

    for (const item of calculados) {
      if (item.necessidade <= 0) continue

      let qtd = item.necessidade
      if (orc !== Infinity) {
        const custoTotalItem = qtd * item.custoUnit
        if (custoTotalItem > saldo) {
          qtd = Math.floor(saldo / item.custoUnit)
        }
      }

      if (qtd > 0 || orc === Infinity) {
        resultado.push({
          ...item,
          sugerido: qtd,
          custoTotal: qtd * item.custoUnit,
        })
        saldo -= qtd * item.custoUnit
      }
    }

    setItens(resultado)
    setCalculado(true)
    toast(`${resultado.length} itens recomendados para compra.`)
  }

  // Atualizar quantidade de um item manualmente
  function handleQtdChange(id: string, novaQtd: number) {
    setItens(prev =>
      prev.map(it =>
        it.id === id
          ? {
              ...it,
              sugerido: Math.max(0, novaQtd),
              custoTotal: Math.max(0, novaQtd) * it.custoUnit,
            }
          : it
      )
    )
  }

  // Filtragem na visualização
  const itensExibidos = useMemo(() => {
    return itens.filter(it => {
      const matchFornec = fornecedorFiltro === 'todos' || it.fornecedor === fornecedorFiltro
      const matchUrgente = !apenasUrgentes || it.urgencia || it.critico
      return matchFornec && matchUrgente
    })
  }, [itens, fornecedorFiltro, apenasUrgentes])

  // Métricas dos itens exibidos
  const totalCustoExibido = itensExibidos.reduce((s, it) => s + it.custoTotal, 0)
  const totalUnidadesExibidas = itensExibidos.reduce((s, it) => s + it.sugerido, 0)
  const totalCriticos = itensExibidos.filter(it => it.critico).length

  // 1. Exportar pedido formatado para WhatsApp
  function copiarParaWhatsApp() {
    if (itensExibidos.length === 0) {
      toast('Nenhum item na lista para exportar', 'warning')
      return
    }

    const fornecTxt = fornecedorFiltro !== 'todos' ? ` - ${fornecedorFiltro}` : ''
    let msg = `📋 *PEDIDO DE COMPRA DE ESTOQUE${fornecTxt}*\nData: ${new Date().toLocaleDateString('pt-BR')}\n\n`

    itensExibidos.forEach((it, idx) => {
      if (it.sugerido > 0) {
        msg += `${idx + 1}. *${it.nome}* (SKU: ${it.sku})\n   Qtd: ${it.sugerido} un | Unit: ${fmtR(it.custoUnit)} | Subtotal: ${fmtR(it.custoTotal)}\n`
      }
    })

    msg += `\n💰 *Total Estimado: ${fmtR(totalCustoExibido)}*`
    msg += `\n📦 *Total de Itens: ${totalUnidadesExibidas} un*`

    navigator.clipboard.writeText(msg)
    toast('Pedido copiado! Cole no WhatsApp do fornecedor.')
  }

  // 2. Dar entrada no estoque e debitar no caixa em 1 clique
  function confirmarEntradaEstoque() {
    const itensParaEntrada = itensExibidos.filter(it => it.sugerido > 0)
    if (itensParaEntrada.length === 0) {
      toast('Nenhum item com quantidade para dar entrada', 'warning')
      return
    }

    if (!confirm(`Confirma a entrada de ${totalUnidadesExibidas} unidades no estoque totalizando ${fmtR(totalCustoExibido)}?`)) {
      return
    }

    setProcessando(true)

    itensParaEntrada.forEach(it => {
      addMovimentacao({
        produtoId: it.id,
        tipo: 'entrada',
        quantidade: it.sugerido,
        data: hoje(),
        obs: `Compra Inteligente: ${it.fornecedor}`,
      })
    })

    addCaixaEntrada({
      tipo: 'sangria',
      valor: totalCustoExibido,
      data: hoje(),
      descricao: `Compra Estoque (${itensParaEntrada.length} itens)`,
    })

    setProcessando(false)
    toast('Entrada de estoque e lançamento no caixa realizados!', 'success')

    setItens(prev => prev.filter(it => !itensParaEntrada.some(p => p.id === it.id)))
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
        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Wand2 className="text-amber-500" size={24} />
              Compras Inteligentes
            </h2>
            <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">
              Previsão com base em giro diário, prazo de fornecedores, curva ABC e ponto de pedido.
            </p>
          </div>

          {calculado && itens.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={copiarParaWhatsApp}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition active:scale-95 cursor-pointer shadow-sm"
                title="Copiar texto formatado para envio"
              >
                <Copy size={15} /> Copiar p/ WhatsApp
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={confirmarEntradaEstoque}
                disabled={processando || totalUnidadesExibidas === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                title="Dar entrada no estoque e registrar no caixa"
              >
                <PackagePlus size={15} /> Dar Entrada no Estoque
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* Painel de Parâmetros */}
        <motion.div
          variants={itemVariants}
          className="card-adega p-5 bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider block mb-1.5">
                Histórico de Vendas
              </label>
              <select
                className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-black/40 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 transition-all duration-200 hover:border-amber-500/50"
                value={periodo}
                onChange={e => setPeriodo(parseInt(e.target.value))}
              >
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias (Padrão)</option>
                <option value={60}>Últimos 60 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider block mb-1.5">
                Orçamento Disponível (R$)
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-black/40 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 transition-all duration-200 hover:border-amber-500/50 placeholder:text-slate-400"
                value={orcamento}
                onChange={e => setOrcamento(e.target.value)}
                placeholder="Ilimitado ou R$..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider block mb-1.5">
                Margem de Segurança (Dias)
              </label>
              <input
                type="number"
                min={0}
                className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-black/40 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 transition-all duration-200 hover:border-amber-500/50"
                value={seguranca}
                onChange={e => setSeguranca(parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="flex items-end">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={calcular}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Wand2 size={16} /> Calcular Reposição
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Resultados e Tabela */}
        {calculado && (
          <>
            {/* Métricas Principais */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {[
                {
                  label: 'Itens a Comprar',
                  value: `${itensExibidos.length} (${totalUnidadesExibidas} un)`,
                  color: 'text-slate-900 dark:text-white',
                },
                {
                  label: 'Total do Pedido',
                  value: fmtR(totalCustoExibido),
                  color: 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'Saldo do Orçamento',
                  value: orcamento ? fmtR(Math.max(0, parseFloat(orcamento) - totalCustoExibido)) : '—',
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Itens Críticos',
                  value: totalCriticos,
                  color: 'text-rose-600 dark:text-rose-400',
                },
              ].map((metric, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  className="p-4 rounded-xl bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 transition-all duration-300 hover:shadow-md"
                >
                  <div className="text-xs text-slate-500 dark:text-white/50 uppercase">{metric.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${metric.color}`}>
                    {metric.value}
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Barra de Filtros e Agrupamento */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/50 dark:bg-white/5 rounded-xl border border-white/10"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/60">
                  <Building2 size={15} /> Fornecedor:
                </div>
                <select
                  value={fornecedorFiltro}
                  onChange={e => setFornecedorFiltro(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/60 text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 transition-all duration-200 hover:border-amber-500/50"
                >
                  <option value="todos">Todos ({itens.length})</option>
                  {fornecedores.map(f => (
                    <option key={f} value={f}>
                      {f} ({itens.filter(i => i.fornecedor === f).length})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-white/80 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={apenasUrgentes}
                    onChange={e => setApenasUrgentes(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 transition-all duration-200"
                  />
                  Apenas críticos / urgentes
                </label>
              </div>
            </motion.div>

            {/* Tabela de Produtos */}
            {itensExibidos.length === 0 ? (
              <motion.div
                variants={itemVariants}
                className="card-adega p-10 text-center text-slate-500 dark:text-white/50 bg-white/40 dark:bg-white/5 rounded-2xl"
              >
                Nenhum produto precisando de reposição com os filtros atuais.
              </motion.div>
            ) : (
              <motion.div
                variants={itemVariants}
                className="card-adega overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-sm"
              >
                <div className="overflow-x-auto">
                  <table className="tbl-adega w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-xs text-slate-500 dark:text-white/60 uppercase">
                        <th className="p-3.5">Produto / Fornecedor</th>
                        <th className="p-3.5">Curva ABC</th>
                        <th className="p-3.5">Estoque Atual</th>
                        <th className="p-3.5">Giro Diário</th>
                        <th className="p-3.5">Cobertura</th>
                        <th className="p-3.5">Qtd Sugerida</th>
                        <th className="p-3.5">Custo Un.</th>
                        <th className="p-3.5">Total</th>
                        <th className="p-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {itensExibidos.map((r, idx) => (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03, duration: 0.25 }}
                          className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors"
                        >
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-800 dark:text-white">{r.nome}</div>
                            <div className="text-xs text-slate-400 dark:text-white/40 flex items-center gap-1 mt-0.5">
                              <code>{r.sku}</code> · <span>{r.fornecedor}</span>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                r.classeAbc === 'A'
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : r.classeAbc === 'B'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Classe {r.classeAbc}
                            </span>
                          </td>

                          <td className="p-3.5">
                            <div className="font-mono font-medium text-slate-800 dark:text-white">
                              {r.estoque} un
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-white/40">Mín: {r.estoqueMin}</div>
                          </td>

                          <td className="p-3.5 font-mono text-slate-700 dark:text-white/80">
                            {r.demandaDiaria.toFixed(1)} /dia
                          </td>

                          <td className="p-3.5">
                            <span className={`text-xs font-medium ${r.diasEstoque <= r.leadTime + seguranca ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-600 dark:text-white/70'}`}>
                              {r.diasEstoque > 180 ? '> 180 d' : `${Math.round(r.diasEstoque)} dias`}
                            </span>
                          </td>

                          <td className="p-3.5">
                            <input
                              type="number"
                              min={0}
                              className="w-20 px-2 py-1 border border-slate-200 dark:border-white/20 rounded-lg text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-black/50 outline-none focus:ring-2 focus:ring-amber-500/40 transition-all duration-200 hover:border-amber-500/50"
                              value={r.sugerido}
                              onChange={e => handleQtdChange(r.id, parseInt(e.target.value) || 0)}
                            />
                          </td>

                          <td className="p-3.5 text-slate-600 dark:text-white/70">
                            {fmtR(r.custoUnit)}
                          </td>

                          <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                            {fmtR(r.custoTotal)}
                          </td>

                          <td className="p-3.5">
                            {r.critico ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <AlertTriangle size={12} /> Crítico
                              </span>
                            ) : r.urgencia ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Urgente
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Normal
                              </span>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}