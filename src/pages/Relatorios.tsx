import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useStore, fmtR } from '../lib/store'
import { desempenhoEntregadores, resumirFinanceiro } from '../lib/analytics'

export function Relatorios() {
  const { vendas, produtos, caixaEntradas, entregas } = useStore()
  const [taxaCartao, setTaxaCartao] = useState(3)
  const resumo = useMemo(() => resumirFinanceiro(vendas, produtos, caixaEntradas, taxaCartao), [caixaEntradas, produtos, taxaCartao, vendas])
  const entregadores = useMemo(() => desempenhoEntregadores(entregas), [entregas])
  const exportar = () => {
    const linhas = [['Indicador','Valor'],['Receita',resumo.receita],['CMV',resumo.cmv],['Taxas estimadas',resumo.taxasEstimadas],['Sangrias/perdas',resumo.perdas],['Resultado operacional',resumo.lucroOperacional],['Contas a receber',resumo.contasAReceber]]
    const blob = new Blob([`\uFEFF${linhas.map(l => l.join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio-gerencial-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Relatório gerencial</h2><p className="text-sm text-muted-foreground">Resultado operacional, recebíveis e desempenho de entregas.</p></div><button onClick={exportar} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Download size={16}/>Exportar CSV</button></div><div className="card-adega p-4 max-w-sm"><label className="text-xs font-semibold uppercase text-muted-foreground">Taxa média de cartão (%)</label><input type="number" min="0" step="0.1" value={taxaCartao} onChange={e => setTaxaCartao(Number(e.target.value) || 0)} className="mt-1 w-full rounded-lg border bg-background p-2"/></div><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[['Receita',fmtR(resumo.receita)],['CMV',fmtR(resumo.cmv)],['Resultado operacional',fmtR(resumo.lucroOperacional)],['Margem operacional',`${resumo.margemOperacional.toFixed(1)}%`],['Taxas estimadas',fmtR(resumo.taxasEstimadas)],['Sangrias/perdas',fmtR(resumo.perdas)],['Contas a receber',fmtR(resumo.contasAReceber)]].map(([k,v]) => <div key={k} className="card-adega p-4"><div className="kpi-label">{k}</div><div className="kpi-value">{v}</div></div>)}</div><div className="card-adega overflow-hidden"><div className="p-4 border-b"><h3 className="font-semibold">Desempenho dos entregadores</h3></div><div className="overflow-x-auto"><table className="tbl-adega"><thead><tr><th>Entregador</th><th>Pedidos</th><th>Taxa de sucesso</th><th>Tempo médio</th></tr></thead><tbody>{entregadores.length ? entregadores.map(e => <tr key={e.nome}><td>{e.nome}</td><td>{e.total}</td><td>{e.taxaSucesso.toFixed(0)}%</td><td>{e.tempoMedio ? `${e.tempoMedio.toFixed(0)} min` : '—'}</td></tr>) : <tr><td colSpan={4} className="text-center text-muted-foreground py-8">Sem entregas atribuídas.</td></tr>}</tbody></table></div></div></div>
}
