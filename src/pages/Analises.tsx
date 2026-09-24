import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, ShoppingCart, Target } from 'lucide-react'
import { margemLiquida, useStore, fmtR } from '../lib/store'
import { getSyncQueueStatus } from '../lib/sync'
import { OperationalHealth } from '../components/OperationalHealth'

type PeriodoAnalise = 30 | 90 | 'all'

const CORES_ABC = { A: '#ef4444', B: '#f59e0b', C: '#22c55e' }
const CORES_QPR: Record<string, string> = { Estrela: '#16a34a', Potencial: '#2563eb', Volume: '#f59e0b', Revisar: '#ef4444' }

function CardKpi({ titulo, valor, detalhe, tom = 'text-primary' }: { titulo: string; valor: string; detalhe: string; tom?: string }) {
  return <div className="card-adega p-4"><div className="kpi-label">{titulo}</div><div className={`kpi-value ${tom}`}>{valor}</div><p className="text-xs text-muted-foreground mt-1">{detalhe}</p></div>
}

function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>; label?: string }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return <div className="rounded-lg border bg-card p-3 shadow-lg text-sm"><p className="font-semibold">{label || item.payload?.nome as string}</p>{payload.map((p, index) => <p key={index} style={{ color: p.color }} className="mt-1">{p.name}: {typeof p.value === 'number' ? p.name?.includes('Receita') || p.name?.includes('Faturamento') ? fmtR(p.value) : p.value.toLocaleString('pt-BR') : '—'}</p>)}</div>
}

