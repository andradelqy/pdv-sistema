import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hojeBRT, isoParaDataBRT, cortarDataBRT } from './dateBR'
import { cmvDaVenda } from './lucro'
import * as sync from './sync'

export type Produto = {
  id: string
  sku: string
  nome: string
  barcode?: string
  descricao?: string
  categoria?: string
  fornecedor?: string
  leadTime: number
  precoCompra: number
  precoVenda: number
  imposto: number
  frete: number
  comissao: number
  precoCompetidor?: number
  margemAlvo: number
  estoque: number
  estoqueMin: number
  pontoPedido: number
  qualidade: number
  imagem?: string
}

export type Movimentacao = {
  id: string
  produtoId: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  data: string
  lote?: string
  validade?: string
  obs?: string
}

export type ItemVenda = {
  produtoId: string
  quantidade: number
  precoUnit: number
}

export type Venda = {
  id: string
  data: string
  clienteId?: string
  pagamento: string
  itens: ItemVenda[]
  total: number
  obs?: string
  criadoEm: string
}

export type Cliente = {
  id: string
  nome: string
  telefone?: string
  limite: number
  saldo: number
  compras: number
  ultimaCobranca?: string
}

export type EntradaCaixa = {
  tipo: 'venda' | 'suprimento' | 'sangria'
  pagamento?: string
  valor: number
  data: string
  descricao?: string
  caixaId?: string
}

export type Caixa = {
  id: string
  abertoEm: string
  fechadoEm?: string
  faturamentoBruto?: number
  lucroLiquido?: number
  vendas?: number
}

function uid() {
  return 'id_' + Math.random().toString(36).substr(2, 9)
}

function hoje() {
  return hojeBRT()
}

// Helper de write-through: dispara o upsert correspondente no Supabase em background.
// Erros de rede viram warning no console — a mutação local persiste em LS,
// e na próxima carga a app reidrata do LS caso o Supabase esteja fora.
function trySync(fn: () => Promise<void>) {
  fn().catch((e: any) => {
    // silencioso: sem usuário logado ou sem rede = write local-only
    if (e?.message?.includes('Sem usuário')) return
    console.warn('[sync] falhou:', e?.message || e)
  })
}

export type PedidoEntrega = {
  id: string
  clienteNome: string
  telefone?: string
  endereco: string
  itens: ItemVenda[]
  total: number
  taxaEntrega: number
  pagamento: string
  status: 'pendente' | 'em_rota' | 'entregue' | 'cancelado'
  entregadorId?: string
  entregadorNome?: string
  data: string
  criadoEm: string
  obs?: string
  lat?: number
  lng?: number
}

type Store = {
  produtos: Produto[]
  movimentacoes: Movimentacao[]
  vendas: Venda[]
  clientes: Cliente[]
  caixaEntradas: EntradaCaixa[]
  caixas: Caixa[]
  caixaAberto?: Caixa
  entregas: PedidoEntrega[]
  tema: 'light' | 'dark'

  addProduto: (p: Omit<Produto, 'id'>) => void
  updateProduto: (p: Produto) => void
  deleteProduto: (id: string) => void

  addMovimentacao: (m: Omit<Movimentacao, 'id'>) => void
  deleteMovimentacao: (id: string) => void

  addVenda: (v: Omit<Venda, 'id' | 'criadoEm'>) => void
  addCliente: (c: Omit<Cliente, 'id'>) => void
  updateCliente: (c: Cliente) => void
  deleteCliente: (id: string) => void

  abrirCaixa: () => void
  fecharCaixa: () => void
  addCaixaEntrada: (e: EntradaCaixa) => void
  quitarFiado: (clienteId: string, valor: number, formaPagamento: string) => void

  addEntrega: (p: Omit<PedidoEntrega, 'id' | 'status' | 'criadoEm' | 'data'>) => string
  updateStatusEntrega: (id: string, status: PedidoEntrega['status'], entregador?: { id: string; nome: string }) => void

  toggleTema: () => void
  resetDemo: () => void
  clearAll: () => void
  hydrateFromRemote: (data: sync.CargaRemota) => void
}

