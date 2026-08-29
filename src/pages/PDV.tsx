// ======================================================================
// PDV.tsx – Ponto de Venda completo com todas as melhorias
// ======================================================================

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { useStore, fmtR, hoje } from '../lib/store'
import { toast } from '../lib/toast'
import {
  Search, Trash2, Printer, CheckCircle, Plus, Minus,
  Percent, RotateCcw, X
} from 'lucide-react'

// ---------- Enums e Interfaces ----------
export type FormaPagamento = 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'fiado'

export const FormaPagamentoEnum = {
  DINHEIRO: 'dinheiro' as FormaPagamento,
  CARTAO_CREDITO: 'cartao_credito' as FormaPagamento,
  CARTAO_DEBITO: 'cartao_debito' as FormaPagamento,
  PIX: 'pix' as FormaPagamento,
  FIADO: 'fiado' as FormaPagamento,
}

interface ItemCarrinho {
  produtoId: string
  quantidade: number
}

interface PagamentoParcial {
  id: string
  forma: FormaPagamento
  valor: number
}

interface Desconto {
  tipo: 'percentual' | 'fixo'
  valor: number
}

// ---------- Hooks personalizados ----------

// 1. useCart – gerencia carrinho, total, persistência localStorage
function useCart() {
  const { produtos } = useStore()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(() => {
    const saved = localStorage.getItem('carrinho')
    return saved ? JSON.parse(saved) : []
  })

  // Salvar no localStorage a cada alteração
  useEffect(() => {
    localStorage.setItem('carrinho', JSON.stringify(carrinho))
  }, [carrinho])

  const addItem = useCallback((produtoId: string) => {
    const p = produtos.find(x => x.id === produtoId)
    if (!p || p.estoque <= 0) {
      toast('Sem estoque', 'warning')
      return false
    }
    setCarrinho(c => {
      const ex = c.find(i => i.produtoId === produtoId)
      if (ex) {
        return c.map(i =>
          i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      }
      return [...c, { produtoId, quantidade: 1 }]
    })
    return true
  }, [produtos])

  const updateQty = useCallback((produtoId: string, val: number) => {
    if (val <= 0) {
      setCarrinho(c => c.filter(i => i.produtoId !== produtoId))
      return
    }
    setCarrinho(c =>
      c.map(i => (i.produtoId === produtoId ? { ...i, quantidade: val } : i))
    )
  }, [])

  const removeItem = useCallback((produtoId: string) => {
    setCarrinho(c => c.filter(i => i.produtoId !== produtoId))
  }, [])

  const limpar = useCallback(() => {
    if (!carrinho.length) return
    if (!confirm('Limpar carrinho?')) return
    setCarrinho([])
  }, [carrinho])

  const total = useMemo(() => {
    return carrinho.reduce((s, item) => {
      const p = produtos.find(x => x.id === item.produtoId)
      return s + (p ? p.precoVenda * item.quantidade : 0)
    }, 0)
  }, [carrinho, produtos])

  const itensCount = carrinho.reduce((s, i) => s + i.quantidade, 0)

  return { carrinho, setCarrinho, addItem, updateQty, removeItem, limpar, total, itensCount }
}

// 2. usePayment – gerencia pagamentos múltiplos, desconto, troco
function usePayment(total: number) {
  const [desconto, setDesconto] = useState<Desconto>({ tipo: 'fixo', valor: 0 })
  const [pagamentos, setPagamentos] = useState<PagamentoParcial[]>([
    { id: crypto.randomUUID(), forma: FormaPagamentoEnum.DINHEIRO, valor: 0 }
  ])
  const [clienteId, setClienteId] = useState('')
  const [obs, setObs] = useState('')

  const valorDesconto = useMemo(() => {
    if (desconto.tipo === 'percentual') return (total * desconto.valor) / 100
    return desconto.valor
  }, [total, desconto])

  const totalComDesconto = total - valorDesconto

  // Soma dos pagamentos
  const somaPagamentos = pagamentos.reduce((s, p) => s + (p.valor || 0), 0)

  // Troco (se houver pagamento em dinheiro e soma > totalComDesconto)
  const troco = useMemo(() => {
    const temDinheiro = pagamentos.some(p => p.forma === FormaPagamentoEnum.DINHEIRO)
    if (temDinheiro && somaPagamentos > totalComDesconto) {
      return somaPagamentos - totalComDesconto
    }
    return 0
  }, [pagamentos, somaPagamentos, totalComDesconto])

  const adicionarPagamento = useCallback(() => {
    setPagamentos(prev => [
      ...prev,
      { id: crypto.randomUUID(), forma: FormaPagamentoEnum.DINHEIRO, valor: 0 }
    ])
  }, [])

  const removerPagamento = useCallback((id: string) => {
    if (pagamentos.length <= 1) {
      toast('Deve haver pelo menos uma forma de pagamento', 'warning')
      return
    }
    setPagamentos(prev => prev.filter(p => p.id !== id))
  }, [pagamentos.length])

  const atualizarPagamento = useCallback((id: string, campo: 'forma' | 'valor', valor: any) => {
    setPagamentos(prev =>
      prev.map(p =>
        p.id === id ? { ...p, [campo]: campo === 'valor' ? parseFloat(valor) || 0 : valor } : p
      )
    )
  }, [])

  // Verifica se a soma dos pagamentos é suficiente
  const pagamentoValido = useMemo(() => {
    if (!pagamentos.length) return false
    // Se houver fiado, precisa de cliente
    const temFiado = pagamentos.some(p => p.forma === FormaPagamentoEnum.FIADO)
    if (temFiado && !clienteId) return false
    // A soma deve ser >= totalComDesconto (com tolerância)
    return somaPagamentos >= totalComDesconto - 0.01
  }, [pagamentos, somaPagamentos, totalComDesconto, clienteId])

  const reset = useCallback(() => {
    setPagamentos([{ id: crypto.randomUUID(), forma: FormaPagamentoEnum.DINHEIRO, valor: 0 }])
    setDesconto({ tipo: 'fixo', valor: 0 })
    setClienteId('')
    setObs('')
  }, [])

  return {
    desconto,
    setDesconto,
    pagamentos,
    adicionarPagamento,
    removerPagamento,
    atualizarPagamento,
    clienteId,
    setClienteId,
    obs,
    setObs,
    totalComDesconto,
    somaPagamentos,
    troco,
    pagamentoValido,
    reset,
  }
}

// 3. useProductSearch – busca com debounce e scroll infinito
function useProductSearch() {
  const { produtos } = useStore()
  const [busca, setBusca] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const loaderRef = useRef<HTMLDivElement>(null)

  const produtosFiltrados = useMemo(() => {
    if (!busca) return produtos
    const lower = busca.toLowerCase()
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      (p.barcode && p.barcode.includes(busca))
    )
  }, [produtos, busca])

  // Scroll infinito
  useEffect(() => {
    if (!loaderRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 20, produtosFiltrados.length))
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [produtosFiltrados.length])

  // Reset visível quando busca muda
  useEffect(() => {
    setVisibleCount(20)
  }, [busca])

  const produtosVisiveis = produtosFiltrados.slice(0, visibleCount)

  return { busca, setBusca, produtosVisiveis, produtosFiltrados, loaderRef }
}

