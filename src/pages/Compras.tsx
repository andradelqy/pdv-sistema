import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, Eye, PackagePlus, Search, ShoppingCart, Sparkles, WalletCards, Wrench, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { GerenciarCompras } from '../components/GerenciarCompras'
import { PurchasingDashboard } from '../components/PurchasingDashboard'
import { TutorialCompras } from '../components/TutorialCompras'
import { alocarOrcamento } from '../lib/intelligence/purchaseBudget'
import { montarPlanoCompra, type FaixaCompra } from '../lib/intelligence/purchasePlanner'

const faixas: Array<{ id: FaixaCompra | 'TODOS'; nome: string; icone: typeof ShoppingCart }> = [
  { id: 'COMPRAR_AGORA', nome: 'Comprar agora', icone: AlertTriangle },
  { id: 'PLANEJAR', nome: 'Planejar', icone: PackagePlus },
  { id: 'MONITORAR', nome: 'Monitorar', icone: Eye },
  { id: 'CORRIGIR_DADOS', nome: 'Corrigir dados', icone: Wrench },
  { id: 'TODOS', nome: 'Todos', icone: CheckCircle2 },
]

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const corFaixa = (faixa: FaixaCompra) => ({ COMPRAR_AGORA: 'badge-danger', PLANEJAR: 'badge-info', MONITORAR: 'badge-secondary', CORRIGIR_DADOS: 'badge-warning' })[faixa]
const nomeFaixa = (faixa: FaixaCompra) => ({ COMPRAR_AGORA: 'Comprar agora', PLANEJAR: 'Planejar reposição', MONITORAR: 'Monitorar', CORRIGIR_DADOS: 'Corrigir dados' })[faixa]