const DEMO_PRODUTOS: Omit<Produto, 'id'>[] = [
  { sku: 'CER001', nome: 'Heineken 600ml', categoria: 'Cerveja', fornecedor: 'Ambev', leadTime: 3, precoCompra: 8.5, precoVenda: 14.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 30, estoque: 48, estoqueMin: 12, pontoPedido: 24, qualidade: 4 },
  { sku: 'VIN001', nome: 'Vinho Tinto Miolo', categoria: 'Vinho', fornecedor: 'Miolo', leadTime: 7, precoCompra: 32, precoVenda: 55.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 35, estoque: 6, estoqueMin: 5, pontoPedido: 10, qualidade: 5 },
  { sku: 'DES001', nome: 'Whisky Jack Daniels', categoria: 'Destilado', fornecedor: 'Importadora', leadTime: 14, precoCompra: 89, precoVenda: 149.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 40, estoque: 8, estoqueMin: 3, pontoPedido: 6, qualidade: 5 },
  { sku: 'CER002', nome: 'Brahma Lata 350ml', categoria: 'Cerveja', fornecedor: 'Ambev', leadTime: 3, precoCompra: 3.2, precoVenda: 5.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 25, estoque: 120, estoqueMin: 30, pontoPedido: 60, qualidade: 3 },
  { sku: 'VIN002', nome: 'Espumante Chandon', categoria: 'Espumante', fornecedor: 'Chandon', leadTime: 10, precoCompra: 45, precoVenda: 79.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 40, estoque: 3, estoqueMin: 4, pontoPedido: 8, qualidade: 5 },
]

