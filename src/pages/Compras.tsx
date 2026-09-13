import { useState } from 'react'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { motion, AnimatePresence } from 'motion/react'
import { Wand2, HelpCircle } from 'lucide-react'
import { GerenciarCompras } from '../components/GerenciarCompras'
import { PurchasingDashboard } from '../components/PurchasingDashboard'
import { TutorialCompras } from '../components/TutorialCompras'
import { agenteCompras } from '../lib/purchasing/engine'
import { otimizarOrcamento } from '../lib/purchasing/optimizer'
import type { DecisaoCompra } from '../lib/purchasing/types'

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const itemVariants = { hidden: { y: 10, opacity: 0 }, show: { y: 0, opacity: 1 } }

export function Compras() {
  const { produtos, vendas, movimentacoes, addPedidoCompra } = useStore()
  const [orcamento, setOrcamento] = useState<number>(5000)
  const [decisoes, setDecisoes] = useState<DecisaoCompra[]>([])
  const [modo, setModo] = useState<'recommendation' | 'controlled' | 'autonomous'>('recommendation')
  const [showHelp, setShowHelp] = useState(false)

  const rodarAgente = async () => {
    const todosPedidos = useStore.getState().pedidosCompra
    const lojaId = useStore.getState().lojaId
    
    const sugestoes: DecisaoCompra[] = await Promise.all(produtos.map(async p => {
        const transito = todosPedidos
            .filter(ped => ped.status === 'pending' || ped.status === 'in_transit')
            .flatMap(ped => ped.itens)
            .filter(i => i.produtoId === p.id)
            .reduce((acc, i) => acc + i.quantidade, 0)
        
        return await agenteCompras(p, movimentacoes, vendas, transito, lojaId, todosPedidos, modo)
    }))
    setDecisoes(sugestoes)
  }

  const realizarCompraInteligente = () => {
      const { carrinho } = otimizarOrcamento(decisoes, produtos, orcamento)
      if (carrinho.length === 0) {
          toast('Nenhuma compra recomendada para este orçamento', 'warning')
          return
      }
      
      addPedidoCompra({
          id: 'ped_' + Math.random().toString(36).substr(2, 9),
          fornecedorId: 'fornec_default',
          status: 'pending',
          itens: carrinho.map(c => ({ produtoId: c.produtoId, quantidade: c.quantidade, precoCusto: produtos.find(p => p.id === c.produtoId)?.precoCompra || 0 })),
          dataPedido: new Date().toISOString(),
          lojaId: useStore.getState().lojaId
      })
      toast('Pedido de compra criado com sucesso!', 'success')
      setDecisoes([])
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 p-6 pb-24">
      <TutorialCompras isOpen={showHelp} onClose={() => setShowHelp(false)} />

      <div className="flex justify-between items-center">
         <PurchasingDashboard onModeChange={(m) => setModo(m as any)} />
         <button onClick={() => setShowHelp(true)} className="p-2 bg-white rounded-lg shadow border hover:bg-slate-50"><HelpCircle size={20}/></button>
      </div>

      <GerenciarCompras />
      
      <div className="card-adega p-6 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
            <Wand2 className="text-amber-500" /> Agente de Compras Inteligente
        </h2>
        <div className="flex gap-4 items-end">
            <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Orçamento Disponível</label>
                <input type="number" className="w-full p-2 border rounded-lg" value={orcamento} onChange={e => setOrcamento(Number(e.target.value))} />
            </div>
            <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Modo de Automação</label>
                <select value={modo} onChange={(e) => setModo(e.target.value as any)} className="w-full p-2 border rounded-lg bg-white">
                    <option value="recommendation">Recomendação (Sugerir)</option>
                    <option value="controlled">Controlado (Aprovar)</option>
                    <option value="autonomous">Autônomo (Auto-compra)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 italic">
                    {modo === 'recommendation' && "O agente apenas recomenda produtos."}
                    {modo === 'controlled' && "O agente cria o pedido e você confirma."}
                    {modo === 'autonomous' && "O agente compra itens críticos automaticamente."}
                </p>
            </div>
            <button onClick={rodarAgente} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold">Analisar Mercado</button>
        </div>
      </div>

      <AnimatePresence>
        {decisoes.length > 0 && (
          <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4">
            {decisoes.map(d => {
                const p = produtos.find(x => x.id === d.produtoId)
                if (!p) return null
                return (
                    <motion.div variants={itemVariants} key={d.produtoId} className="p-4 border rounded-xl bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between">
                            <span className="font-bold text-lg">{p.nome}</span>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${d.prioridade === 'CRITICA' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{d.prioridade}</span>
                        </div>
                        <p className="text-sm font-semibold">{d.decisao} - Sugestão: {d.quantidadeSugerida} unidades</p>
                        <p className="text-xs text-muted-foreground">{d.motivacao.join(' | ')}</p>
                        <div className="text-[10px] text-slate-400 font-mono mt-2">VEC: {d.vec.toFixed(2)} | Confiança: {d.confianca}%</div>
                    </motion.div>
                )
            })}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sticky Action Footer */}
      {decisoes.length > 0 && (
          <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t shadow-lg z-40">
             <button onClick={realizarCompraInteligente} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold text-lg">Executar Compra Otimizada</button>
          </div>
      )}
    </motion.div>
  )
}
