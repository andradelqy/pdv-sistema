import { AlertTriangle, CheckCircle2, Clock3, PackageSearch, ShoppingCart } from 'lucide-react'
import type { InventoryEngineResult } from '../lib/intelligence/types'
import { fmtR } from '../lib/store'

type Props = {
  decisoes: InventoryEngineResult[]
  valorPlanejado: number
  itensPlanejados: number
  atualizadoEm?: Date
}

/** Painel exclusivamente derivado da análise atual; não usa logs de demonstração. */
export function PurchasingDashboard({ decisoes, valorPlanejado, itensPlanejados, atualizadoEm }: Props) {
  const urgentes = decisoes.filter(d => d.recommendation === 'BUY_NOW')
  const reposicao = decisoes.filter(d => d.recommendation === 'BUY_SOON')
  const riscoMedio = decisoes.length ? decisoes.reduce((soma, decisao) => soma + decisao.ruptureRisk, 0) / decisoes.length : 0
  const coberturaCritica = decisoes.filter(d => d.demandForecast > 0 && d.daysOfCover < 3).length

  return <section className="card-adega p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-start">
      <div><h2 className="text-xl font-bold">Resumo da análise de compras</h2><p className="text-sm text-muted-foreground">Indicadores calculados com o estoque, pedidos e vendas carregados agora.</p></div>
      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock3 size={14}/>{atualizadoEm ? `Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Aguardando análise'}</span>
    </div>
    {!decisoes.length ? <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Não há produtos físicos para analisar nesta loja.</div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Compra urgente</div><div className={`mt-1 text-2xl font-bold ${urgentes.length ? 'text-destructive' : 'text-success'}`}>{urgentes.length} itens</div><p className="mt-1 text-xs text-muted-foreground">Ruptura ou estoque crítico</p></div>
      <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Reposição planejada</div><div className="mt-1 text-2xl font-bold text-primary">{itensPlanejados} un.</div><p className="mt-1 text-xs text-muted-foreground">Dentro do orçamento atual</p></div>
      <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Investimento sugerido</div><div className="mt-1 text-2xl font-bold">{fmtR(valorPlanejado)}</div><p className="mt-1 text-xs text-muted-foreground">Custo dos itens do plano</p></div>
      <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Risco médio de ruptura</div><div className={`mt-1 text-2xl font-bold ${riscoMedio >= .6 ? 'text-destructive' : riscoMedio >= .35 ? 'text-warning' : 'text-success'}`}>{Math.round(riscoMedio * 100)}%</div><p className="mt-1 text-xs text-muted-foreground">{coberturaCritica} item(ns) com menos de 3 dias</p></div>
    </div>}
    {decisoes.length > 0 && <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span className="flex gap-1 items-center"><AlertTriangle size={15} className="text-destructive"/> {urgentes.length} urgentes</span><span className="flex gap-1 items-center"><ShoppingCart size={15} className="text-primary"/> {reposicao.length} para reposição</span><span className="flex gap-1 items-center"><PackageSearch size={15} className="text-muted-foreground"/> {decisoes.length} produtos analisados</span><span className="flex gap-1 items-center"><CheckCircle2 size={15} className="text-success"/> Dados atuais da loja</span></div>}
  </section>
}
