import { useState, useRef, useMemo, useEffect } from 'react'
import {
  useStore,
  fmtR,
  estoqueDisponivelProduto,
  quantidadeMaximaDisponivel,
  encontrarEstoqueInsuficiente,
} from '../lib/store'
import { toast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { geocodificarEntrega } from '../lib/sync'
import {
  Truck,
  Search,
  Trash2,
  Plus,
  Minus,
  MapPin,
  Clock,
  Send,
  CheckCheck,
  Sparkles,
  Loader2,
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  Home,
  CreditCard,
  Percent,
  Copy,
  ExternalLink,
  X,
  AlertTriangle,
  Eye,
  Settings2,
} from 'lucide-react'
import { DeliveryDetailsDialog } from '../components/DeliveryDetailsDialog'
import { DeliverySettingsDialog } from '../components/DeliverySettingsDialog'

type ItemCarrinho = {
  produtoId: string
  quantidade: number
  descontoPercentual: number
}

export function EntregasPDV() {
  const { produtos, clientes, entregas, addEntrega, updateStatusEntrega, sincronizarEntregas, currentRole } = useStore()

  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [busca, setBusca] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [distanciaKm, setDistanciaKm] = useState<number>(2.0)
  const [taxaEntrega, setTaxaEntrega] = useState<string>('6.00')
  const [calculandoFrete, setCalculandoFrete] = useState<boolean>(false)
  const [detalhesFrete, setDetalhesFrete] = useState<string>('Distância curta (até 3 km) · Frete fixo')
  const [destinoCoordenadas, setDestinoCoordenadas] = useState<{ lat: number; lng: number } | null>(null)
  const [etaMinutos, setEtaMinutos] = useState<number | null>(null)
  const [pagamento, setPagamento] = useState<string>('pix')
  const [obs, setObs] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [descontoGeral, setDescontoGeral] = useState<number>(0)
  const [step, setStep] = useState(1)
  const [animatingStep, setAnimatingStep] = useState(false)
  const [despachando, setDespachando] = useState(false)
  const [highlightItem, setHighlightItem] = useState<string | null>(null)
  const [credencialEntrega, setCredencialEntrega] = useState<{ id: string; codigo: string; link: string } | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)
  const [entregaDetalhadaId, setEntregaDetalhadaId] = useState<string | null>(null)
  const [configurando, setConfigurando] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let timeout: number | undefined
    const atualizar = () => {
      if (timeout) window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void sincronizarEntregas().catch(() => undefined), 350)
    }
    const channel = supabase.channel('gestao-entregas-atualizacao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, atualizar)
      .subscribe()
    const interval = window.setInterval(atualizar, 30_000)
    return () => {
      if (timeout) window.clearTimeout(timeout)
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [sincronizarEntregas])

  // Auto preencher cliente
  const handleSelecionarCliente = (id: string) => {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    if (c) {
      setClienteNome(c.nome)
      setTelefone(c.telefone || '')
    } else {
      setClienteNome('')
      setTelefone('')
    }
  }

  // Subtotal com desconto por item
  const subtotal = useMemo(() => {
    return carrinho.reduce((s, item) => {
      const p = produtos.find(x => x.id === item.produtoId)
      if (!p) return s
      const precoComDesconto = p.precoVenda * (1 - item.descontoPercentual / 100)
      return s + precoComDesconto * item.quantidade
    }, 0)
  }, [carrinho, produtos])

  // Geocodificação centralizada: a Edge Function aplica o contexto de cada
  // loja, cacheia resultados e evita expor o provedor diretamente no navegador.
  useEffect(() => {
    if (!endereco || endereco.trim().length < 4) {
      setDistanciaKm(2.0)
      setDestinoCoordenadas(null)
      setEtaMinutos(null)
      return
    }
    const timer = setTimeout(async () => {
      setCalculandoFrete(true)
      try {
        const resultado = await geocodificarEntrega(endereco)
        setDestinoCoordenadas({ lat: resultado.lat, lng: resultado.lng })
        setEtaMinutos(resultado.etaMinutos ?? null)
        if (resultado.distanciaKm != null) setDistanciaKm(resultado.distanciaKm)
        else toast('Configure o endereço da loja para calcular a distância automaticamente.', 'warning')
      } catch (error) {
        setDestinoCoordenadas(null)
        setEtaMinutos(null)
        toast(error instanceof Error ? error.message : 'Erro ao buscar endereço.', 'danger')
      } finally {
        setCalculandoFrete(false)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [endereco])

  // Cálculo do frete (mantido)
  useEffect(() => {
    const km = distanciaKm
    const freteFixoBase = 6.00
    let valorCalculado = freteFixoBase
    let motivo = `Curta distância (${km} km) · Frete fixo`
    if (km > 3) {
      const kmExtra = km - 3
      valorCalculado = freteFixoBase + kmExtra * 2.20
      motivo = `Longa distância (${km} km) · R$ 6,00 base + R$ 2,20/km extra`
    }
    if (subtotal >= 140) {
      valorCalculado = Math.max(0, valorCalculado - 6.00)
      motivo += ` · Bônus de Frete Grátis/Desconto (Pedido > R$ 140)`
    } else if (subtotal >= 75 && valorCalculado > freteFixoBase) {
      valorCalculado = Math.max(freteFixoBase, valorCalculado - 3.00)
      motivo += ` · Desconto fidelidade (Pedido > R$ 75)`
    }
    setTaxaEntrega(valorCalculado.toFixed(2))
    setDetalhesFrete(motivo)
  }, [distanciaKm, subtotal])

  const taxa = parseFloat(taxaEntrega) || 0
  const totalGeral = subtotal + taxa - descontoGeral

  const produtosFiltrados = useMemo(() => {
    if (!busca) return produtos
    const lower = busca.toLowerCase()
    return produtos.filter(
      p =>
        p.nome.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower) ||
        (p.barcode && p.barcode.includes(busca))
    )
  }, [produtos, busca])

  // Funções do carrinho
  const addItem = (produtoId: string) => {
    const p = produtos.find(x => x.id === produtoId)
    const quantidadeAtual = carrinho.find(item => item.produtoId === produtoId)?.quantidade || 0
    const quantidadeMaxima = quantidadeMaximaDisponivel(produtoId, carrinho, produtos)
    if (!p || quantidadeAtual >= quantidadeMaxima) {
      toast('Sem estoque', 'warning')
      return
    }
    setCarrinho(prev => {
      const ex = prev.find(i => i.produtoId === produtoId)
      if (ex) {
        return prev.map(i =>
          i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      }
      return [...prev, { produtoId, quantidade: 1, descontoPercentual: 0 }]
    })
    // Destaque suave
    setHighlightItem(produtoId)
    setTimeout(() => setHighlightItem(null), 400)
  }

  const updateQty = (produtoId: string, val: number) => {
    if (val <= 0) {
      setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
      return
    }
    const quantidadeMaxima = quantidadeMaximaDisponivel(produtoId, carrinho, produtos)
    const quantidade = Math.min(val, quantidadeMaxima)
    if (quantidade < val) toast('Quantidade limitada ao estoque físico disponível', 'warning')
    if (quantidade <= 0) {
      setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
      return
    }
    setCarrinho(prev => prev.map(i => (
      i.produtoId === produtoId ? { ...i, quantidade } : i
    )))
  }

  const updateDesconto = (produtoId: string, val: number) => {
    const desconto = Math.min(100, Math.max(0, val))
    setCarrinho(prev =>
      prev.map(i =>
        i.produtoId === produtoId ? { ...i, descontoPercentual: desconto } : i
      )
    )
  }

  const removeItem = (produtoId: string) => {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  const limparPedido = () => {
    setCarrinho([])
    setClienteNome('')
    setTelefone('')
    setEndereco('')
    setTaxaEntrega('6.00')
    setObs('')
    setClienteId('')
    setDescontoGeral(0)
    setStep(1)
  }

  // Navegação com animação
  const nextStep = () => {
    if (step === 1) {
      if (!carrinho.length) {
        toast('Adicione pelo menos um item ao pedido', 'warning')
        return
      }
      setAnimatingStep(true)
      setTimeout(() => {
        setStep(2)
        setAnimatingStep(false)
      }, 200)
    } else if (step === 2) {
      if (!clienteNome.trim()) {
        toast('Informe o nome do cliente', 'warning')
        return
      }
      setAnimatingStep(true)
      setTimeout(() => {
        setStep(3)
        setAnimatingStep(false)
      }, 200)
    } else if (step === 3) {
      if (!endereco.trim()) {
        toast('Informe o endereço de entrega', 'warning')
        return
      }
      setAnimatingStep(true)
      setTimeout(() => {
        setStep(4)
        setAnimatingStep(false)
      }, 200)
    }
  }

  const prevStep = () => {
    if (step > 1) {
      setAnimatingStep(true)
      setTimeout(() => {
        setStep(step - 1)
        setAnimatingStep(false)
      }, 200)
    }
  }

  // Finalizar pedido
  const criarPedidoEntrega = async () => {
    if (!carrinho.length) {
      toast('Adicione pelo menos um item ao pedido', 'warning')
      return
    }
    if (!clienteNome.trim()) {
      toast('Informe o nome do cliente', 'warning')
      return
    }
    if (!endereco.trim()) {
      toast('Informe o endereço de entrega', 'warning')
      return
    }
    const faltaEstoque = encontrarEstoqueInsuficiente(carrinho, produtos)
    if (faltaEstoque) {
      toast(`Estoque insuficiente: ${faltaEstoque.produto?.nome || 'produto indisponível'}`, 'danger')
      return
    }

    setDespachando(true)
    try {
      const resultado = await addEntrega({
        clienteId: clienteId || undefined,
        clienteNome,
        telefone,
        endereco,
        itens: carrinho.map(i => {
          const p = produtos.find(x => x.id === i.produtoId)!
          return {
            produtoId: i.produtoId,
            produtoNome: p.nome,
            quantidade: i.quantidade,
            precoUnit: p.precoVenda * (1 - i.descontoPercentual / 100),
          }
        }),
        total: totalGeral,
        taxaEntrega: taxa,
        pagamento,
        lat: destinoCoordenadas?.lat,
        lng: destinoCoordenadas?.lng,
        obs: obs + (descontoGeral > 0 ? ` | Desconto geral: R$ ${fmtR(descontoGeral)}` : ''),
      })

      try {
        const channel = supabase.channel('rastreamento_entregas')
        await channel.send({
          type: 'broadcast',
          event: 'novo_pedido_entrega',
          payload: {
            id: resultado.id,
            clienteNome,
            endereco,
            total: totalGeral,
            pagamento,
          },
        })
      } catch (_error) {
        // O pedido já foi persistido; o broadcast é somente uma otimização.
        void _error
      }

      const link = `${window.location.origin}/acompanhar/${resultado.trackingToken}`
      setCredencialEntrega({ id: resultado.id, codigo: resultado.codigoConfirmacao, link })
      toast('Pedido criado e estoque reservado com segurança.', 'success')
      limparPedido()
    } catch (error) {
      toast(error instanceof Error ? `Erro ao criar pedido: ${error.message}` : 'Erro ao criar pedido', 'danger')
    } finally {
      setDespachando(false)
    }
  }

  const entregasAbertas = entregas.filter(e => ['pendente', 'aceito', 'em_rota', 'nao_entregue'].includes(e.status))
  const indicadoresEntrega = useMemo(() => {
    const concluidas = entregas.filter(e => e.status === 'entregue')
    const canceladas = entregas.filter(e => e.status === 'cancelado')
    const duracoes = concluidas.flatMap(e => e.emRotaEm && e.entregueEm ? [(new Date(e.entregueEm).getTime() - new Date(e.emRotaEm).getTime()) / 60_000] : [])
    return {
      concluidas: concluidas.length,
      canceladas: canceladas.length,
      emRota: entregas.filter(e => e.status === 'em_rota').length,
      tempoMedio: duracoes.length ? Math.round(duracoes.reduce((s, v) => s + v, 0) / duracoes.length) : null,
    }
  }, [entregas])
  const desempenhoEntregadores = useMemo(() => {
    const mapa = new Map<string, { nome: string; concluidas: number; ocorrencias: number; minutos: number[] }>()
    entregas.filter(e => e.entregadorId).forEach(e => {
      const item = mapa.get(e.entregadorId!) || { nome: e.entregadorNome || 'Entregador', concluidas: 0, ocorrencias: 0, minutos: [] }
      if (e.status === 'entregue') item.concluidas += 1
      if (e.status === 'nao_entregue' || e.status === 'cancelado') item.ocorrencias += 1
      if (e.emRotaEm && e.entregueEm) item.minutos.push((new Date(e.entregueEm).getTime() - new Date(e.emRotaEm).getTime()) / 60_000)
      mapa.set(e.entregadorId!, item)
    })
    return [...mapa.entries()].map(([id, item]) => ({ ...item, id, media: item.minutos.length ? Math.round(item.minutos.reduce((s, n) => s + n, 0) / item.minutos.length) : null })).sort((a,b) => b.concluidas - a.concluidas)
  }, [entregas])
  const cancelarEntrega = async () => {
    if (!cancelandoId || !motivoCancelamento.trim()) return
    setAcaoEmAndamento(cancelandoId)
    try {
      await updateStatusEntrega(cancelandoId, 'cancelado', { motivo: motivoCancelamento.trim() })
      toast('Entrega cancelada e estoque devolvido em uma única operação.', 'success')
      setCancelandoId(null)
      setMotivoCancelamento('')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível cancelar a entrega.', 'danger')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  // Renderização do conteúdo de cada passo com animação de fade+slide
  const renderStepContent = () => {
    const content = (() => {
      switch (step) {
        case 1:
          return (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <User size={14} /> Passo 1: Selecionar cliente
              </h4>
              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">Cliente Cadastrado</label>
                <select
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  value={clienteId}
                  onChange={e => handleSelecionarCliente(e.target.value)}
                >
                  <option value="">Cliente Avulso...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.telefone || 'Sem tel'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione um cliente existente ou escolha "Cliente Avulso" para preencher manualmente.
                </p>
              </div>
              <button
                onClick={nextStep}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          )
        case 2:
          return (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Phone size={14} /> Passo 2: Dados do cliente
              </h4>
              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">Nome do Cliente *</label>
                <input
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Ex: Carlos Silva"
                  value={clienteNome}
                  onChange={e => setClienteNome(e.target.value)}
                />
              </div>
              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">WhatsApp / Telefone</label>
                <input
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  placeholder="(11) 99999-9999"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted active:scale-95 transition-all flex items-center gap-1"
                >
                  <ArrowLeft size={14} /> Voltar
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  Continuar <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )
        case 3:
          return (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Home size={14} /> Passo 3: Endereço e frete
              </h4>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-muted-foreground uppercase block">Endereço de Entrega *</label>
                  {calculandoFrete && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1 animate-pulse">
                      <Loader2 size={11} className="animate-spin" /> Calculando...
                    </span>
                  )}
                </div>
                <input
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Rua, Número, Bairro, Cidade"
                  value={endereco}
                  onChange={e => setEndereco(e.target.value)}
                />
              </div>

              <div className="p-3 bg-muted/40 rounded-xl border border-border flex flex-col gap-1.5 transition-all hover:border-amber-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-white text-xs">
                    <Sparkles size={14} className="text-amber-500" /> Frete Calculado
                  </div>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {fmtR(taxa)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <span className="truncate pr-2">{detalhesFrete}</span>
                  <span className="font-mono font-medium whitespace-nowrap">{distanciaKm} km{etaMinutos ? ` · ~${etaMinutos} min` : ''}</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">Ajuste Manual da Taxa (R$)</label>
                <input
                  type="number"
                  step="0.50"
                  className="w-full p-2 border border-border rounded-lg bg-background font-medium transition-all focus:ring-2 focus:ring-amber-500/50"
                  value={taxaEntrega}
                  onChange={e => setTaxaEntrega(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted active:scale-95 transition-all flex items-center gap-1"
                >
                  <ArrowLeft size={14} /> Voltar
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  Continuar <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )
        case 4:
          return (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={14} /> Passo 4: Pagamento, observações e desconto
              </h4>
              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">Forma de Pagamento</label>
                <select
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  value={pagamento}
                  onChange={e => setPagamento(e.target.value)}
                >
                  <option value="pix">PIX no ato</option>
                  <option value="cartao_maquininha">Cartão na Maquininha</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="fiado">Fiado</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1">Observações</label>
                <input
                  className="w-full p-2 border border-border rounded-lg bg-background transition-all focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Ex: Troco para R$ 50, deixar na portaria"
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground uppercase block mb-1 flex items-center gap-1">
                  <Percent size={14} /> Desconto Geral (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full p-2 border border-border rounded-lg bg-background font-medium transition-all focus:ring-2 focus:ring-amber-500/50"
                  value={descontoGeral || ''}
                  onChange={e => setDescontoGeral(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                />
              </div>

              <div className="border-t border-border pt-3 mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Subtotal (com descontos): {fmtR(subtotal)}</span>
                  <span>Taxa: +{fmtR(taxa)}</span>
                </div>
                {descontoGeral > 0 && (
                  <div className="flex justify-between text-xs text-red-500 animate-fadeIn">
                    <span>Desconto geral:</span>
                    <span>- {fmtR(descontoGeral)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold">Total a Cobrar:</span>
                  <span className="text-2xl font-bold text-amber-500">{fmtR(totalGeral)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={prevStep}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted active:scale-95 transition-all flex items-center gap-1"
                >
                  <ArrowLeft size={14} /> Voltar
                </button>
                <button
                  onClick={criarPedidoEntrega}
                  disabled={despachando}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {despachando ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Despachando...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Despachar Entrega
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        default:
          return null
      }
    })()

    return (
      <div
        className={`transition-all duration-200 ease-in-out ${
          animatingStep ? 'opacity-0 -translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'
        }`}
      >
        {content}
      </div>
    )
  }

  // Barra de progresso animada
  const renderProgress = () => {
    const steps = [
      { label: 'Cliente', icon: <User size={14} /> },
      { label: 'Dados', icon: <Phone size={14} /> },
      { label: 'Endereço', icon: <Home size={14} /> },
      { label: 'Pagamento', icon: <CreditCard size={14} /> },
    ]
    const progress = ((step - 1) / (steps.length - 1)) * 100

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          {steps.map((s, idx) => {
            const isActive = idx + 1 === step
            const isCompleted = idx + 1 < step
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 ${
                    isActive
                      ? 'bg-amber-500 text-white scale-110 ring-4 ring-amber-500/30'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <CheckCheck size={14} /> : idx + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:inline transition-colors duration-300 ${isActive ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className="w-6 h-0.5 bg-muted overflow-hidden">
                    <div
                      className={`h-full bg-green-500 transition-all duration-500 ease-in-out ${
                        idx + 1 < step ? 'w-full' : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <Truck className="text-amber-500" size={26} />
            PDV Entregas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lançamento de pedidos delivery e despacho direto para o App do Entregador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(currentRole === 'owner' || currentRole === 'gerente') && <button onClick={() => setConfigurando(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Settings2 size={14} /> Configurar</button>}
          <span className="text-xs font-semibold px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/20 animate-pulse">
            {entregasAbertas.length} em aberto
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-adega p-3"><p className="text-xs text-muted-foreground">Em rota</p><b className="text-xl">{indicadoresEntrega.emRota}</b></div>
        <div className="card-adega p-3"><p className="text-xs text-muted-foreground">Concluídas</p><b className="text-xl text-emerald-600">{indicadoresEntrega.concluidas}</b></div>
        <div className="card-adega p-3"><p className="text-xs text-muted-foreground">Canceladas</p><b className="text-xl text-rose-600">{indicadoresEntrega.canceladas}</b></div>
        <div className="card-adega p-3"><p className="text-xs text-muted-foreground">Tempo médio em rota</p><b className="text-xl">{indicadoresEntrega.tempoMedio == null ? '—' : `${indicadoresEntrega.tempoMedio} min`}</b></div>
      </div>

      {desempenhoEntregadores.length > 0 && <details className="card-adega p-4"><summary className="cursor-pointer font-bold">Desempenho dos entregadores</summary><div className="mt-3 overflow-x-auto"><table className="tbl-adega"><thead><tr><th>Entregador</th><th>Concluídas</th><th>Ocorrências</th><th>Tempo médio</th></tr></thead><tbody>{desempenhoEntregadores.map(item => <tr key={item.id}><td className="font-semibold">{item.nome}</td><td>{item.concluidas}</td><td>{item.ocorrencias}</td><td>{item.media == null ? '—' : `${item.media} min`}</td></tr>)}</tbody></table></div></details>}

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna 1: Seleção de Produtos */}
        <div className="card-adega p-4 flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-sm transition-all focus:ring-2 focus:ring-amber-500/50"
              placeholder="Buscar produtos para entrega..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          <div className="overflow-y-auto max-h-72 flex flex-col gap-1">
            {produtosFiltrados.slice(0, 20).map((p, idx) => {
              const disponivel = estoqueDisponivelProduto(p, produtos)
              return <button
                key={p.id}
                onClick={() => addItem(p.id)}
                disabled={disponivel <= 0}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border text-left hover:bg-muted transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                style={{ animationDelay: `${idx * 20}ms` }}
              >
                <div>
                  <p className="font-medium text-sm text-slate-900 dark:text-white">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sku} · {p.produtoEstoqueOrigemId ? `Disponível: ${disponivel} doses/un.` : `Est: ${disponivel}`}
                  </p>
                </div>
                <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                  {fmtR(p.precoVenda)}
                </span>
              </button>
            })}
          </div>

          {/* Itens no carrinho com animação suave */}
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Itens do Pedido ({carrinho.length})
            </h4>
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5">
              {carrinho.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">Nenhum item selecionado</p>
              ) : (
                carrinho.map(item => {
                  const p = produtos.find(x => x.id === item.produtoId)
                  if (!p) return null
                  const precoComDesconto = p.precoVenda * (1 - item.descontoPercentual / 100)
                  const isHighlight = highlightItem === item.produtoId
                  return (
                    <div
                      key={item.produtoId}
                      className={`flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/40 text-xs transition-all duration-300 ${
                        isHighlight ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : ''
                      }`}
                    >
                      <span className="truncate flex-1 font-medium">{p.nome}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQty(item.produtoId, item.quantidade - 1)}
                          className="p-1 hover:bg-muted rounded transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-bold">{item.quantidade}</span>
                        <button
                          onClick={() => updateQty(item.produtoId, item.quantidade + 1)}
                          className="p-1 hover:bg-muted rounded transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="w-12 text-center border border-border rounded p-0.5 text-xs bg-background transition-all focus:ring-1 focus:ring-amber-500"
                          value={item.descontoPercentual || ''}
                          onChange={e => updateDesconto(item.produtoId, parseFloat(e.target.value) || 0)}
                          placeholder="%"
                          aria-label="Desconto do item"
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                      <span className="w-16 text-right font-semibold">{fmtR(precoComDesconto * item.quantidade)}</span>
                      <button
                        onClick={() => removeItem(item.produtoId)}
                        className="text-rose-500 hover:opacity-70 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                      {isHighlight && (
                        <CheckCheck size={14} className="text-emerald-500 flex-shrink-0 animate-fadeIn" />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Coluna 2: Formulário por etapas */}
        <div className="card-adega p-4 flex flex-col gap-3">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
            <MapPin size={16} className="text-amber-500" /> Detalhes do Destino & Cliente
          </h3>

          {renderProgress()}
          {renderStepContent()}

          <button
            onClick={limparPedido}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors mt-2 self-start"
          >
            Limpar tudo e recomeçar
          </button>
        </div>
      </div>

      {/* Lista de Entregas em Aberto */}
      <div className="card-adega overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Entregas em Aberto ({entregasAbertas.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl-adega">
            <thead>
              <tr>
                <th># ID</th>
                <th>Cliente</th>
                <th>Endereço</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Entregador</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {entregasAbertas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma entrega em aberto no momento.
                  </td>
                </tr>
              ) : (
                entregasAbertas.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td><code className="text-xs font-mono">#{e.id.slice(-4)}</code></td>
                    <td>
                      <div className="font-medium text-sm">{e.clienteNome}</div>
                      <div className="text-xs text-muted-foreground">{e.telefone || '—'}</div>
                    </td>
                    <td className="max-w-xs truncate text-xs">{e.endereco}</td>
                    <td className="font-bold text-sm text-primary">{fmtR(e.total)}</td>
                    <td><span className="badge-adega badge-info text-xs">{e.pagamento}</span></td>
                    <td>
                      <span className={`badge-adega ${e.status === 'em_rota' ? 'badge-warning' : e.status === 'nao_entregue' ? 'badge-danger' : 'badge-secondary'}`}>
                        {e.status === 'pendente' && '🕒 Pendente'}
                        {e.status === 'aceito' && '📦 Aceito'}
                        {e.status === 'em_rota' && '🛵 Em rota'}
                        {e.status === 'nao_entregue' && '⚠ Não entregue'}
                      </span>
                    </td>
                    <td className="text-xs">{e.entregadorNome || <span className="text-muted-foreground">Aguardando</span>}</td>
                    <td className="flex items-center gap-1">
                      <button onClick={() => setEntregaDetalhadaId(e.id)} className="rounded border p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Ver detalhes da entrega ${e.id}`}><Eye size={14} /></button>
                      {e.status === 'aceito' && (
                        <button
                          disabled={acaoEmAndamento === e.id}
                          onClick={() => {
                            setAcaoEmAndamento(e.id)
                            void updateStatusEntrega(e.id, 'em_rota')
                              .then(() => toast('Rota iniciada.', 'success'))
                              .catch(error => toast(error instanceof Error ? error.message : 'Falha ao iniciar rota.', 'danger'))
                              .finally(() => setAcaoEmAndamento(null))
                          }}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white text-xs rounded font-medium"
                        >
                          {acaoEmAndamento === e.id ? 'Processando…' : 'Iniciar rota'}
                        </button>
                      )}
                      {e.status === 'em_rota' && <span className="px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">Conclusão pelo entregador</span>}
                      {e.status === 'nao_entregue' && (
                        <button
                          disabled={acaoEmAndamento === e.id}
                          onClick={() => {
                            setAcaoEmAndamento(e.id)
                            void updateStatusEntrega(e.id, 'pendente')
                              .then(() => toast('Entrega devolvida à fila e liberada para um novo entregador.', 'success'))
                              .catch(error => toast(error instanceof Error ? error.message : 'Falha ao reabrir a entrega.', 'danger'))
                              .finally(() => setAcaoEmAndamento(null))
                          }}
                          className="px-2 py-1 border border-primary text-primary text-xs rounded font-medium disabled:opacity-50"
                        >
                          {acaoEmAndamento === e.id ? 'Processando…' : 'Reabrir'}
                        </button>
                      )}
                      {e.status !== 'entregue' && <button onClick={() => { setCancelandoId(e.id); setMotivoCancelamento('') }} className="px-2 py-1 border border-rose-500 text-rose-600 text-xs rounded font-medium">Cancelar</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {credencialEntrega && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Entrega criada">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-emerald-600 font-bold">Entrega criada com segurança</p><h3 className="text-xl font-bold">Compartilhe com o cliente</h3></div><button onClick={() => setCredencialEntrega(null)} className="p-2 rounded-lg hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div>
            <div className="rounded-xl border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Código de confirmação</p><p className="text-3xl tracking-[0.35em] font-black mt-1">{credencialEntrega.codigo}</p><p className="text-xs text-muted-foreground mt-2">O código aparece somente agora. O entregador precisará dele para concluir.</p></div>
            <div className="flex gap-2"><button onClick={() => { void navigator.clipboard.writeText(`Acompanhe seu pedido: ${credencialEntrega.link}\nCódigo de recebimento: ${credencialEntrega.codigo}`); toast('Link e código copiados.', 'success') }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground font-semibold"><Copy size={16} /> Copiar mensagem</button><a href={credencialEntrega.link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border px-3" aria-label="Abrir rastreamento"><ExternalLink size={17} /></a></div>
          </div>
        </div>
      )}

      {cancelandoId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Cancelar entrega">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3"><div className="rounded-full bg-rose-100 p-2 text-rose-700 dark:bg-rose-950"><AlertTriangle size={20} /></div><div><h3 className="font-bold text-lg">Cancelar entrega #{cancelandoId.slice(-4)}</h3><p className="text-sm text-muted-foreground">O estoque reservado será devolvido automaticamente e a ação ficará na auditoria.</p></div></div>
            <label className="block text-sm font-semibold">Motivo obrigatório<textarea autoFocus value={motivoCancelamento} onChange={e => setMotivoCancelamento(e.target.value)} className="mt-1 w-full min-h-24 rounded-lg border bg-background p-3 font-normal" placeholder="Ex.: cliente solicitou o cancelamento" /></label>
            <div className="flex justify-end gap-2"><button onClick={() => setCancelandoId(null)} className="rounded-lg border px-4 py-2">Voltar</button><button disabled={!motivoCancelamento.trim() || acaoEmAndamento === cancelandoId} onClick={() => void cancelarEntrega()} className="rounded-lg bg-rose-600 px-4 py-2 text-white disabled:opacity-50">{acaoEmAndamento === cancelandoId ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
          </div>
        </div>
      )}

      {entregaDetalhadaId && (() => { const entrega = entregas.find(item => item.id === entregaDetalhadaId); return entrega ? <DeliveryDetailsDialog entrega={entrega} onClose={() => setEntregaDetalhadaId(null)} /> : null })()}
      {configurando && <DeliverySettingsDialog onClose={() => setConfigurando(false)} />}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out forwards;
        }
        .card-adega {
          transition: box-shadow 0.2s ease;
        }
        .card-adega:hover {
          box-shadow: 0 8px 30px rgba(0,0,0,0.05);
        }
        .badge-adega {
          transition: all 0.2s ease;
        }
        .tbl-adega tbody tr {
          transition: background-color 0.15s ease;
        }
      `}</style>
    </div>
  )
}