function baixarCsv(nome: string, cabecalho: string[], linhas: Array<Array<string | number | undefined>>) {
  const escape = (valor: string | number | undefined) => `"${String(valor ?? '').replaceAll('"', '""')}"`
  const csv = [cabecalho, ...linhas].map(linha => linha.map(escape).join(';')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  link.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

export function Analises({ tipo }: { tipo: 'abc' | 'qpr' | 'alertas' | 'caixa' | 'historico' | 'backup' }) {
  const { produtos, vendas, clientes, caixaEntradas, caixas, caixaAberto, entregas, movimentacoes, pedidosCompra, lojaId, currentUser, abrirCaixa, fecharCaixa, resetDemo, clearAll } = useStore()
  const [periodo, setPeriodo] = useState<PeriodoAnalise>(90)
  const saidas = vendas.flatMap(v => v.itens.map(i => ({ ...i, data: v.data })))
  const ranking = useMemo(() => {
    const limite = periodo === 'all' ? null : new Date(Date.now() - periodo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const saidasDoPeriodo = saidas.filter(s => !limite || s.data >= limite)
    const base = produtos.map(p => {
      const qtd = saidasDoPeriodo.filter(s => s.produtoId === p.id).reduce((s, i) => s + i.quantidade, 0)
      const receita = qtd * p.precoVenda
      const margem = margemLiquida(p)
      const estoqueOrigem = p.produtoEstoqueOrigemId ? produtos.find(x => x.id === p.produtoEstoqueOrigemId) : undefined
      return { ...p, qtd, receita, margem, estoqueOrigem }
    }).sort((a, b) => b.receita - a.receita)
    const total = base.reduce((s, p) => s + p.receita, 0)
    let acumulado = 0
    return base.map(p => {
      const participacao = total ? p.receita / total * 100 : 0
      acumulado += participacao
      return { ...p, participacao, acumulado, abc: (acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C') as 'A' | 'B' | 'C' }
    })
  }, [periodo, produtos, saidas])

  const seletorPeriodo = <div className="flex rounded-lg border p-1 bg-muted/40 self-start">{([30, 90, 'all'] as PeriodoAnalise[]).map(opcao => <button key={opcao} onClick={() => setPeriodo(opcao)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${periodo === opcao ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{opcao === 'all' ? 'Todo histórico' : `${opcao} dias`}</button>)}</div>

  if (tipo === 'alertas') {
    const criticos = produtos.filter(p => p.estoque <= p.estoqueMin)
    const alertas = produtos.filter(p => p.estoque > p.estoqueMin && p.estoque <= p.pontoPedido)
    const credito = clientes.filter(c => c.saldo > c.limite)
    const atrasadas = entregas.filter(e => ['pendente', 'aceito', 'em_rota'].includes(e.status) && Date.now() - new Date(e.criadoEm).getTime() > 2 * 60 * 60 * 1000)
    const sync = getSyncQueueStatus()
    const itens: [string, string, string][] = [
      ...criticos.map(p => ['Crítico', `${p.nome}: ${p.estoque} unidades em estoque`, 'badge-danger'] as [string, string, string]),
      ...alertas.map(p => ['Reposição', `${p.nome} atingiu o ponto de pedido (${p.estoque} un)`, 'badge-warning'] as [string, string, string]),
      ...credito.map(c => ['Crédito', `${c.nome} excedeu o limite de crédito`, 'badge-danger'] as [string, string, string]),
      ...atrasadas.map(e => ['Entrega atrasada', `Pedido #${e.id.slice(-4)} está em ${e.status} há mais de 2 horas`, 'badge-warning'] as [string, string, string]),
      ...(sync.pending ? [['Sincronização', `${sync.pending} alteração(ões) aguardando envio${sync.failed ? `; ${sync.failed} com erro anterior` : ''}`, 'badge-warning'] as [string, string, string]] : []),
    ]
    return <div className="flex flex-col gap-4"><h2 className="text-xl font-bold">Alertas</h2>{itens.length ? <div className="flex flex-col gap-2">{itens.map((a, i) => <div key={i} className="card-adega p-4 flex gap-3 items-center"><span className={`badge-adega ${a[2]}`}>{a[0]}</span><span className="text-sm">{a[1]}</span></div>)}</div> : <div className="card-adega p-8 text-center text-success">Operação sem alertas de negócio.</div>}<OperationalHealth /></div>
  }

  if (tipo === 'historico') return <div className="flex flex-col gap-4"><h2 className="text-xl font-bold">Histórico de Vendas</h2><div className="card-adega overflow-hidden"><div className="overflow-x-auto"><table className="tbl-adega"><thead><tr><th>Data</th><th>Cliente</th><th>Produtos</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>{vendas.length ? [...vendas].reverse().map(v => <tr key={v.id}><td>{new Date(v.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td>{clientes.find(c => c.id === v.clienteId)?.nome || '—'}</td><td>{v.itens.length ? v.itens.map(i => `${i.produtoNome || produtos.find(p => p.id === i.produtoId)?.nome || 'Produto não identificado'} x${i.quantidade}`).join(', ') : <span className="text-muted-foreground">Itens não recuperados</span>}</td><td className="font-semibold">{fmtR(v.total)}</td><td><span className="badge-adega badge-info">{v.pagamento}</span></td></tr>) : <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma venda registrada</td></tr>}</tbody></table></div></div></div>

  if (tipo === 'caixa') {
    const inicio = caixaAberto?.abertoEm.slice(0, 10) || ''
    const entradasFiltradas = caixaEntradas.filter(e => e.pagamento !== 'fiado' && (caixaAberto ? e.caixaId === caixaAberto.id || (!e.caixaId && e.data >= inicio) : false))
    const entradas = entradasFiltradas.reduce((s, e) => s + (e.tipo === 'sangria' ? -e.valor : e.valor), 0)
    const vendasTotal = entradasFiltradas.filter(e => e.tipo === 'venda').reduce((s, e) => s + e.valor, 0)
    return <div className="flex flex-col gap-4"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Caixa</h2>{caixaAberto ? <button onClick={() => { if (confirm('Fechar caixa?')) fecharCaixa() }} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold">Fechar caixa</button> : <button onClick={abrirCaixa} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold">Abrir caixa</button>}</div><div className="card-adega p-4"><div className="kpi-label">Status</div><div className={`kpi-value ${caixaAberto ? 'text-success' : 'text-destructive'}`}>{caixaAberto ? `Aberto desde ${new Date(caixaAberto.abertoEm).toLocaleString('pt-BR')}` : 'Caixa fechado'}</div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[['Vendas', fmtR(vendasTotal), 'text-success'], ['Saldo em caixa', fmtR(entradas), 'text-primary'], ['Movimentações', entradasFiltradas.length, 'text-warning']].map(x => <div key={x[0] as string} className="card-adega p-4"><div className="kpi-label">{x[0]}</div><div className={`kpi-value ${x[2]}`}>{x[1]}</div></div>)}</div><div className="card-adega overflow-hidden"><table className="tbl-adega"><thead><tr><th>Data fechamento</th><th>Faturamento bruto</th><th>Lucro líquido</th><th>Vendas</th></tr></thead><tbody>{caixas.length ? caixas.map(c => <tr key={c.id}><td>{c.fechadoEm ? new Date(c.fechadoEm).toLocaleString('pt-BR') : '—'}</td><td>{fmtR(c.faturamentoBruto || 0)}</td><td className={(c.lucroLiquido || 0) >= 0 ? 'text-success' : 'text-destructive'}>{fmtR(c.lucroLiquido || 0)}</td><td>{c.vendas || 0}</td></tr>) : <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum caixa fechado</td></tr>}</tbody></table></div></div>
  }

  if (tipo === 'backup') return <div className="flex flex-col gap-4"><h2 className="text-xl font-bold">Backup e exportação</h2><div className="grid md:grid-cols-2 gap-4"><div className="card-adega p-5"><h3 className="font-bold mb-2">Exportação completa da loja</h3><p className="text-sm text-muted-foreground mb-4">Gera uma cópia portátil dos dados carregados neste navegador, incluindo compras. Não substitui o backup automático do banco.</p><button onClick={() => { const exportacao = { metadados: { versao: __APP_VERSION__, lojaId, exportadoEm: new Date().toISOString(), exportadoPor: currentUser?.id }, produtos, movimentacoes, vendas, clientes, caixaEntradas, caixas, entregas, pedidosCompra }; const blob = new Blob([JSON.stringify(exportacao, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dados-orbita-${lojaId}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href) }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Exportar dados JSON</button></div><div className="card-adega p-5"><h3 className="font-bold mb-2">Planilhas CSV</h3><p className="text-sm text-muted-foreground mb-4">Arquivos compatíveis com Excel e Google Sheets.</p><div className="flex flex-wrap gap-2"><button onClick={() => baixarCsv('produtos', ['SKU','Nome','Estoque','Mínimo','Custo','Venda'], produtos.map(p => [p.sku,p.nome,p.estoque,p.estoqueMin,p.precoCompra,p.precoVenda]))} className="px-3 py-2 border rounded-lg text-sm">Produtos</button><button onClick={() => baixarCsv('vendas', ['Data','Itens','Total','Pagamento'], vendas.map(v => [v.data,v.itens.map(i => `${i.produtoNome || i.produtoId} x${i.quantidade}`).join(' | '),v.total,v.pagamento]))} className="px-3 py-2 border rounded-lg text-sm">Vendas</button><button onClick={() => baixarCsv('entregas', ['Data','Cliente','Endereço','Status','Total'], entregas.map(e => [e.data,e.clienteNome,e.endereco,e.status,e.total]))} className="px-3 py-2 border rounded-lg text-sm">Entregas</button><button onClick={() => baixarCsv('compras', ['Data','Status','Fornecedor','Itens'], pedidosCompra.map(p => [p.dataPedido,p.status,p.fornecedorNome,p.itens.map(i => `${i.produtoId} x${i.quantidade}`).join(' | ')]))} className="px-3 py-2 border rounded-lg text-sm">Compras</button></div></div><div className="card-adega p-5"><h3 className="font-bold mb-2">Dados de demonstração</h3><p className="text-sm text-muted-foreground mb-4">Restaura os produtos usados na apresentação.</p><button onClick={() => { if (confirm('Restaurar dados de demonstração?')) resetDemo() }} className="px-4 py-2 bg-warning text-white rounded-lg text-sm">Restaurar demo</button></div><div className="card-adega p-5"><h3 className="font-bold mb-2 text-destructive">Zerar cache local</h3><p className="text-sm text-muted-foreground mb-4">Remove somente a cópia deste navegador; não apaga o Supabase.</p><button onClick={() => { if (confirm('Limpar o cache local?')) clearAll() }} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm">Limpar cache</button></div></div></div>

  if (tipo === 'abc') {
    const faturamento = ranking.reduce((s, p) => s + p.receita, 0)
    const classeA = ranking.filter(p => p.abc === 'A')
    const classeB = ranking.filter(p => p.abc === 'B')
    const classeC = ranking.filter(p => p.abc === 'C')
    const aSemEstoque = classeA.filter(p => (p.estoqueOrigem || p).estoque <= (p.estoqueOrigem || p).pontoPedido)
    const dadosPareto = ranking.slice(0, 12).map(p => ({ nome: p.nome.length > 18 ? `${p.nome.slice(0, 18)}…` : p.nome, Receita: p.receita, 'Acumulado (%)': Number(p.acumulado.toFixed(1)) }))
    const dadosPizza = [['A', classeA], ['B', classeB], ['C', classeC]].map(([classe, itens]) => ({ name: `Classe ${classe}`, value: (itens as typeof ranking).reduce((s, p) => s + p.receita, 0), cor: CORES_ABC[classe as keyof typeof CORES_ABC] }))
    return <div className="flex flex-col gap-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Curva ABC</h2><p className="text-sm text-muted-foreground">Priorize seu capital nos itens que sustentam o faturamento.</p></div>{seletorPeriodo}</div>
      {!ranking.length || !faturamento ? <div className="card-adega p-8 text-center text-muted-foreground">Ainda não há vendas no período escolhido para montar a Curva ABC.</div> : <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"><CardKpi titulo="Faturamento analisado" valor={fmtR(faturamento)} detalhe={`Vendas dos últimos ${periodo === 'all' ? 'todos os dias' : `${periodo} dias`}`} /><CardKpi titulo="Itens Classe A" valor={`${classeA.length} produtos`} detalhe={`${classeA.reduce((s, p) => s + p.participacao, 0).toFixed(0)}% do faturamento`} tom="text-destructive" /><CardKpi titulo="Capital a proteger" valor={`${aSemEstoque.length} itens A`} detalhe={aSemEstoque.length ? 'Atingiram ponto de pedido' : 'Nenhum item A em alerta'} tom={aSemEstoque.length ? 'text-warning' : 'text-success'} /><CardKpi titulo="Cauda de catálogo" valor={`${classeC.length} produtos`} detalhe="Baixa participação; compre com cautela" tom="text-muted-foreground" /></div>
        {aSemEstoque.length > 0 && <div className="card-adega p-4 border-l-4 border-warning"><div className="flex gap-3"><ShoppingCart className="text-warning shrink-0" size={20}/><div><p className="font-semibold">Ação de compra prioritária</p><p className="text-sm text-muted-foreground">Reponha primeiro: {aSemEstoque.slice(0, 4).map(p => p.estoqueOrigem ? `${p.nome} → ${p.estoqueOrigem.nome}` : p.nome).join(', ')}{aSemEstoque.length > 4 ? '…' : ''}. São itens A no ponto de pedido ou abaixo dele.</p></div></div></div>}
        <div className="grid xl:grid-cols-3 gap-4"><div className="card-adega p-4 xl:col-span-2"><h3 className="font-semibold mb-1">Concentração do faturamento</h3><p className="text-xs text-muted-foreground mb-4">Barras: receita. Linha: participação acumulada; a linha de 80% separa os itens A.</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={dadosPareto} margin={{ left: 8, right: 8, bottom: 35 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="nome" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 11 }}/><YAxis yAxisId="receita" tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR')}`}/><YAxis yAxisId="percentual" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`}/><Tooltip content={<TooltipGrafico/>}/><ReferenceLine yAxisId="percentual" y={80} stroke="#ef4444" strokeDasharray="4 4"/><Bar yAxisId="receita" dataKey="Receita" radius={[5, 5, 0, 0]} fill="#2563eb"/></BarChart></ResponsiveContainer></div></div><div className="card-adega p-4"><h3 className="font-semibold mb-1">Onde está o dinheiro</h3><p className="text-xs text-muted-foreground mb-4">Participação por classe ABC.</p><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dadosPizza} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>{dadosPizza.map(item => <Cell key={item.name} fill={item.cor}/>)}</Pie><Tooltip formatter={value => fmtR(Number(value || 0))}/><Legend/></PieChart></ResponsiveContainer></div><div className="text-xs space-y-2">{dadosPizza.map(x => <div className="flex justify-between" key={x.name}><span>{x.name}</span><strong>{fmtR(x.value)}</strong></div>)}</div></div></div>
        <div className="card-adega overflow-hidden"><div className="p-4 border-b"><h3 className="font-semibold">Plano de decisão por produto</h3><p className="text-xs text-muted-foreground">A: mantenha disponibilidade; B: acompanhe; C: evite empatar caixa em excesso.</p></div><div className="overflow-x-auto"><table className="tbl-adega"><thead><tr><th>#</th><th>Produto</th><th>Classe</th><th>Faturamento</th><th>Participação</th><th>Acumulado</th><th>Decisão</th></tr></thead><tbody>{ranking.map((p, i) => <tr key={p.id}><td>{i + 1}</td><td className="font-medium">{p.nome}</td><td><span className={`badge-adega ${p.abc === 'A' ? 'badge-danger' : p.abc === 'B' ? 'badge-warning' : 'badge-success'}`}>{p.abc}</span></td><td>{fmtR(p.receita)}</td><td>{p.participacao.toFixed(1)}%</td><td>{p.acumulado.toFixed(1)}%</td><td className="text-sm">{p.abc === 'A' ? 'Comprar primeiro e evitar ruptura' : p.abc === 'B' ? 'Repor conforme ponto de pedido' : 'Comprar pouco; revisar excesso e margem'}</td></tr>)}</tbody></table></div></div>
      </>}
    </div>
  }

  const ativos = ranking.filter(p => p.qtd > 0)
  const giroMedio = ativos.length ? ativos.reduce((s, p) => s + p.qtd, 0) / ativos.length : 0
  const margemMedia = ativos.length ? ativos.reduce((s, p) => s + p.margem, 0) / ativos.length : 0
  const qpr = ranking.map(p => {
    const altoGiro = p.qtd >= giroMedio && p.qtd > 0
    const altaMargem = p.margem >= margemMedia
    const classificacao = altoGiro && altaMargem && p.qualidade >= 4 ? 'Estrela' : !altoGiro && altaMargem ? 'Potencial' : altoGiro ? 'Volume' : 'Revisar'
    return { ...p, classificacao, giro: p.qtd, tamanho: Math.max(p.receita, 1) }
  })
  const gruposQpr = ['Estrela', 'Potencial', 'Volume', 'Revisar'].map(nome => ({ nome, itens: qpr.filter(p => p.classificacao === nome), cor: CORES_QPR[nome] }))
  const recomendacoes = [
    ...qpr.filter(p => p.classificacao === 'Estrela' && (p.estoqueOrigem || p).estoque <= (p.estoqueOrigem || p).pontoPedido).map(p => ({ p, acao: 'Comprar agora', motivo: 'alto giro, boa margem e estoque no ponto de pedido', tom: 'text-destructive' })),
    ...qpr.filter(p => p.classificacao === 'Potencial').map(p => ({ p, acao: 'Dar visibilidade', motivo: 'margem acima da média, mas giro baixo', tom: 'text-primary' })),
    ...qpr.filter(p => p.classificacao === 'Volume').map(p => ({ p, acao: 'Negociar custo', motivo: 'gira bem, porém a margem pede atenção', tom: 'text-warning' })),
  ].slice(0, 8)
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Matriz QPR</h2><p className="text-sm text-muted-foreground">Cruza qualidade, margem e giro para orientar preço, compra e exposição.</p></div>{seletorPeriodo}</div>{!ativos.length ? <div className="card-adega p-8 text-center text-muted-foreground">Ainda não há vendas no período escolhido para montar a matriz.</div> : <><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"><CardKpi titulo="Produtos estrela" valor={`${gruposQpr[0].itens.length}`} detalhe="Qualidade, margem e giro fortes" tom="text-success"/><CardKpi titulo="Margem média" valor={`${margemMedia.toFixed(1)}%`} detalhe="Após custo, frete, imposto e comissão"/><CardKpi titulo="Giro médio" valor={`${giroMedio.toFixed(1)} un.`} detalhe="Unidades vendidas por produto" tom="text-warning"/><CardKpi titulo="Produtos a revisar" valor={`${gruposQpr[3].itens.length}`} detalhe="Baixo giro ou margem abaixo da média" tom="text-destructive"/></div><div className="grid xl:grid-cols-3 gap-4"><div className="card-adega p-4 xl:col-span-2"><h3 className="font-semibold">Mapa de rentabilidade e giro</h3><p className="text-xs text-muted-foreground mb-3">Cada bolha é um produto; o tamanho representa faturamento. Linhas são as médias do período.</p><div className="h-96"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 18, right: 18, bottom: 10, left: 8 }}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="giro" name="Giro (un.)" unit=" un."/><YAxis type="number" dataKey="margem" name="Margem" unit="%"/><ZAxis type="number" dataKey="tamanho" range={[70, 650]} name="Faturamento"/><Tooltip cursor={{ strokeDasharray: '3 3' }} content={<TooltipGrafico/>}/><ReferenceLine x={giroMedio} stroke="#64748b" strokeDasharray="4 4"/><ReferenceLine y={margemMedia} stroke="#64748b" strokeDasharray="4 4"/>{gruposQpr.map(g => <Scatter key={g.nome} name={g.nome} data={g.itens} fill={g.cor}/>)}</ScatterChart></ResponsiveContainer></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">{gruposQpr.map(g => <div key={g.nome} className="rounded-md bg-muted/50 p-2"><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: g.cor }}/><strong>{g.nome}</strong><br/><span className="text-muted-foreground">{g.itens.length} itens</span></div>)}</div></div><div className="card-adega p-4"><h3 className="font-semibold mb-1">Como agir</h3><div className="space-y-3 text-sm"><p><strong className="text-success">Estrela:</strong> mantenha estoque e destaque.</p><p><strong className="text-primary">Potencial:</strong> teste exposição, combo ou divulgação.</p><p><strong className="text-warning">Volume:</strong> negocie custo e proteja a margem.</p><p><strong className="text-destructive">Revisar:</strong> reduza compra, preço ou substitua.</p></div></div></div><div className="card-adega overflow-hidden"><div className="p-4 border-b flex gap-3 items-center"><Target className="text-primary" size={20}/><div><h3 className="font-semibold">Fila de decisões recomendadas</h3><p className="text-xs text-muted-foreground">Ações orientadas pelos KPIs da matriz, não por palpite.</p></div></div><div className="divide-y">{recomendacoes.length ? recomendacoes.map(({ p, acao, motivo, tom }) => <div key={`${acao}-${p.id}`} className="p-4 flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{p.nome}</p><p className="text-xs text-muted-foreground">{motivo} · margem {p.margem.toFixed(1)}% · giro {p.qtd} un.</p></div><span className={`font-semibold text-sm ${tom}`}>{acao} {acao === 'Comprar agora' ? <ArrowUpRight className="inline" size={15}/> : <ArrowDownRight className="inline" size={15}/>}</span></div>) : <div className="p-5 text-sm text-muted-foreground">Não há ações urgentes com os dados atuais.</div>}</div></div><div className="card-adega overflow-hidden"><div className="overflow-x-auto"><table className="tbl-adega"><thead><tr><th>Produto</th><th>Qualidade</th><th>Margem líquida</th><th>Giro</th><th>Faturamento</th><th>Quadrante</th></tr></thead><tbody>{qpr.map(p => <tr key={p.id}><td className="font-medium">{p.nome}</td><td>{p.qualidade}/5</td><td>{p.margem.toFixed(1)}%</td><td>{p.qtd} un.</td><td>{fmtR(p.receita)}</td><td><span className="badge-adega badge-info" style={{ borderColor: CORES_QPR[p.classificacao] }}>{p.classificacao}</span></td></tr>)}</tbody></table></div></div></>}</div>
}
