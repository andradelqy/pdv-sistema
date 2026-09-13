import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { motion, AnimatePresence } from 'motion/react'
import { Wand2, HelpCircle } from 'lucide-react'
import { GerenciarCompras } from '../components/GerenciarCompras'
import { PurchasingDashboard } from '../components/PurchasingDashboard'
import { TutorialCompras } from '../components/TutorialCompras'
import { getInventoryPolicy } from '../lib/intelligence/engine'
import type { InventoryEngineResult } from '../lib/intelligence/types'
import type { Produto } from '../lib/store'

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const itemVariants = { hidden: { y: 10, opacity: 0 }, show: { y: 0, opacity: 1 } }

type ItemPlanejado = { produtoId: string; quantidade: number; precoCusto: number; fornecedorId: string }

function otimizarPlano(decisoes: InventoryEngineResult[], produtos: Produto[], orcamento: number, autonomo: boolean): ItemPlanejado[] {
  let saldo = Math.max(0, orcamento)
  return decisoes
    .filter(d => d.recommendedPurchaseQty > 0 && (d.recommendation === 'BUY_NOW' || d.recommendation === 'BUY_SOON'))
    .filter(d => !autonomo || (d.recommendation === 'BUY_NOW' && d.confidenceScore >= 70))
    .map(decisao => ({ decisao, produto: produtos.find(produto => produto.id === decisao.productId)! }))
    .filter(({ produto }) => Boolean(produto) && produto.precoCompra > 0)
    .sort((a, b) => {
      const prioridade = ({ decisao, produto }: typeof a) =>
        (decisao.recommendation === 'BUY_NOW' ? 100 : 40) + decisao.ruptureRisk * 100 + decisao.automaticImportanceScore + decisao.confidenceScore * 0.25 + ((produto.precoVenda - produto.precoCompra) / produto.precoVenda) * 25
      return prioridade(b) - prioridade(a)
    })
    .flatMap(({ decisao, produto }) => {
      const quantidade = Math.min(decisao.recommendedPurchaseQty, Math.floor(saldo / produto.precoCompra))
      if (quantidade <= 0) return []
      saldo -= quantidade * produto.precoCompra
      return [{ produtoId: produto.id, quantidade, precoCusto: produto.precoCompra, fornecedorId: produto.fornecedor?.trim() || 'sem_fornecedor' }]
    })
}

export function Compras() {
  const { produtos, vendas, pedidosCompra, addPedidoCompra } = useStore()
  const [orcamento, setOrcamento] = useState<number>(5000)
  const [decisoes, setDecisoes] = useState<InventoryEngineResult[]>([])
  const [modo, setModo] = useState<'recommendation' | 'controlled' | 'autonomous'>('recommendation')
  const [showHelp, setShowHelp] = useState(false)
  const plano = useMemo(() => otimizarPlano(decisoes, produtos, orcamento, modo === 'autonomous'), [decisoes, produtos, orcamento, modo])

  const rodarAgente = async () => {
    const todosPedidos = useStore.getState().pedidosCompra
    const lojaId = useStore.getState().lojaId
    
    const sugestoes: InventoryEngineResult[] = await Promise.all(produtos.map(async p => {
        return await getInventoryPolicy(p, vendas, todosPedidos, lojaId, produtos)
    }))
    setDecisoes(sugestoes)
  }

  const realizarCompraInteligente = () => {
      if (modo === 'recommendation') {
        toast('Modo recomendação: revise o plano e escolha Controlado ou Autônomo para criar pedidos.', 'warning')
        return
      }

      const carrinho = plano

      if (carrinho.length === 0) {
          toast('Nenhuma compra recomendada para este orçamento', 'warning')
          return
      }
      
      const porFornecedor = carrinho.reduce<Record<string, ItemPlanejado[]>>((grupos, item) => {
        ;(grupos[item.fornecedorId] ??= []).push(item)
        return grupos
      }, {})
      for (const [fornecedorId, itens] of Object.entries(porFornecedor)) addPedidoCompra({
          id: 'ped_' + Math.random().toString(36).substr(2, 9),
          fornecedorId,
          status: modo === 'autonomous' ? 'pending' : 'draft',
          itens: itens.map(({ produtoId, quantidade, precoCusto }) => ({ produtoId, quantidade, precoCusto })),
          dataPedido: new Date().toISOString(),
          lojaId: useStore.getState().lojaId
      })
      toast(`${Object.keys(porFornecedor).length} pedido(s) criado(s) dentro do orçamento de ${orcamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, 'success')
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
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Modo de Automação
                </label>
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
                const p = produtos.find(x => x.id === d.productId)
                const itemPlanejado = plano.find(item => item.produtoId === d.productId)
                const emTransito = pedidosCompra
                  .filter(pedido => pedido.status === 'pending' || pedido.status === 'in_transit')
                  .reduce((soma, pedido) => soma + (pedido.itens.find(item => item.produtoId === d.productId)?.quantidade ?? 0), 0)
                if (!p) return null
                return (
                    <motion.div variants={itemVariants} key={d.productId} className="p-4 border rounded-xl bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between">
                            <span className="font-bold text-lg">{p.nome}</span>
                            <span className={`px-2 py-1 rounded text-xs font-bold`}>{d.recommendation}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                          <span>Estoque atual: <strong>{p.estoque} un.</strong></span>
                          <span>Em reposição: <strong>{emTransito} un.</strong></span>
                          <span>Ponto de pedido: <strong>{d.reorderPoint} un.</strong></span>
                          <span>Estoque alvo: <strong>{d.maximumStock} un.</strong></span>
                        </div>
                        <p className="text-sm font-semibold">Compra necessária: {d.recommendedPurchaseQty} un. {itemPlanejado ? `Plano dentro do orçamento: ${itemPlanejado.quantidade} un.` : 'Fora do plano por orçamento, confiança ou custo.'}</p>
                        <p className="text-xs text-muted-foreground">{d.reasons.join(' | ')}</p>
                        <div className="text-[10px] text-slate-400 font-mono mt-2">Score Importância: {d.automaticImportanceScore} | Confiança: {d.confidenceScore}%</div>
                    </motion.div>
                )
            })}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sticky Action Footer */}
      {decisoes.length > 0 && (
          <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t shadow-lg z-40">
             <button onClick={realizarCompraInteligente} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold text-lg">{modo === 'recommendation' ? 'Plano para revisão' : modo === 'controlled' ? 'Criar pedidos para aprovação' : 'Criar pedidos autônomos'}</button>
          </div>
      )}
    </motion.div>
  )
}
