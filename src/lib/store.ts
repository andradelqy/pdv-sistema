import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  return new Date().toISOString().split('T')[0]
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

      addProduto: (p) => set(s => ({ produtos: [...s.produtos, { ...p, id: uid() }] })),
      updateProduto: (p) => set(s => ({ produtos: s.produtos.map(x => x.id === p.id ? p : x) })),
      deleteProduto: (id) => set(s => ({ produtos: s.produtos.filter(x => x.id !== id) })),

      addMovimentacao: (m) => {
        const mov: Movimentacao = { ...m, id: uid() }
        set(s => {
          const prods = s.produtos.map(p => {
            if (p.id !== m.produtoId) return p
            const novoEst = m.tipo === 'entrada' ? p.estoque + m.quantidade : p.estoque - m.quantidade
            return { ...p, estoque: Math.max(0, novoEst) }
          })
          return { movimentacoes: [...s.movimentacoes, mov], produtos: prods }
        })
      },
      deleteMovimentacao: (id) => set(s => ({ movimentacoes: s.movimentacoes.filter(x => x.id !== id) })),

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
      },

      addCliente: (c) => set(s => ({ clientes: [...s.clientes, { ...c, id: uid() }] })),
      updateCliente: (c) => set(s => ({ clientes: s.clientes.map(x => x.id === c.id ? c : x) })),
      deleteCliente: (id) => set(s => ({ clientes: s.clientes.filter(x => x.id !== id) })),

      abrirCaixa: () => set(s => s.caixaAberto ? s : { caixaAberto: { id: uid(), abertoEm: new Date().toISOString() } }),
      fecharCaixa: () => set(s => {
        const caixaAberto = s.caixaAberto
        if (!caixaAberto) return s
        const inicio = caixaAberto.abertoEm.slice(0, 10)
        const entradasCaixa = s.caixaEntradas.filter(e => e.caixaId === caixaAberto.id || (!e.caixaId && e.data >= inicio))
        const vendasCaixa = s.vendas.filter(v => v.criadoEm >= caixaAberto.abertoEm && v.pagamento !== 'fiado')
        const custo = vendasCaixa.flatMap(v => v.itens).reduce((sum, item) => {
          const produto = s.produtos.find(p => p.id === item.produtoId)
          return sum + (produto?.precoCompra || 0) * item.quantidade
        }, 0)
        const caixaFechado = {
          ...caixaAberto,
          fechadoEm: new Date().toISOString(),
          faturamentoBruto: entradasCaixa.filter(e => e.tipo === 'venda').reduce((sum, e) => sum + e.valor, 0),
          lucroLiquido: vendasCaixa.reduce((sum, v) => sum + v.total, 0) - custo,
          vendas: vendasCaixa.length,
        }
        return { caixaAberto: undefined, caixas: [caixaFechado, ...(s.caixas || [])] }
      }),
      addCaixaEntrada: (e) => set(s => s.caixaAberto ? { caixaEntradas: [...s.caixaEntradas, { ...e, caixaId: s.caixaAberto.id }] } : s),

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
            return { ...prod, estoque: Math.max(0, prod.estoque - item.quantidade) }
          })
          const movimentacoes = [...s.movimentacoes, ...p.itens.map(item => ({
            id: uid(),
            produtoId: item.produtoId,
            tipo: 'saida' as const,
            quantidade: item.quantidade,
            data: hoje(),
            obs: `Pedido Entrega #${id.slice(-4)} (${p.clienteNome})`,
          }))]
          return {
            entregas: [novaEntrega, ...s.entregas],
            produtos: prods,
            movimentacoes,
          }
        })
        return id
      },

      updateStatusEntrega: (id, status, entregador) => set(s => {
        const entrega = s.entregas.find(e => e.id === id)
        if (!entrega) return s

        const entregasAtualizadas = s.entregas.map(e =>
          e.id === id
            ? {
                ...e,
                status,
                entregadorId: entregador?.id ?? e.entregadorId,
                entregadorNome: entregador?.nome ?? e.entregadorNome,
              }
            : e
        )

        // Se foi entregue, lança venda liquidada e entrada no caixa
        let vendas = s.vendas
        let caixaEntradas = s.caixaEntradas

        if (status === 'entregue' && entrega.status !== 'entregue') {
          if (!s.caixaAberto) return s
          const novaVenda: Venda = {
            id: uid(),
            data: hoje(),
            pagamento: entrega.pagamento,
            itens: entrega.itens,
            total: entrega.total,
            obs: `Entrega Concluída (${entrega.clienteNome}) - ${entrega.endereco}`,
            criadoEm: new Date().toISOString(),
          }
          vendas = [...vendas, novaVenda]
          if (entrega.pagamento !== 'fiado') {
            caixaEntradas = [...caixaEntradas, {
              tipo: 'venda',
              pagamento: entrega.pagamento,
              valor: entrega.total,
              data: hoje(),
              descricao: `Entrega #${id.slice(-4)} - ${entrega.clienteNome}`,
              caixaId: s.caixaAberto.id,
            }]
          }
        }

        return {
          entregas: entregasAtualizadas,
          vendas,
          caixaEntradas,
        }
      }),

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
  const d = new Date()
  d.setDate(d.getDate() - Number(dias))
  return d.toISOString().split('T')[0]
}