export function Compras() {
  const { produtos, vendas, pedidosCompra, lojaId, addPedidoCompra } = useStore()
  const [orcamento, setOrcamento] = useState(5000)
  const [modo, setModo] = useState<'recommendation' | 'controlled' | 'autonomous'>('controlled')
  const [aba, setAba] = useState<FaixaCompra | 'TODOS'>('COMPRAR_AGORA')
  const [busca, setBusca] = useState('')
  const [excluidos, setExcluidos] = useState<string[]>([])
  const [showHelp, setShowHelp] = useState(false)

  const planoCompleto = useMemo(() => montarPlanoCompra(produtos, vendas, pedidosCompra, lojaId), [lojaId, pedidosCompra, produtos, vendas])
  const planoOrcamento = useMemo(() => alocarOrcamento(planoCompleto, orcamento, { somenteUrgentesConfiaveis: modo === 'autonomous', excluidos }), [excluidos, modo, orcamento, planoCompleto])
  const alocadoPorProduto = useMemo(() => new Map(planoOrcamento.map(item => [item.produto.id, item])), [planoOrcamento])
  const termo = busca.trim().toLowerCase()
  const itensVisiveis = planoCompleto.filter(item => (aba === 'TODOS' || item.faixa === aba) && (!termo || item.produto.nome.toLowerCase().includes(termo) || item.produto.sku.toLowerCase().includes(termo)))
  const vendasSemItens = vendas.filter(venda => venda.itens.length === 0).length
  const valorPlanejado = planoOrcamento.reduce((soma, item) => soma + item.custo, 0)
  const unidadesPlanejadas = planoOrcamento.reduce((soma, item) => soma + item.quantidade, 0)
  const saldo = Math.max(0, orcamento - valorPlanejado)
  const usoOrcamento = orcamento > 0 ? Math.min(100, valorPlanejado / orcamento * 100) : 0
  const custoRecomendado = planoCompleto.filter(item => item.faixa === 'COMPRAR_AGORA' || item.faixa === 'PLANEJAR').reduce((s, item) => s + item.custoEstimado, 0)
  const urgentesFora = planoCompleto.filter(item => item.faixa === 'COMPRAR_AGORA' && !alocadoPorProduto.has(item.produto.id) && !excluidos.includes(item.produto.id)).length

  const alternarItem = (produtoId: string) => setExcluidos(atuais => atuais.includes(produtoId) ? atuais.filter(id => id !== produtoId) : [...atuais, produtoId])

  const criarPedidos = () => {
    if (modo === 'recommendation') return toast('Selecione o modo Controlado para transformar o plano em pedidos para aprovação.', 'warning')
    if (!planoOrcamento.length) return toast('Nenhum item cabe no orçamento atual. Aumente o orçamento ou revise os itens excluídos.', 'warning')
    const porFornecedor = planoOrcamento.reduce<Record<string, typeof planoOrcamento>>((grupos, item) => {
      const fornecedor = item.produto.fornecedor?.trim() || 'Fornecedor a definir'
      ;(grupos[fornecedor] ??= []).push(item)
      return grupos
    }, {})
    Object.entries(porFornecedor).forEach(([fornecedorNome, itens]) => addPedidoCompra({
      id: crypto.randomUUID(), fornecedorNome: fornecedorNome === 'Fornecedor a definir' ? undefined : fornecedorNome, status: modo === 'autonomous' ? 'pending' : 'draft',
      itens: itens.map(item => ({ produtoId: item.produto.id, quantidade: item.quantidade, precoCusto: item.produto.precoCompra })),
      dataPedido: new Date().toISOString(), lojaId,
    }))
    setExcluidos([])
    toast(`${Object.keys(porFornecedor).length} pedido(s) criado(s) no valor de ${moeda(valorPlanejado)}.`, 'success')
  }

  return <div className="mx-auto max-w-7xl space-y-5 pb-24">
    <TutorialCompras isOpen={showHelp} onClose={() => setShowHelp(false)} />
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">Central de compras</h1><span className="badge-adega badge-success"><Sparkles size={12} className="mr-1 inline"/>Cálculo automático</span></div><p className="mt-1 text-sm text-muted-foreground">Defina o limite. O Órbita prioriza ruptura, giro e retorno sem ultrapassar o orçamento.</p></div>
      <button onClick={() => setShowHelp(true)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"><CircleHelp size={17}/>Como funciona</button>
    </header>

    <div className="grid gap-2 sm:grid-cols-4 text-xs">
      {['1. Defina o orçamento','2. Revise prioridades','3. Ajuste a seleção','4. Gere os pedidos'].map((passo, i) => <div key={passo} className={`rounded-lg border px-3 py-2 font-semibold ${i === 0 ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground'}`}>{passo}</div>)}
    </div>

    <section className="card-adega p-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div><div className="flex items-center gap-2"><WalletCards size={18} className="text-primary"/><label htmlFor="budget" className="font-semibold">Quanto pode investir agora?</label></div><div className="mt-3 flex gap-2"><span className="grid place-items-center rounded-lg border bg-muted px-3 font-semibold">R$</span><input id="budget" aria-label="Orçamento disponível" min="0" step="100" type="number" value={orcamento} onChange={e => setOrcamento(Math.max(0, Number(e.target.value) || 0))} className="min-w-0 flex-1 rounded-lg border bg-background p-3 text-xl font-bold"/></div><div className="mt-2 flex flex-wrap gap-2">{[1000,2500,5000,10000].map(valor => <button key={valor} onClick={() => setOrcamento(valor)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${orcamento === valor ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{moeda(valor)}</button>)}</div></div>
        <div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Planejado</span><strong>{moeda(valorPlanejado)}</strong></div><div className="prog-bar-wrap mt-2 h-3"><div className="prog-bar bg-primary" style={{ width: `${usoOrcamento}%` }}/></div><div className="mt-2 flex justify-between text-xs"><span>{usoOrcamento.toFixed(0)}% utilizado</span><strong className="text-success">{moeda(saldo)} disponível</strong></div><p className="mt-3 text-xs text-muted-foreground">Necessidade calculada: {moeda(custoRecomendado)}. A seleção se adapta instantaneamente ao limite informado.</p></div>
      </div>
      <div className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-3"><div><label className="kpi-label">Modo de execução</label><select value={modo} onChange={e => setModo(e.target.value as typeof modo)} className="w-full rounded-lg border bg-background p-2 text-sm"><option value="recommendation">Somente analisar</option><option value="controlled">Controlado — gerar para aprovação</option><option value="autonomous">Automático — urgentes com alta confiança</option></select></div><div className="rounded-lg bg-muted/60 p-3"><span className="kpi-label">Plano atual</span><strong className="block text-lg">{planoOrcamento.length} produtos · {unidadesPlanejadas} un.</strong></div><div className={`rounded-lg p-3 ${urgentesFora ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}><span className="kpi-label">Cobertura do urgente</span><strong className="block text-lg">{urgentesFora ? `${urgentesFora} fora do plano` : 'Todos contemplados'}</strong></div></div>
    </section>

    <PurchasingDashboard decisoes={planoCompleto.map(item => item.politica)} valorPlanejado={valorPlanejado} itensPlanejados={unidadesPlanejadas} atualizadoEm={new Date()} />
    {vendasSemItens > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{vendasSemItens} venda(s) sem itens vinculados.</strong> Elas entram no financeiro, mas não ajudam a prever produtos. Corrija o histórico antes de aprovar grandes compras.</div>}

    <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto ou SKU" className="w-full rounded-lg border bg-background py-2 pl-9 pr-9 text-sm"/>{busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={15}/></button>}</div>{faixas.map(({ id, nome, icone: Icon }) => { const quantidade = id === 'TODOS' ? planoCompleto.length : planoCompleto.filter(item => item.faixa === id).length; return <button key={id} onClick={() => setAba(id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${aba === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}><Icon size={14}/>{nome}<span className="opacity-75">{quantidade}</span></button>})}</div>

    <section className="space-y-3">{itensVisiveis.length ? itensVisiveis.map(item => {
      const alocado = alocadoPorProduto.get(item.produto.id)
      const excluido = excluidos.includes(item.produto.id)
      const elegivel = (item.faixa === 'COMPRAR_AGORA' || item.faixa === 'PLANEJAR') && !item.bloqueio && item.quantidadeSugerida > 0
      return <article key={item.produto.id} className={`card-adega overflow-hidden ${alocado ? 'ring-1 ring-primary/40' : ''}`}>
        <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 gap-3">{elegivel && <button onClick={() => alternarItem(item.produto.id)} aria-label={excluido ? 'Incluir produto' : 'Retirar produto'} className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded border ${!excluido ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>{!excluido && <CheckCircle2 size={14}/>}</button>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-bold">{item.produto.nome}</h2><span className={`badge-adega ${corFaixa(item.faixa)}`}>{nomeFaixa(item.faixa)}</span>{item.produto.fornecedor && <span className="text-xs text-muted-foreground">{item.produto.fornecedor}</span>}</div><p className="mt-1 text-sm text-muted-foreground">{excluido ? 'Retirado manualmente deste plano.' : item.explicacao}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Estoque <strong className="text-foreground">{item.produto.estoque}</strong></span><span>Em pedidos <strong className="text-foreground">{item.emTransito}</strong></span><span>Giro <strong className="text-foreground">{item.politica.demandForecast.toFixed(2)}/dia</strong></span><span>Cobertura <strong className="text-foreground">{item.politica.daysOfCover >= 999 ? 'sem demanda' : `${item.politica.daysOfCover} dias`}</strong></span><span>Confiança <strong className="text-foreground">{item.politica.confidenceScore}%</strong></span></div></div></div>
          <div className="grid min-w-[310px] grid-cols-3 divide-x rounded-xl border bg-muted/35 text-center"><div className="p-3"><span className="kpi-label">Sugerido</span><strong className="block text-lg">{item.quantidadeSugerida} un.</strong><small className="text-muted-foreground">{moeda(item.custoEstimado)}</small></div><div className="p-3"><span className="kpi-label">No plano</span><strong className={`block text-lg ${alocado ? 'text-primary' : 'text-muted-foreground'}`}>{alocado?.quantidade || 0} un.</strong><small className="text-muted-foreground">{moeda(alocado?.custo || 0)}</small></div><div className="p-3"><span className="kpi-label">Projetado</span><strong className="block text-lg">{item.produto.estoque + item.emTransito + (alocado?.quantidade || 0)} un.</strong><small className="text-muted-foreground">após receber</small></div></div>
        </div>
        {item.bloqueio && <div className="border-t bg-warning/10 px-5 py-3 text-sm text-warning">Ação necessária: {item.bloqueio}</div>}
        {elegivel && !alocado && !excluido && <div className="border-t bg-muted/30 px-5 py-2 text-xs text-muted-foreground">Não entrou no plano por limite de orçamento, prioridade ou regra do modo selecionado.</div>}
        <details className="border-t px-5 py-3 text-sm"><summary className="cursor-pointer font-semibold text-primary">Ver cálculo e regras de compra</summary><p className="mt-2 text-muted-foreground">Ponto de pedido: {item.politica.reorderPoint} · Segurança: {item.politica.safetyStock} · Alvo: {item.politica.maximumStock} · Risco: {Math.round(item.politica.ruptureRisk * 100)}% · Mínimo: {item.produto.quantidadeMinimaCompra || 1} · Múltiplo: {item.produto.multiploCompra || 1}.</p></details>
      </article>
    }) : <div className="card-adega p-10 text-center text-muted-foreground">Nenhum produto corresponde aos filtros atuais.</div>}</section>

    <GerenciarCompras />
    <div className="sticky bottom-3 z-30 rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{planoOrcamento.length} produtos · {unidadesPlanejadas} unidades</strong><p className="text-xs text-muted-foreground">{moeda(valorPlanejado)} do orçamento · {moeda(saldo)} disponíveis</p></div><button disabled={!planoOrcamento.length || modo === 'recommendation'} onClick={criarPedidos} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{modo === 'recommendation' ? 'Mude para Controlado para gerar' : modo === 'autonomous' ? 'Gerar pedidos urgentes' : 'Gerar pedidos para aprovação'}</button></div></div>
  </div>
}
