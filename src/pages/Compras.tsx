import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, Eye, PackagePlus, RefreshCw, ShoppingCart, Wrench } from 'lucide-react'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { GerenciarCompras } from '../components/GerenciarCompras'
import { PurchasingDashboard } from '../components/PurchasingDashboard'
import { TutorialCompras } from '../components/TutorialCompras'
import { montarPlanoCompra, type FaixaCompra, type ItemPlanoCompra } from '../lib/intelligence/purchasePlanner'

const faixas: Array<{ id: FaixaCompra | 'TODOS'; nome: string; icone: typeof ShoppingCart }> = [
  { id: 'COMPRAR_AGORA', nome: 'Comprar agora', icone: AlertTriangle },
  { id: 'PLANEJAR', nome: 'Planejar', icone: PackagePlus },
  { id: 'MONITORAR', nome: 'Monitorar', icone: Eye },
  { id: 'CORRIGIR_DADOS', nome: 'Corrigir dados', icone: Wrench },
  { id: 'TODOS', nome: 'Todos', icone: CheckCircle2 },
]

function corFaixa(faixa: FaixaCompra) {
  return { COMPRAR_AGORA: 'bg-red-100 text-red-700', PLANEJAR: 'bg-blue-100 text-blue-700', MONITORAR: 'bg-slate-100 text-slate-700', CORRIGIR_DADOS: 'bg-amber-100 text-amber-800' }[faixa]
}

function nomeFaixa(faixa: FaixaCompra) {
  return { COMPRAR_AGORA: 'Comprar agora', PLANEJAR: 'Planejar reposição', MONITORAR: 'Monitorar', CORRIGIR_DADOS: 'Corrigir dados' }[faixa]
}

function itensNoOrcamento(itens: ItemPlanoCompra[], orcamento: number, autonomo: boolean) {
  let saldo = Math.max(0, orcamento)
  return itens.filter(item => item.faixa === 'COMPRAR_AGORA' || item.faixa === 'PLANEJAR')
    .filter(item => !autonomo || (item.faixa === 'COMPRAR_AGORA' && item.politica.confidenceScore >= 70))
    .flatMap(item => {
      const quantidade = Math.min(item.quantidadeSugerida, Math.floor(saldo / item.produto.precoCompra))
      if (quantidade <= 0) return []
      saldo -= quantidade * item.produto.precoCompra
      return [{ ...item, quantidade, custo: quantidade * item.produto.precoCompra }]
    })
}