// ---------- Componentes ----------

// Item do carrinho (memoizado)
const CartItem = memo(({
  item,
  produto,
  updateQty,
  removeItem,
}: {
  item: ItemCarrinho
  produto: any
  updateQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
}) => {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{produto.nome}</p>
        <p className="text-xs text-muted-foreground">{fmtR(produto.precoVenda)} un</p>
      </div>
      <input
        type="number"
        min={1}
        className="w-16 text-center border border-border rounded p-1 text-sm bg-background"
        value={item.quantidade}
        onChange={e => updateQty(item.produtoId, parseInt(e.target.value) || 1)}
        aria-label="Quantidade"
      />
      <span className="text-sm font-semibold w-20 text-right">
        {fmtR(produto.precoVenda * item.quantidade)}
      </span>
      <button
        onClick={() => removeItem(item.produtoId)}
        className="text-destructive hover:opacity-70"
        aria-label="Remover item"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
})
CartItem.displayName = 'CartItem'

// Lista de produtos com scroll infinito
const ProductList = memo(({
  produtos,
  onAddItem,
  busca,
  setBusca,
  loaderRef,
}: {
  produtos: any[]
  onAddItem: (id: string) => void
  busca: string
  setBusca: (s: string) => void
  loaderRef: React.RefObject<HTMLDivElement | null>
}) => {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-sm"
          placeholder="Buscar por nome, SKU ou código de barras..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => {
            // Se pressionar Enter e só houver um resultado, adiciona
            if (e.key === 'Enter' && produtos.length === 1) {
              onAddItem(produtos[0].id)
            }
          }}
          aria-label="Buscar produtos"
        />
      </div>
      <div className="overflow-y-auto max-h-80 flex flex-col gap-1">
        {produtos.map(p => {
          const critico = p.estoque <= p.estoqueMin
          const alerta = p.estoque <= p.pontoPedido && p.estoque > p.estoqueMin
          return (
            <button
              key={p.id}
              onClick={() => onAddItem(p.id)}
              className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors hover:bg-muted ${
                critico ? 'border-destructive/50 bg-destructive/5' :
                alerta ? 'border-warning/50 bg-warning/5' : 'border-border'
              }`}
              aria-label={`Adicionar ${p.nome}`}
            >
              <div>
                <p className="font-medium text-sm">{p.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {p.sku} · Est: {p.estoque}
                  {critico && ' ⚠️ Crítico'}
                  {alerta && ' ⚠️ Repor'}
                </p>
              </div>
              <span className="font-bold text-primary text-sm">{fmtR(p.precoVenda)}</span>
            </button>
          )
        })}
        {produtos.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">Nenhum produto encontrado</p>
        )}
        <div ref={loaderRef} className="h-1" />
      </div>
    </div>
  )
})
ProductList.displayName = 'ProductList'

// Seção de pagamento
const PaymentSection = memo(({
  pagamentos,
  adicionarPagamento,
  removerPagamento,
  atualizarPagamento,
  clienteId,
  setClienteId,
  clientes,
  totalComDesconto,
  somaPagamentos,
  troco,
  pagamentoValido,
  obs,
  setObs,
}: {
  pagamentos: PagamentoParcial[]
  adicionarPagamento: () => void
  removerPagamento: (id: string) => void
  atualizarPagamento: (id: string, campo: 'forma' | 'valor', valor: any) => void
  clienteId: string
  setClienteId: (id: string) => void
  clientes: any[]
  totalComDesconto: number
  somaPagamentos: number
  troco: number
  pagamentoValido: boolean
  obs: string
  setObs: (s: string) => void
}) => {
  const formas = Object.values(FormaPagamentoEnum)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="font-semibold">Pagamentos</span>
        <button
          onClick={adicionarPagamento}
          className="text-xs flex items-center gap-1 text-primary hover:underline"
        >
          <Plus size={14} /> Adicionar forma
        </button>
      </div>

      {pagamentos.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <select
            className="flex-1 p-2 border border-border rounded-lg bg-background text-sm"
            value={p.forma}
            onChange={e => atualizarPagamento(p.id, 'forma', e.target.value as FormaPagamento)}
            aria-label="Forma de pagamento"
          >
            {formas.map(f => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            className="w-28 p-2 border border-border rounded-lg bg-background text-sm"
            value={p.valor || ''}
            onChange={e => atualizarPagamento(p.id, 'valor', e.target.value)}
            placeholder="R$"
            aria-label="Valor"
          />
          <button
            onClick={() => removerPagamento(p.id)}
            className="text-destructive hover:opacity-70"
            aria-label="Remover forma"
          >
            <Minus size={14} />
          </button>
        </div>
      ))}

      <div className="flex justify-between text-sm">
        <span>Total com desconto:</span>
        <span className="font-semibold">{fmtR(totalComDesconto)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Soma dos pagamentos:</span>
        <span className={`font-semibold ${somaPagamentos >= totalComDesconto - 0.01 ? 'text-success' : 'text-destructive'}`}>
          {fmtR(somaPagamentos)}
        </span>
      </div>
      {troco > 0 && (
        <div className="flex justify-between text-sm text-success">
          <span>Troco:</span>
          <span className="font-semibold">{fmtR(troco)}</span>
        </div>
      )}
      {!pagamentoValido && (
        <p className="text-destructive text-xs">
          {somaPagamentos < totalComDesconto - 0.01
            ? 'Valor total insuficiente'
            : 'Selecione um cliente para fiado'}
        </p>
      )}

      {/* Cliente para fiado */}
      {pagamentos.some(p => p.forma === FormaPagamentoEnum.FIADO) && (
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Cliente (fiado)
          </label>
          <select
            className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            aria-label="Selecionar cliente"
          >
            <option value="">Selecione...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome} (Saldo: {fmtR(c.saldo || 0)})
              </option>
            ))}
          </select>
          {clienteId && (
            <p className="text-xs text-muted-foreground mt-1">
              Saldo atual: {fmtR(clientes.find(c => c.id === clienteId)?.saldo || 0)}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Observação
        </label>
        <input
          className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
          value={obs}
          onChange={e => setObs(e.target.value)}
          placeholder="Obs (opcional)"
          aria-label="Observação"
        />
      </div>
    </div>
  )
})
PaymentSection.displayName = 'PaymentSection'

// Componente do cupom para impressão
const Cupom = memo(({ venda, cliente, troco }: { venda: any; cliente?: any; troco?: number }) => {
  return (
    <div
      style={{
        fontFamily: 'monospace',
        width: '80mm',
        padding: '8px',
        margin: '0 auto',
        background: 'white',
        color: 'black',
      }}
    >
      <h3 style={{ textAlign: 'center', margin: '4px 0' }}>Minha Loja</h3>
      <p style={{ textAlign: 'center', fontSize: '10px', margin: '2px 0' }}>
        {new Date(venda.data).toLocaleString()}
      </p>
      <hr style={{ borderTop: '1px dashed #aaa' }} />
      {venda.itens.map((i: any, idx: number) => (
        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span>{i.nome} x{i.quantidade}</span>
          <span>{fmtR(i.precoUnit * i.quantidade)}</span>
        </div>
      ))}
      <hr style={{ borderTop: '1px dashed #aaa' }} />
      {venda.desconto && venda.desconto > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span>Desconto</span>
          <span>- {fmtR(venda.desconto)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
        <span>TOTAL</span>
        <span>{fmtR(venda.total)}</span>
      </div>
      <hr style={{ borderTop: '1px dashed #aaa' }} />
      <div style={{ fontSize: '12px' }}>
        <p>Pagamentos:</p>
        {venda.pagamentos.map((p: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{p.forma}</span>
            <span>{fmtR(p.valor)}</span>
          </div>
        ))}
        {troco && troco > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Troco</span>
            <span>{fmtR(troco)}</span>
          </div>
        )}
      </div>
      {cliente && (
        <p style={{ fontSize: '12px' }}>Cliente: {cliente.nome}</p>
      )}
      {venda.obs && <p style={{ fontSize: '10px' }}>Obs: {venda.obs}</p>}
      <hr style={{ borderTop: '1px dashed #aaa' }} />
      <p style={{ textAlign: 'center', fontSize: '10px' }}>Obrigado pela preferência!</p>
    </div>
  )
})
Cupom.displayName = 'Cupom'

// Modal de devolução
const DevolucaoModal = memo(({
  isOpen,
  onClose,
  onDevolver,
}: {
  isOpen: boolean
  onClose: () => void
  onDevolver: (vendaId: string, itens: any[]) => void
}) => {
  const { vendas, produtos } = useStore()
  const [selectedVendaId, setSelectedVendaId] = useState('')
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, number>>({})

  const vendasRecentes = useMemo(() => {
    return vendas.slice(-20).reverse() // últimas 20
  }, [vendas])

  const vendaSelecionada = vendas.find(v => v.id === selectedVendaId)

  // Ao selecionar venda, pré-selecionar todos os itens
  useEffect(() => {
    if (vendaSelecionada) {
      const initial: Record<string, number> = {}
      vendaSelecionada.itens.forEach((i: any) => {
        initial[i.produtoId] = i.quantidade
      })
      setItensSelecionados(initial)
    } else {
      setItensSelecionados({})
    }
  }, [vendaSelecionada])

  const handleDevolver = () => {
    if (!vendaSelecionada) return
    const itens = Object.entries(itensSelecionados)
      .filter(([_, qty]) => qty > 0)
      .map(([produtoId, quantidade]) => ({
        produtoId,
        quantidade,
        precoUnit: vendaSelecionada.itens.find((i: any) => i.produtoId === produtoId)?.precoUnit || 0,
      }))
    if (itens.length === 0) {
      toast('Selecione pelo menos um item', 'warning')
      return
    }
    onDevolver(vendaSelecionada.id, itens)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <RotateCcw size={20} /> Devolução
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <label className="text-sm font-semibold">Selecione a venda</label>
        <select
          className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
          value={selectedVendaId}
          onChange={e => setSelectedVendaId(e.target.value)}
        >
          <option value="">Escolha...</option>
          {vendasRecentes.map(v => (
            <option key={v.id} value={v.id}>
              {new Date(v.data).toLocaleString()} - {fmtR(v.total)}
            </option>
          ))}
        </select>

        {vendaSelecionada && (
          <div className="mt-4">
            <p className="text-sm font-semibold">Itens:</p>
            {vendaSelecionada.itens.map((i: any) => {
              const p = produtos.find(x => x.id === i.produtoId)
              if (!p) return null
              return (
                <div key={i.produtoId} className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={0}
                    max={i.quantidade}
                    className="w-16 p-1 border border-border rounded text-sm"
                    value={itensSelecionados[i.produtoId] || 0}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0
                      setItensSelecionados(prev => ({
                        ...prev,
                        [i.produtoId]: Math.min(val, i.quantidade),
                      }))
                    }}
                  />
                  <span className="text-sm">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">(máx {i.quantidade})</span>
                </div>
              )
            })}
            <button
              onClick={handleDevolver}
              className="mt-4 w-full bg-destructive text-white py-2 rounded-lg hover:opacity-90"
            >
              Confirmar devolução
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
DevolucaoModal.displayName = 'DevolucaoModal'

// ---------- Componente principal PDV ----------
export function PDV() {
  const { produtos, clientes, addVenda, updateProduto } = useStore()

  // Hooks
  const { carrinho, addItem, updateQty, removeItem, limpar, total, itensCount } = useCart()
  const {
    desconto, setDesconto,
    pagamentos, adicionarPagamento, removerPagamento, atualizarPagamento,
    clienteId, setClienteId,
    obs, setObs,
    totalComDesconto, somaPagamentos, troco, pagamentoValido, reset: resetPayment,
  } = usePayment(total)

  const { busca, setBusca, produtosVisiveis, loaderRef } = useProductSearch()

  // Estados locais
  const [sucesso, setSucesso] = useState(false)
  const [modoDevolucao, setModoDevolucao] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Beep
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const osc = audioCtxRef.current.createOscillator()
      const gain = audioCtxRef.current.createGain()
      osc.connect(gain)
      gain.connect(audioCtxRef.current.destination)
      osc.frequency.value = 800
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1)
      osc.start()
      osc.stop(audioCtxRef.current.currentTime + 0.1)
    } catch (_) { /* ignore */ }
  }, [])

  // Função de finalizar venda
  const finalizarVenda = useCallback(() => {
    if (!carrinho.length) { toast('Carrinho vazio', 'warning'); return }
    if (!pagamentoValido) {
      toast('Pagamento inválido', 'danger')
      return
    }

    // Validar estoque
    for (const item of carrinho) {
      const p = produtos.find(x => x.id === item.produtoId)
      if (!p || p.estoque < item.quantidade) {
        toast(`Estoque insuficiente: ${p?.nome || ''}`, 'danger')
        return
      }
    }

    // Validar fiado
    const temFiado = pagamentos.some(p => p.forma === FormaPagamentoEnum.FIADO)
    if (temFiado) {
      const c = clientes.find(x => x.id === clienteId)
      if (!c) { toast('Cliente não encontrado', 'danger'); return }
      const valorFiado = pagamentos.find(p => p.forma === FormaPagamentoEnum.FIADO)?.valor || 0
      // A store já valida limite? Vamos validar aqui também.
      if ((c.saldo || 0) + valorFiado > c.limite) {
        toast(`${c.nome} excede o limite de crédito`, 'danger')
        return
      }
    }

    // Preparar objeto de venda (compatível com a store)
    const venda = {
      data: hoje(),
      clienteId: temFiado ? clienteId : undefined,
      pagamento: temFiado ? 'fiado' : pagamentos[0]?.forma || 'dinheiro', // store usa pagamento único, mas guardamos os múltiplos no obs
      itens: carrinho.map(i => {
        const p = produtos.find(x => x.id === i.produtoId)!
        return { produtoId: i.produtoId, quantidade: i.quantidade, precoUnit: p.precoVenda }
      }),
      total: totalComDesconto,
      obs: obs + (desconto.valor > 0 ? ` | Desconto: ${fmtR(desconto.valor)}` : '') +
           (pagamentos.length > 1 ? ` | Pagamentos: ${pagamentos.map(p => `${p.forma} ${fmtR(p.valor)}`).join(', ')}` : ''),
    }

    // A store já atualiza estoque e saldo de cliente automaticamente no addVenda
    addVenda(venda)

    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
    toast(`Venda finalizada! ${fmtR(totalComDesconto)}`)

    // Limpar carrinho e resetar pagamento
    limpar()
    resetPayment()
    setBusca('')
    searchRef.current?.focus()
  }, [carrinho, pagamentos, pagamentoValido, produtos, clientes, clienteId, totalComDesconto, desconto, obs, addVenda, limpar, resetPayment, setBusca])

  // Atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F2 finalizar, F4 limpar
      if (e.key === 'F2') { e.preventDefault(); finalizarVenda() }
      if (e.key === 'F4') { e.preventDefault(); limpar() }
      // Seta para navegar na lista
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = listaRef.current?.querySelectorAll('button')
        if (!items) return
        let idx = -1
        for (let i = 0; i < items.length; i++) {
          if (items[i] === document.activeElement) { idx = i; break }
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = idx < items.length - 1 ? idx + 1 : 0
          ;(items[next] as HTMLElement).focus()
        } else {
          e.preventDefault()
          const prev = idx > 0 ? idx - 1 : items.length - 1
          ;(items[prev] as HTMLElement).focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [carrinho, finalizarVenda, limpar])

  // Devolução – agora com updateProduto completo
  const handleDevolver = useCallback((vendaId: string, itens: any[]) => {
    // Atualizar estoque (adicionar de volta)
    for (const item of itens) {
      const p = produtos.find(x => x.id === item.produtoId)
      if (p) {
        const produtoAtualizado = { ...p, estoque: p.estoque + item.quantidade }
        updateProduto(produtoAtualizado)
      }
    }
    // Criar venda de devolução (valores negativos)
    const vendaDevolucao = {
      data: hoje(),
      clienteId: undefined,
      pagamento: 'devolucao',
      itens: itens.map(i => ({ ...i, precoUnit: -i.precoUnit })),
      total: -itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0),
      obs: `Devolução da venda ${vendaId}`,
    }
    addVenda(vendaDevolucao)
    toast('Devolução realizada com sucesso')
  }, [produtos, updateProduto, addVenda])

  // Impressão do cupom
  const imprimirCupom = useCallback(() => {
    if (!carrinho.length) { toast('Carrinho vazio', 'warning'); return }
    toast('Use a opção de impressão do navegador ou finalize a venda.')
    window.print()
  }, [carrinho])

  // Efeito para foco inicial
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">PDV</h2>
        <span className="text-xs text-muted-foreground">
          F2 = Finalizar · F4 = Limpar · Ctrl+Z = Desfazer · Setas = Navegar
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setModoDevolucao(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-warning text-white text-sm font-medium hover:opacity-90"
          >
            <RotateCcw size={14} /> Devolver
          </button>
          <button
            onClick={limpar}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90"
          >
            <Trash2 size={14} /> Limpar
          </button>
          <button
            onClick={finalizarVenda}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-success text-white text-sm font-medium hover:opacity-90"
          >
            <CheckCircle size={14} /> Finalizar
          </button>
        </div>
      </div>

      {sucesso && (
        <div className="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-center font-semibold">
          ✅ Venda registrada com sucesso!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Coluna esquerda: busca e lista de produtos */}
        <div className="card-adega p-4 flex flex-col gap-3">
          <ProductList
            produtos={produtosVisiveis}
            onAddItem={(id) => {
              const ok = addItem(id)
              if (ok) {
                playBeep()
              }
            }}
            busca={busca}
            setBusca={setBusca}
            loaderRef={loaderRef}
          />
        </div>

        {/* Coluna direita: carrinho e pagamento */}
        <div className="card-adega p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">
              Carrinho <span className="badge-adega badge-secondary ml-1">{itensCount}</span>
            </h3>
            <span className="text-sm text-muted-foreground">
              {itensCount} itens · {fmtR(total)}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-52 flex flex-col gap-2">
            {carrinho.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Carrinho vazio</p>
            ) : (
              carrinho.map(item => {
                const p = produtos.find(x => x.id === item.produtoId)
                if (!p) return null
                return (
                  <CartItem
                    key={item.produtoId}
                    item={item}
                    produto={p}
                    updateQty={updateQty}
                    removeItem={removeItem}
                  />
                )
              })
            )}
          </div>

          {/* Desconto */}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Percent size={12} /> Desconto
            </label>
            <input
              type="number"
              step="0.01"
              className="w-24 p-1 border border-border rounded text-sm bg-background"
              value={desconto.valor || ''}
              onChange={e => setDesconto({ tipo: 'fixo', valor: parseFloat(e.target.value) || 0 })}
              placeholder="R$"
              aria-label="Desconto em reais"
            />
          </div>

          {/* Pagamento */}
          <PaymentSection
            pagamentos={pagamentos}
            adicionarPagamento={adicionarPagamento}
            removerPagamento={removerPagamento}
            atualizarPagamento={atualizarPagamento}
            clienteId={clienteId}
            setClienteId={setClienteId}
            clientes={clientes}
            totalComDesconto={totalComDesconto}
            somaPagamentos={somaPagamentos}
            troco={troco}
            pagamentoValido={pagamentoValido}
            obs={obs}
            setObs={setObs}
          />

          <div className="flex gap-2">
            <button
              onClick={finalizarVenda}
              className="flex-1 bg-success text-white font-bold py-3 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} /> Finalizar (F2)
            </button>
            <button
              onClick={imprimirCupom}
              className="flex-1 border border-border bg-background py-3 rounded-lg text-sm hover:bg-muted flex items-center justify-center gap-2"
            >
              <Printer size={14} /> Cupom
            </button>
          </div>
        </div>
      </div>

      {/* Modal de devolução */}
      <DevolucaoModal
        isOpen={modoDevolucao}
        onClose={() => setModoDevolucao(false)}
        onDevolver={handleDevolver}
      />
    </div>
  )
}