import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

type ProdutoABC = {
  produto_id: string
  nome: string
  estoque_atual: number
  receita_total: number
  quantidade_vendida: number
}

type Alerta = {
  id: string
  mensagem: string
  created_at: string
  resolvido: boolean
}

export function PainelBI() {
  const [curvaABC, setCurvaABC] = useState<ProdutoABC[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregarDados() {
      // 1. Busca a Curva ABC (View Materializada)
      const { data: dadosABC } = await supabase.from('vw_curva_abc').select('*')
      
      // 2. Busca Alertas não resolvidos
      const { data: dadosAlertas } = await supabase
        .from('alertas_compra')
        .select('*')
        .eq('resolvido', false)
        .order('created_at', { ascending: false })

      if (dadosABC) setCurvaABC(dadosABC)
      if (dadosAlertas) setAlertas(dadosAlertas)
      setCarregando(false)
    }

    carregarDados()
  }, [])

  const resolverAlerta = async (id: string) => {
    await supabase.from('alertas_compra').update({ resolvido: true }).eq('id', id)
    setAlertas(alertas.filter(a => a.id !== id))
  }

  if (carregando) return <div className="p-4">Carregando métricas...</div>

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      
      {/* SEÇÃO 1: Alertas Automáticos */}
      <div className="bg-card border border-destructive/30 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4 text-destructive flex items-center gap-2">
          🔔 Alertas de Reposição (Gatilho SQL)
        </h2>
        
        {alertas.length === 0 ? (
          <p className="text-muted-foreground">Estoque controlado. Nenhum alerta crítico.</p>
        ) : (
          <div className="space-y-3">
            {alertas.map(alerta => (
              <div key={alerta.id} className="flex justify-between items-center bg-destructive/10 p-4 rounded border border-destructive/20">
                <span className="font-medium">{alerta.mensagem}</span>
                <button 
                  onClick={() => resolverAlerta(alerta.id)}
                  className="px-4 py-2 bg-background border border-border rounded hover:bg-muted text-sm"
                >
                  Marcar como Resolvido
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SEÇÃO 2: Curva ABC */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          📈 Ranking de Produtos (Curva ABC)
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Processado via View Materializada (Alta Performance)
        </p>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Qtd Vendida</th>
              <th className="p-3 text-right">Receita Total</th>
              <th className="p-3 text-right">Estoque Restante</th>
            </tr>
          </thead>
          <tbody>
            {curvaABC.map((prod, index) => (
              <tr key={prod.produto_id} className="border-b border-border/50 hover:bg-muted/50">
                <td className="p-3 flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white
                    ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-primary/50'}`}>
                    {index + 1}
                  </span>
                  {prod.nome}
                </td>
                <td className="p-3 text-right">{prod.quantidade_vendida}</td>
                <td className="p-3 text-right text-green-600 font-medium">
                  R$ {prod.receita_total.toFixed(2)}
                </td>
                <td className="p-3 text-right">{prod.estoque_atual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}