export function Compras() {
  const { produtos, vendas, pedidosCompra, lojaId, addPedidoCompra } = useStore()
  const [orcamento, setOrcamento] = useState(5000)
  const [modo, setModo] = useState<'recommendation' | 'controlled' | 'autonomous'>('recommendation')
  const [aba, setAba] = useState<FaixaCompra | 'TODOS'>('COMPRAR_AGORA')
  const [showHelp, setShowHelp] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date())
  const planoCompleto = useMemo(() => montarPlanoCompra(produtos, vendas, pedidosCompra, lojaId), [lojaId, pedidosCompra, produtos, vendas])
  const planoOrcamento = useMemo(() => itensNoOrcamento(planoCompleto, orcamento, modo === 'autonomous'), [modo, orcamento, planoCompleto])
  const itensVisiveis = aba === 'TODOS' ? planoCompleto : planoCompleto.filter(item => item.faixa === aba)
  const vendasSemItens = vendas.filter(venda => venda.itens.length === 0).length
  const valorPlanejado = planoOrcamento.reduce((soma, item) => soma + item.custo, 0)
  const unidadesPlanejadas = planoOrcamento.reduce((soma, item) => soma + item.quantidade, 0)

  const atualizarAnalise = () => {
    setAtualizadoEm(new Date())
    const agora = planoCompleto.filter(item => item.faixa === 'COMPRAR_AGORA').length
    toast(`Análise atualizada: ${planoCompleto.length} produto(s) avaliados; ${agora} exigem compra agora.`, agora ? 'warning' : 'success')
  }

  const criarPedidos = () => {
    if (modo === 'recommendation') {
      toast('Você está em modo Recomendação. Revise o plano e escolha o modo Controlado para criar pedidos.', 'warning')
      return
    }
    if (!planoOrcamento.length) {
      toast('Não há itens elegíveis dentro do orçamento. Verifique custo, confiança e dados do produto.', 'warning')
      return
    }
    const porFornecedor = planoOrcamento.reduce<Record<string, typeof planoOrcamento>>((grupos, item) => {
      const fornecedor = item.produto.fornecedor?.trim() || 'Fornecedor a definir'
      ;(grupos[fornecedor] ??= []).push(item)
      return grupos
    }, {})
    Object.entries(porFornecedor).forEach(([fornecedorId, itens]) => addPedidoCompra({
      id: crypto.randomUUID(),
      fornecedorId,
      status: modo === 'autonomous' ? 'pending' : 'draft',
      itens: itens.map(item => ({ produtoId: item.produto.id, quantidade: item.quantidade, precoCusto: item.produto.precoCompra })),
      dataPedido: new Date().toISOString(), lojaId,
    }))
    toast(`${Object.keys(porFornecedor).length} pedido(s) criado(s) no valor de ${valorPlanejado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, 'success')
  }

  return <div className="space-y-6 p-6 pb-28">
    <TutorialCompras isOpen={showHelp} onClose={() => setShowHelp(false)} />
    <div className="flex flex-wrap gap-3 justify-between items-start"><div><h1 className="text-2xl font-bold">Compras inteligentes</h1><p className="text-sm text-muted-foreground">Compre para manter disponibilidade, sem prender dinheiro em produtos parados.</p></div><div className="flex gap-2"><button onClick={() => setShowHelp(true)} className="p-2 border rounded-lg" aria-label="Como funciona"><CircleHelp size={19}/></button><button onClick={atualizarAnalise} className="inline-flex gap-2 items-center bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold"><RefreshCw size={17}/>Atualizar análise</button></div></div>

    <PurchasingDashboard decisoes={planoCompleto.map(item => item.politica)} valorPlanejado={valorPlanejado} itensPlanejados={unidadesPlanejadas} atualizadoEm={atualizadoEm} />
    {vendasSemItens > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{vendasSemItens} venda(s) sem itens vinculados.</strong> Elas entram no financeiro, mas não permitem descobrir qual produto foi vendido. Corrija-as antes de confiar na previsão desses produtos.</div>}

    <section className="card-adega p-5"><div className="grid md:grid-cols-3 gap-4 items-end"><div><label className="text-xs font-bold uppercase text-muted-foreground">Orçamento disponível</label><input aria-label="Orçamento disponível" min="0" type="number" value={orcamento} onChange={e => setOrcamento(Math.max(0, Number(e.target.value) || 0))} className="w-full mt-1 p-2 border rounded-lg text-lg font-semibold"/></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Modo de execução</label><select value={modo} onChange={e => setModo(e.target.value as typeof modo)} className="w-full mt-1 p-2 border rounded-lg bg-background"><option value="recommendation">Recomendação — não cria pedido</option><option value="controlled">Controlado — cria para aprovação</option><option value="autonomous">Autônomo — apenas urgentes confiáveis</option></select></div><div className="rounded-lg bg-muted p-3 text-sm"><strong>{valorPlanejado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br/><span className="text-muted-foreground">{unidadesPlanejadas} un. priorizadas dentro do orçamento</span></div></div></section>

    <div className="flex flex-wrap gap-2">{faixas.map(({ id, nome, icone: Icon }) => { const quantidade = id === 'TODOS' ? planoCompleto.length : planoCompleto.filter(item => item.faixa === id).length; return <button key={id} onClick={() => setAba(id)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${aba === id ? 'bg-foreground text-background' : 'bg-card hover:bg-muted'}`}><Icon size={16}/>{nome}<span className="rounded-full bg-background/20 px-1.5">{quantidade}</span></button> })}</div>

    <section className="space-y-3">{itensVisiveis.length ? itensVisiveis.map(item => <article key={item.produto.id} className="card-adega p-5"><div className="flex flex-wrap justify-between gap-3"><div><div className="flex gap-2 items-center flex-wrap"><h2 className="font-bold text-lg">{item.produto.nome}</h2><span className={`px-2 py-1 rounded-full text-xs font-bold ${corFaixa(item.faixa)}`}>{nomeFaixa(item.faixa)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.explicacao}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Recomendação</p><p className="text-2xl font-bold">{item.quantidadeSugerida} un.</p><p className="text-sm text-muted-foreground">{item.custoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm"><div><span className="text-muted-foreground">Em estoque</span><strong className="block">{item.produto.estoque} un.</strong></div><div><span className="text-muted-foreground">Em trânsito</span><strong className="block">{item.emTransito} un.</strong></div><div><span className="text-muted-foreground">Demanda</span><strong className="block">{item.politica.demandForecast.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un./dia</strong></div><div><span className="text-muted-foreground">Cobertura</span><strong className="block">{item.politica.daysOfCover >= 999 ? 'Sem medida' : `${item.politica.daysOfCover} dias`}</strong></div><div><span className="text-muted-foreground">Confiança</span><strong className="block">{item.politica.confidenceScore}%</strong></div></div>{item.bloqueio && <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">Ação necessária: {item.bloqueio}</p>}<details className="mt-4 text-sm"><summary className="cursor-pointer text-primary font-semibold">Entender este cálculo</summary><p className="mt-2 text-muted-foreground">Ponto de pedido: {item.politica.reorderPoint} un. · Estoque de segurança: {item.politica.safetyStock} un. · Estoque alvo: {item.politica.maximumStock} un. · Risco de ruptura: {Math.round(item.politica.ruptureRisk * 100)}%.</p></details></article>) : <div className="card-adega p-8 text-center text-muted-foreground">Nenhum produto nesta categoria.</div>}</section>

    <GerenciarCompras />
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur p-4"><div className="max-w-6xl mx-auto flex flex-wrap gap-3 justify-between items-center"><span className="text-sm"><strong>{planoOrcamento.length} itens</strong> prontos para o plano · {valorPlanejado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span><button onClick={criarPedidos} className="bg-emerald-600 text-white px-5 py-3 rounded-lg font-bold">{modo === 'recommendation' ? 'Revisar modo de execução' : modo === 'controlled' ? 'Criar pedidos para aprovação' : 'Criar pedidos urgentes'}</button></div></div>
  </div>
}