export const useStore = create<Store>()(
  persist(
    (set) => ({
      produtos: DEMO_PRODUTOS.map(p => ({ ...p, id: uid() })),
      movimentacoes: [],
      vendas: [],
      clientes: [],
      caixaEntradas: [],
      caixas: [],
      caixaAberto: undefined,
      entregas: [],
      tema: 'light',

      addProduto: (p) => {
        const novo: Produto = { ...p, id: uid() }
        set(s => ({ produtos: [...s.produtos, novo] }))
        trySync(() => sync.upsertProduto(novo))
      },
      updateProduto: (p) => {
        set(s => ({ produtos: s.produtos.map(x => x.id === p.id ? p : x) }))
        trySync(() => sync.upsertProduto(p))
      },
      deleteProduto: (id) => {
        set(s => ({ produtos: s.produtos.filter(x => x.id !== id) }))
        trySync(() => sync.deleteProduto(id))
      },

      addMovimentacao: (m) => {
        const mov: Movimentacao = { ...m, id: uid() }
        set(s => {
          const prods = s.produtos.map(p => {
            if (p.id !== m.produtoId) return p
            const novoEst = m.tipo === 'entrada' ? p.estoque + m.quantidade : p.estoque - m.quantidade
            const atualizado = { ...p, estoque: Math.max(0, novoEst) }
            trySync(() => sync.upsertProduto(atualizado))
            return atualizado
          })
          return { movimentacoes: [...s.movimentacoes, mov], produtos: prods }
        })
        trySync(() => sync.insertMovimentacao(mov))
      },
      deleteMovimentacao: (id) => {
        set(s => ({ movimentacoes: s.movimentacoes.filter(x => x.id !== id) }))
        trySync(() => sync.deleteMovimentacao(id))
      },

      addVenda: (v) => {
        const venda: Venda = { ...v, id: uid(), criadoEm: new Date().toISOString() }
        set(s => {
          if (!s.caixaAberto) return s
          const prods = s.produtos.map(p => {
            const item = v.itens.find(i => i.produtoId === p.id)
            if (!item) return p
            const novoEstoque = Math.max(0, p.estoque - item.quantidade)

            // Recalcular estoque mínimo automaticamente com base no histórico de saídas
            const todasSaidas = [...s.movimentacoes, {
              id: '', produtoId: p.id, tipo: 'saida' as const,
              quantidade: item.quantidade, data: v.data,
            }]
            const novoMin = calcularEstoqueMinimoRecomendado(p, todasSaidas)
            const novoPontoPedido = Math.max(novoMin + 2, Math.ceil(novoMin * 1.5))

            return {
              ...p,
              estoque: novoEstoque,
              estoqueMin: novoMin,
              pontoPedido: novoPontoPedido,
            }
          })
          const clientes = v.clienteId && v.pagamento === 'fiado'
            ? s.clientes.map(c => c.id === v.clienteId
                ? { ...c, saldo: c.saldo + v.total, compras: c.compras + 1 }
                : c)
            : s.clientes
          const caixaEntradas = v.pagamento !== 'fiado'
            ? [...s.caixaEntradas, {
                tipo: 'venda' as const, pagamento: v.pagamento, valor: v.total, data: hoje(), descricao: `Venda ${v.pagamento}`, caixaId: s.caixaAberto.id
              }]
            : s.caixaEntradas
          const movimentacoes = [...s.movimentacoes, ...v.itens.map(item => ({
            id: uid(), produtoId: item.produtoId, tipo: 'saida' as const,
            quantidade: item.quantidade, data: v.data, obs: `Venda ${v.pagamento}`
          }))]
          return { vendas: [...s.vendas, venda], produtos: prods, clientes, caixaEntradas, movimentacoes }
        })
        // Write-through
        trySync(() => sync.insertVenda(venda, v.itens))
        if (v.clienteId && v.pagamento === 'fiado') {
          const cli = useStore.getState().clientes.find(c => c.id === v.clienteId)
          if (cli) trySync(() => sync.upsertCliente(cli))
        }
        if (v.pagamento !== 'fiado') {
          trySync(() => sync.insertCaixaEntrada({
            tipo: 'venda', pagamento: v.pagamento, valor: v.total,
            data: hoje(), descricao: `Venda ${v.pagamento}`,
            caixaId: useStore.getState().caixaAberto?.id,
          }))
        }
        v.itens.forEach(item => {
          trySync(() => sync.insertMovimentacao({
            id: uid(), produtoId: item.produtoId, tipo: 'saida',
            quantidade: item.quantidade, data: v.data, obs: `Venda ${v.pagamento}`,
          }))
        })
        // Atualiza estoque dos produtos no Supabase
        setTimeout(() => {
          const prods = useStore.getState().produtos
          v.itens.forEach(item => {
            const p = prods.find(x => x.id === item.produtoId)
            if (p) trySync(() => sync.upsertProduto(p))
          })
        }, 0)
      },

      addCliente: (c) => {
        const novo: Cliente = { ...c, id: uid() }
        set(s => ({ clientes: [...s.clientes, novo] }))
        trySync(() => sync.upsertCliente(novo))
      },
      updateCliente: (c) => {
        set(s => ({ clientes: s.clientes.map(x => x.id === c.id ? c : x) }))
        trySync(() => sync.upsertCliente(c))
      },
      deleteCliente: (id) => {
        set(s => ({ clientes: s.clientes.filter(x => x.id !== id) }))
        trySync(() => sync.deleteCliente(id))
      },

      abrirCaixa: () => {
        if (useStore.getState().caixaAberto) return
        const novo: Caixa = { id: uid(), abertoEm: new Date().toISOString() }
        set(() => ({ caixaAberto: novo }))
        trySync(() => sync.upsertCaixa(novo))
      },
      fecharCaixa: () => set(s => {
        const caixaAberto = s.caixaAberto
        if (!caixaAberto) return s
        const inicio = isoParaDataBRT(caixaAberto.abertoEm)
        const vendasCaixa = s.vendas.filter(v => isoParaDataBRT(v.criadoEm) >= inicio && v.pagamento !== 'fiado')
        const entradasCaixa = s.caixaEntradas.filter(e => e.caixaId === caixaAberto.id || (!e.caixaId && e.data >= inicio))
        const custo = vendasCaixa.reduce((sum, v) => sum + cmvDaVenda(v, s.produtos), 0)
        const caixaFechado: Caixa = {
          ...caixaAberto,
          fechadoEm: new Date().toISOString(),
          faturamentoBruto: entradasCaixa.filter(e => e.tipo === 'venda').reduce((sum, e) => sum + e.valor, 0),
          lucroLiquido: vendasCaixa.reduce((sum, v) => sum + v.total, 0) - custo,
          vendas: vendasCaixa.length,
        }
        trySync(() => sync.upsertCaixa(caixaFechado))
        return { caixaAberto: undefined, caixas: [caixaFechado, ...(s.caixas || [])] }
      }),
      addCaixaEntrada: (e) => {
        if (!useStore.getState().caixaAberto) return
        const entrada = { ...e, caixaId: useStore.getState().caixaAberto!.id }
        set(s => ({ caixaEntradas: [...s.caixaEntradas, entrada] }))
        trySync(() => sync.insertCaixaEntrada(entrada))
      },

      quitarFiado: (clienteId, valor, formaPagamento) => set(s => {
        if (!s.caixaAberto) return s
        const cliente = s.clientes.find(c => c.id === clienteId)
        if (!cliente || valor <= 0) return s

        const novoSaldo = Math.max(0, cliente.saldo - valor)
        const clientesAtualizados = s.clientes.map(c =>
          c.id === clienteId ? { ...c, saldo: novoSaldo } : c
        )

        // Registra entrada de venda liquidada no caixa e nova venda efetivada na data de hoje
        const entradaCaixa: EntradaCaixa = {
          tipo: 'venda',
          pagamento: formaPagamento,
          valor,
          data: hoje(),
          descricao: `Quitação Fiado - ${cliente.nome}`,
          caixaId: s.caixaAberto.id,
        }

        const novaVendaQuitada: Venda = {
          id: uid(),
          data: hoje(),
          clienteId,
          pagamento: formaPagamento,
          itens: [],
          total: valor,
          obs: `Quitação de débito (${cliente.nome})`,
          criadoEm: new Date().toISOString(),
        }

        // Write-through
        trySync(() => sync.upsertCliente({ ...cliente, saldo: novoSaldo }))
        trySync(() => sync.insertCaixaEntrada(entradaCaixa))
        trySync(() => sync.insertVenda(novaVendaQuitada, []))

        return {
          clientes: clientesAtualizados,
          vendas: [...s.vendas, novaVendaQuitada],
          caixaEntradas: [...s.caixaEntradas, entradaCaixa],
        }
      }),

      addEntrega: (p) => {
        const id = uid()
        const novaEntrega: PedidoEntrega = {
          ...p,
          id,
          status: 'pendente',
          data: hoje(),
          criadoEm: new Date().toISOString(),
        }
        set(s => {
          // Abate estoque
          const prods = s.produtos.map(prod => {
            const item = p.itens.find(i => i.produtoId === prod.id)
            if (!item) return prod
            const atualizado = { ...prod, estoque: Math.max(0, prod.estoque - item.quantidade) }
            trySync(() => sync.upsertProduto(atualizado))
            return atualizado
          })
          const movimentacoes = [...s.movimentacoes, ...p.itens.map(item => ({
            id: uid(),
            produtoId: item.produtoId,
            tipo: 'saida' as const,
            quantidade: item.quantidade,
            data: hoje(),
            obs: `Pedido Entrega #${id.slice(-4)} (${p.clienteNome})`,
          }))]
          // Write-through
          trySync(() => sync.upsertEntrega(novaEntrega))
          p.itens.forEach(item => {
            trySync(() => sync.insertMovimentacao({
              id: uid(), produtoId: item.produtoId, tipo: 'saida',
              quantidade: item.quantidade, data: hoje(),
              obs: `Pedido Entrega #${id.slice(-4)} (${p.clienteNome})`,
            }))
          })
          return {
            entregas: [novaEntrega, ...s.entregas],
            produtos: prods,
            movimentacoes,
          }
        })
        return id
      },

      updateStatusEntrega: (id, status, entregador) => {
        let novaVendaGerada: Venda | null = null
        let entradaCaixaGerada: EntradaCaixa | null = null
        let entregaAtualizada: PedidoEntrega | null = null

        set(s => {
          const entrega = s.entregas.find(e => e.id === id)
          if (!entrega) return s

          entregaAtualizada = {
            ...entrega,
            status,
            entregadorId: entregador?.id ?? entrega.entregadorId,
            entregadorNome: entregador?.nome ?? entrega.entregadorNome,
          }

          const entregasAtualizadas = s.entregas.map(e =>
            e.id === id ? entregaAtualizada! : e
          )

          // Se foi entregue, lança venda liquidada e entrada no caixa
          let vendas = s.vendas
          let caixaEntradas = s.caixaEntradas

          if (status === 'entregue' && entrega.status !== 'entregue') {
            if (!s.caixaAberto) return s
            novaVendaGerada = {
              id: uid(),
              data: hoje(),
              pagamento: entrega.pagamento,
              itens: entrega.itens,
              total: entrega.total,
              obs: `Entrega Concluída (${entrega.clienteNome}) - ${entrega.endereco}`,
              criadoEm: new Date().toISOString(),
            }
            vendas = [...vendas, novaVendaGerada]
            if (entrega.pagamento !== 'fiado') {
              entradaCaixaGerada = {
                tipo: 'venda',
                pagamento: entrega.pagamento,
                valor: entrega.total,
                data: hoje(),
                descricao: `Entrega #${id.slice(-4)} - ${entrega.clienteNome}`,
                caixaId: s.caixaAberto.id,
              }
              caixaEntradas = [...caixaEntradas, entradaCaixaGerada]
            }
          }

          return {
            entregas: entregasAtualizadas,
            vendas,
            caixaEntradas,
          }
        })

        if (entregaAtualizada) trySync(() => sync.upsertEntrega(entregaAtualizada as PedidoEntrega))
        if (novaVendaGerada) {
          const venda = novaVendaGerada as Venda
          trySync(() => sync.insertVenda(venda, venda.itens))
        }
        if (entradaCaixaGerada) trySync(() => sync.insertCaixaEntrada(entradaCaixaGerada as EntradaCaixa))
      },

      toggleTema: () => set(s => {
        const next = s.tema === 'light' ? 'dark' : 'light'
        document.documentElement.classList.toggle('dark', next === 'dark')
        return { tema: next }
      }),

      resetDemo: () => set({
        produtos: DEMO_PRODUTOS.map(p => ({ ...p, id: uid() })),
        movimentacoes: [], vendas: [], clientes: [], caixaEntradas: [], caixas: [], caixaAberto: undefined
      }),
      clearAll: () => set({ produtos: [], movimentacoes: [], vendas: [], clientes: [], caixaEntradas: [], caixas: [], caixaAberto: undefined }),
      hydrateFromRemote: (data) => set(s => ({
        produtos: data.produtos.length ? data.produtos : s.produtos,
        movimentacoes: data.movimentacoes.length ? data.movimentacoes : s.movimentacoes,
        vendas: data.vendas.length ? data.vendas : s.vendas,
        clientes: data.clientes.length ? data.clientes : s.clientes,
        caixaEntradas: data.caixaEntradas.length ? data.caixaEntradas : s.caixaEntradas,
        caixas: data.caixas.length ? data.caixas : s.caixas,
        entregas: data.entregas.length ? data.entregas : s.entregas,
        caixaAberto: data.caixas.find(c => !c.fechadoEm) || s.caixaAberto,
      })),
    }),
    { name: 'adega-pro-store' }
  )
)

export { uid, hoje }

export function fmtR(n: number) {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export function fmtData(str?: string) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}
export function margemLiquida(p: Produto) {
  if (!p || p.precoVenda <= 0) return 0
  const tax = (p.imposto || 0) / 100
  const comissao = (p.comissao || 0) / 100
  const custo = p.precoCompra + (p.frete || 0) + p.precoCompra * tax + p.precoVenda * comissao
  return ((p.precoVenda - custo) / p.precoVenda) * 100
}
export function calcularEstoqueMinimoRecomendado(
  produto: Produto,
  movimentacoes: Movimentacao[],
  diasPeriodo: number = 30,
  diasSeguranca: number = 5
) {
  const corte = cortarData(diasPeriodo)
  const totalSaidas = movimentacoes
    .filter(m => m.produtoId === produto.id && m.tipo === 'saida' && (!corte || m.data >= corte))
    .reduce((s, m) => s + m.quantidade, 0)

  // Demanda diária no período
  const demandaDiaria = totalSaidas / diasPeriodo
  const leadTime = produto.leadTime || 3

  // Fator de segurança proporcional ao giro e prazo de entrega
  // Estoque mínimo = Demanda no lead time + Margem de segurança de giro
  const estoqueMinCalculado = Math.ceil(demandaDiaria * (leadTime + diasSeguranca))

  // Piso de proteção: produtos com vendas têm mínimo de pelo menos 2 un, produtos sem vendas têm mínimo de 1 ou mantêm 1
  return Math.max(demandaDiaria > 0 ? 2 : 1, estoqueMinCalculado)
}

export function cortarData(dias: number | 'all') {
  if (dias === 'all') return null
  return cortarDataBRT(Number(dias))
}
