import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hojeBRT, isoParaDataBRT, cortarDataBRT } from './dateBR'
import { cmvDaVenda } from './lucro'
import * as sync from './sync'
import { getInventoryPolicy } from './intelligence/engine'

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
  /** Produto físico cujo estoque é consumido por este item (ex.: garrafa para uma dose). */
  produtoEstoqueOrigemId?: string
  /** Quantas unidades deste item uma unidade do produto físico rende (ex.: 10 doses por garrafa). */
  unidadesPorEstoqueOrigem?: number
  automaticQualityScore?: number
  automaticQualityLevel?: number
  confidenceScore?: number
  /** Menor quantidade aceita pelo fornecedor em um pedido. */
  quantidadeMinimaCompra?: number
  /** Caixa/fardo: a recomendação sempre é arredondada para este múltiplo. */
  multiploCompra?: number
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
  motivo?: 'compra' | 'venda' | 'inventario' | 'perda' | 'quebra' | 'validade' | 'devolucao' | 'outro'
  aprovadoPor?: string
  aprovadoEm?: string
}

export type ItemVenda = {
  produtoId: string
  quantidade: number
  precoUnit: number
  /** Foto textual do item no momento da venda; preserva o histórico após renomear/excluir produto. */
  produtoNome?: string
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
  email?: string
  tags?: string[]
  observacoes?: string
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

// Helper de write-through: tenta sync no Supabase.
// Em caso de falha de rede/auth, enfileira a operação no localStorage
// para tentar novamente depois.
// Helper que aguenta o formato novo (com nomes/args) ou antigo (função simples)
function trySync<Args extends unknown[]>(opName: string, args: Args, syncFn: (...args: Args) => Promise<void>) {
  syncFn(...args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[sync] falhou: ${opName}`, message)
    sync.enfileirarSync(opName, args, error)
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
  status: 'pendente' | 'aceito' | 'em_rota' | 'entregue' | 'cancelado' | 'nao_entregue'
  entregadorId?: string
  entregadorNome?: string
  data: string
  criadoEm: string
  obs?: string
  lat?: number
  lng?: number
  aceitoEm?: string
  emRotaEm?: string
  entregueEm?: string
  canceladoEm?: string
  canceladoMotivo?: string
  naoEntregueEm?: string
  naoEntregueMotivo?: string
  recebedorNome?: string
  codigoConfirmacao?: string
}

export type PedidoCompra = {
  id: string
  fornecedorId?: string
  fornecedorNome?: string
  status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled'
  itens: { produtoId: string, quantidade: number, precoCusto: number }[]
  dataPedido: string
  recebidoEm?: string
  lojaId: string
}

export function vendasParaControleEstoque(vendas: Venda[], produtos: Produto[]): Venda[] {
  return vendas.map(venda => {
    const itens = new Map<string, ItemVenda>()
    venda.itens.forEach(item => {
      const produto = produtos.find(p => p.id === item.produtoId)
      const origemId = produto?.produtoEstoqueOrigemId
      const divisor = Math.max(1, produto?.unidadesPorEstoqueOrigem || 1)
      const produtoId = origemId || item.produtoId
      const atual = itens.get(produtoId)
      itens.set(produtoId, {
        produtoId,
        quantidade: (atual?.quantidade || 0) + item.quantidade / divisor,
        // Preserva o faturamento ao converter doses para a unidade física.
        precoUnit: origemId ? item.precoUnit * divisor : item.precoUnit,
      })
    })
    return { ...venda, itens: [...itens.values()] }
  })
}

function consumoEstoque(itens: ItemVenda[], produtos: Produto[]): Map<string, number> {
  return itens.reduce((consumos, item) => {
    const produto = produtos.find(p => p.id === item.produtoId)
    const origemId = produto?.produtoEstoqueOrigemId || item.produtoId
    const divisor = Math.max(1, produto?.unidadesPorEstoqueOrigem || 1)
    consumos.set(origemId, (consumos.get(origemId) || 0) + item.quantidade / divisor)
    return consumos
  }, new Map<string, number>())
}

function recalcularPoliticaEstoque(produtos: Produto[], vendas: Venda[], pedidosCompra: PedidoCompra[]): Produto[] {
  const vendasConvertidas = vendasParaControleEstoque(vendas, produtos)
  return produtos.map(produto => {
    // Itens derivados não possuem estoque próprio nem devem receber recomendação de compra.
    if (produto.produtoEstoqueOrigemId) {
      return produto.estoqueMin === 0 && produto.pontoPedido === 0 ? produto : { ...produto, estoqueMin: 0, pontoPedido: 0 }
    }
    // O cadastro e a tela de Compras usam o mesmo motor. Isso evita que o
    // "mínimo automático" diga uma coisa e o plano de compra diga outra.
    const politica = getInventoryPolicy(produto, vendasConvertidas, pedidosCompra, 'local', produtos)
    // Estoque mínimo é a proteção de segurança; ponto de pedido inclui a
    // demanda esperada durante o pior prazo observado do fornecedor.
    const estoqueMin = Math.max(1, politica.safetyStock)
    const pontoPedido = Math.max(estoqueMin, politica.reorderPoint)
    return produto.estoqueMin === estoqueMin && produto.pontoPedido === pontoPedido && produto.confidenceScore === politica.confidenceScore
      ? produto
      : { ...produto, estoqueMin, pontoPedido, confidenceScore: politica.confidenceScore }
  })
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
   pedidosCompra: PedidoCompra[]
   currentRole?: 'owner' | 'gerente' | 'atendente' | 'entregador'
   currentUser?: { id: string; nome: string }
   lojaId: string
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
    updateStatusEntrega: (id: string, status: PedidoEntrega['status'], options?: { entregador?: { id: string; nome: string }; motivo?: string; recebedorNome?: string; codigoConfirmacao?: string }) => void
    
    addPedidoCompra: (p: PedidoCompra) => void
    atualizarStatusPedidoCompra: (id: string, status: PedidoCompra['status']) => void
    receberPedidoCompra: (id: string) => void
 
    toggleTema: () => void
   resetDemo: () => void
   clearAll: () => void
   hydrateFromRemote: (data: sync.CargaRemota) => void
   setRole: (role: 'owner' | 'gerente' | 'atendente' | 'entregador', lojaId: string, user?: { id: string; nome: string }) => void
 }

const DEMO_PRODUTOS: Omit<Produto, 'id'>[] = [
  { sku: 'CER001', nome: 'Heineken 600ml', categoria: 'Cerveja', fornecedor: 'Ambev', leadTime: 3, precoCompra: 8.5, precoVenda: 14.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 30, estoque: 48, estoqueMin: 12, pontoPedido: 24, qualidade: 4 },
  { sku: 'VIN001', nome: 'Vinho Tinto Miolo', categoria: 'Vinho', fornecedor: 'Miolo', leadTime: 7, precoCompra: 32, precoVenda: 55.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 35, estoque: 6, estoqueMin: 5, pontoPedido: 10, qualidade: 5 },
  { sku: 'DES001', nome: 'Whisky Jack Daniels', categoria: 'Destilado', fornecedor: 'Importadora', leadTime: 14, precoCompra: 89, precoVenda: 149.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 40, estoque: 8, estoqueMin: 3, pontoPedido: 6, qualidade: 5 },
  { sku: 'CER002', nome: 'Brahma Lata 350ml', categoria: 'Cerveja', fornecedor: 'Ambev', leadTime: 3, precoCompra: 3.2, precoVenda: 5.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 25, estoque: 120, estoqueMin: 30, pontoPedido: 60, qualidade: 3 },
  { sku: 'VIN002', nome: 'Espumante Chandon', categoria: 'Espumante', fornecedor: 'Chandon', leadTime: 10, precoCompra: 45, precoVenda: 79.9, imposto: 0, frete: 0, comissao: 0, margemAlvo: 40, estoque: 3, estoqueMin: 4, pontoPedido: 8, qualidade: 5 },
]

export const useStore = create<Store>()(
  persist((set) => ({
    produtos: DEMO_PRODUTOS.map(p => ({ ...p, id: uid() })),
    movimentacoes: [],
    vendas: [],
    clientes: [],
    caixaEntradas: [],
    caixas: [],
    caixaAberto: undefined,
    entregas: [],
    pedidosCompra: [],
    tema: 'light',
    lojaId: 'chegoudrinks',
    currentRole: undefined,

      addProduto: (p) => {
        const novo: Produto = { ...p, id: uid() }
        set(s => ({ produtos: [...s.produtos, novo] }))
        trySync('upsertProduto', [novo, useStore.getState().lojaId], sync.upsertProduto)
      },
      updateProduto: (p) => {
        set(s => ({ produtos: s.produtos.map(x => x.id === p.id ? p : x) }))
        trySync('upsertProduto', [p, useStore.getState().lojaId], sync.upsertProduto)
      },
      deleteProduto: (id) => {
        set(s => ({ produtos: s.produtos.filter(x => x.id !== id) }))
        trySync('deleteProduto', [id, useStore.getState().lojaId], sync.deleteProduto)
      },

    addMovimentacao: (m) => {
      const mov: Movimentacao = { ...m, id: uid() }
      set(s => {
        const produtosComEstoque = s.produtos.map(p => {
          if (p.id !== m.produtoId) return p
          const novoEst = m.tipo === 'entrada' ? p.estoque + m.quantidade : p.estoque - m.quantidade
          return { ...p, estoque: Math.max(0, novoEst) }
        })
        const prods = recalcularPoliticaEstoque(produtosComEstoque, s.vendas, s.pedidosCompra)
        prods.filter((p, index) => p !== s.produtos[index]).forEach(p => trySync('upsertProduto', [p, useStore.getState().lojaId], sync.upsertProduto))
        return { movimentacoes: [...s.movimentacoes, mov], produtos: prods }
      })
      trySync('insertMovimentacao', [mov, useStore.getState().lojaId], sync.insertMovimentacao)
    },
    deleteMovimentacao: (id) => {
      set(s => ({ movimentacoes: s.movimentacoes.filter(x => x.id !== id) }))
      trySync('deleteMovimentacao', [id, useStore.getState().lojaId], sync.deleteMovimentacao)
    },

      addVenda: (v) => {
        const venda: Venda = { ...v, id: uid(), criadoEm: new Date().toISOString() }
        const caixaId = useStore.getState().caixaAberto?.id
        if (!caixaId) return
        set(s => {
          const consumo = consumoEstoque(v.itens, s.produtos)
          const produtosComEstoque = s.produtos.map(p => {
            const quantidade = consumo.get(p.id)
            if (!quantidade) return p
            const novoEstoque = Math.max(0, p.estoque - quantidade)
            return { ...p, estoque: novoEstoque }
          })
          const prods = recalcularPoliticaEstoque(produtosComEstoque, [...s.vendas, venda], s.pedidosCompra)
          const clientes = v.clienteId && v.pagamento === 'fiado'
            ? s.clientes.map(c => c.id === v.clienteId
                ? { ...c, saldo: c.saldo + v.total, compras: c.compras + 1 }
                : c)
            : s.clientes
          const caixaEntradas = v.pagamento !== 'fiado'
            ? [...s.caixaEntradas, {
                tipo: 'venda' as const, pagamento: v.pagamento, valor: v.total, data: hoje(), descricao: `Venda ${v.pagamento}`, caixaId
              }]
            : s.caixaEntradas
          const movimentacoes = [...s.movimentacoes, ...v.itens.map(item => ({
            id: uid(), produtoId: item.produtoId, tipo: 'saida' as const,
            quantidade: item.quantidade, data: v.data, obs: `Venda ${v.pagamento}`
          }))]
          return { vendas: [...s.vendas, venda], produtos: prods, clientes, caixaEntradas, movimentacoes }
        })
        // Uma chamada no banco grava venda, itens, estoque, caixa e auditoria em
        // uma transação. Em caso de offline, a própria venda é reenviada com o
        // mesmo id e não é duplicada.
        trySync('confirmarVendaAtomica', [venda, caixaId, useStore.getState().lojaId], sync.confirmarVendaAtomica)
      },

      addCliente: (c) => {
        const novo: Cliente = { ...c, id: uid() }
        set(s => ({ clientes: [...s.clientes, novo] }))
        trySync('upsertCliente', [novo, useStore.getState().lojaId], sync.upsertCliente)
      },
      updateCliente: (c) => {
        set(s => ({ clientes: s.clientes.map(x => x.id === c.id ? c : x) }))
        trySync('upsertCliente', [c, useStore.getState().lojaId], sync.upsertCliente)
      },
      deleteCliente: (id) => {
        set(s => ({ clientes: s.clientes.filter(x => x.id !== id) }))
        trySync('deleteCliente', [id, useStore.getState().lojaId], sync.deleteCliente)
      },

      abrirCaixa: () => {
        if (useStore.getState().caixaAberto) return
        const novo: Caixa = { id: uid(), abertoEm: new Date().toISOString() }
        set(() => ({ caixaAberto: novo }))
        trySync('upsertCaixa', [novo, useStore.getState().lojaId], sync.upsertCaixa)
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
        trySync('upsertCaixa', [caixaFechado, useStore.getState().lojaId], sync.upsertCaixa)
        return { caixaAberto: undefined, caixas: [caixaFechado, ...(s.caixas || [])] }
      }),
      addCaixaEntrada: (e) => {
        if (!useStore.getState().caixaAberto) return
        const entrada = { ...e, caixaId: useStore.getState().caixaAberto!.id }
        set(s => ({ caixaEntradas: [...s.caixaEntradas, entrada] }))
        trySync('insertCaixaEntrada', [entrada, useStore.getState().lojaId], sync.insertCaixaEntrada)
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
        trySync('upsertCliente', [{ ...cliente, saldo: novoSaldo }, useStore.getState().lojaId], sync.upsertCliente)
        trySync('insertCaixaEntrada', [entradaCaixa, useStore.getState().lojaId], sync.insertCaixaEntrada)
        trySync('insertVenda', [novaVendaQuitada, [], useStore.getState().lojaId], sync.insertVenda)

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
          const consumo = consumoEstoque(p.itens, s.produtos)
          const produtosComEstoque = s.produtos.map(prod => {
            const quantidade = consumo.get(prod.id)
            return quantidade ? { ...prod, estoque: Math.max(0, prod.estoque - quantidade) } : prod
          })
          const prods = recalcularPoliticaEstoque(produtosComEstoque, s.vendas, s.pedidosCompra)
          prods.filter((prod, index) => prod !== s.produtos[index]).forEach(prod => trySync('upsertProduto', [prod, useStore.getState().lojaId], sync.upsertProduto))
          const movimentacoes = [...s.movimentacoes, ...p.itens.map(item => ({
            id: uid(),
            produtoId: item.produtoId,
            tipo: 'saida' as const,
            quantidade: item.quantidade,
            data: hoje(),
            obs: `Pedido Entrega #${id.slice(-4)} (${p.clienteNome})`,
          }))]
          // Write-through
          trySync('upsertEntrega', [novaEntrega, useStore.getState().lojaId], sync.upsertEntrega)
          p.itens.forEach(item => {
            trySync('insertMovimentacao', [{
              id: uid(), produtoId: item.produtoId, tipo: 'saida',
              quantidade: item.quantidade, data: hoje(),
              obs: `Pedido Entrega #${id.slice(-4)} (${p.clienteNome})`,
            }, useStore.getState().lojaId], sync.insertMovimentacao)
          })
          return {
            entregas: [novaEntrega, ...s.entregas],
            produtos: prods,
            movimentacoes,
          }
        })
        return id
      },

      updateStatusEntrega: (id, status, options) => {
        let novaVendaGerada: Venda | null = null
        let entradaCaixaGerada: EntradaCaixa | null = null
        let entregaAtualizada: PedidoEntrega | null = null
        let movimentacoesDevolucao: Movimentacao[] = []
        let produtosParaSincronizar: Produto[] = []

        set(s => {
          const entrega = s.entregas.find(e => e.id === id)
          if (!entrega) return s

          entregaAtualizada = {
            ...entrega,
            status,
            entregadorId: options?.entregador?.id ?? entrega.entregadorId,
            entregadorNome: options?.entregador?.nome ?? entrega.entregadorNome,
            aceitoEm: status === 'aceito' && entrega.status !== 'aceito' ? new Date().toISOString() : entrega.aceitoEm,
            emRotaEm: status === 'em_rota' && entrega.status !== 'em_rota' ? new Date().toISOString() : entrega.emRotaEm,
            entregueEm: status === 'entregue' && entrega.status !== 'entregue' ? new Date().toISOString() : entrega.entregueEm,
            canceladoEm: status === 'cancelado' && entrega.status !== 'cancelado' ? new Date().toISOString() : entrega.canceladoEm,
            canceladoMotivo: status === 'cancelado' ? options?.motivo ?? entrega.canceladoMotivo : entrega.canceladoMotivo,
            naoEntregueEm: status === 'nao_entregue' && entrega.status !== 'nao_entregue' ? new Date().toISOString() : entrega.naoEntregueEm,
            naoEntregueMotivo: status === 'nao_entregue' ? options?.motivo ?? entrega.naoEntregueMotivo : entrega.naoEntregueMotivo,
            recebedorNome: options?.recebedorNome ?? entrega.recebedorNome,
            codigoConfirmacao: options?.codigoConfirmacao ?? entrega.codigoConfirmacao,
          }

          const entregasAtualizadas = s.entregas.map(e =>
            e.id === id ? entregaAtualizada! : e
          )

          // Se foi entregue, lança venda liquidada e entrada no caixa
          let vendas = s.vendas
          let caixaEntradas = s.caixaEntradas
          let movimentacoes = s.movimentacoes
          let produtosBase = s.produtos

          // O estoque é reservado na criação. Ao cancelar antes da conclusão,
          // devolvemos exatamente a reserva e mantemos uma trilha auditável.
          if (status === 'cancelado' && entrega.status !== 'cancelado' && entrega.status !== 'entregue') {
            const devolucao = consumoEstoque(entrega.itens, s.produtos)
            produtosBase = s.produtos.map(produto => {
              const quantidade = devolucao.get(produto.id)
              return quantidade ? { ...produto, estoque: produto.estoque + quantidade } : produto
            })
            movimentacoesDevolucao = entrega.itens.map(item => ({
              id: uid(), produtoId: item.produtoId, tipo: 'entrada', quantidade: item.quantidade,
              data: hoje(), obs: `Cancelamento da entrega #${id.slice(-4)}${options?.motivo ? `: ${options.motivo}` : ''}`,
            }))
            movimentacoes = [...movimentacoes, ...movimentacoesDevolucao]
          }

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

          const produtos = novaVendaGerada || movimentacoesDevolucao.length
            ? recalcularPoliticaEstoque(produtosBase, vendas, s.pedidosCompra)
            : produtosBase
          produtosParaSincronizar = produtos

          return {
            entregas: entregasAtualizadas,
            vendas,
            caixaEntradas,
            movimentacoes,
            produtos,
          }
        })

        if (entregaAtualizada) trySync('upsertEntrega', [entregaAtualizada as PedidoEntrega, useStore.getState().lojaId], sync.upsertEntrega)
        movimentacoesDevolucao.forEach(mov => trySync('insertMovimentacao', [mov, useStore.getState().lojaId], sync.insertMovimentacao))
        if (movimentacoesDevolucao.length) produtosParaSincronizar.forEach(produto => trySync('upsertProduto', [produto, useStore.getState().lojaId], sync.upsertProduto))
        if (novaVendaGerada) {
          const venda = novaVendaGerada as Venda
          trySync('insertVenda', [venda, venda.itens, useStore.getState().lojaId], sync.insertVenda)
          venda.itens.forEach(item => {
            const produto = useStore.getState().produtos.find(p => p.id === item.produtoId)
            if (produto) trySync('upsertProduto', [produto, useStore.getState().lojaId], sync.upsertProduto)
          })
        }
        if (entradaCaixaGerada) trySync('insertCaixaEntrada', [entradaCaixaGerada as EntradaCaixa, useStore.getState().lojaId], sync.insertCaixaEntrada)
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
       hydrateFromRemote: (data) => set(() => ({
         produtos: data.produtos,
         movimentacoes: data.movimentacoes,
         vendas: data.vendas,
         clientes: data.clientes,
         caixaEntradas: data.caixaEntradas,
         caixas: data.caixas,
         entregas: data.entregas,
         pedidosCompra: data.pedidosCompra,
         caixaAberto: data.caixas.find(c => !c.fechadoEm),
       })),
       setRole: (role, lojaId, user) => set({ currentRole: role, lojaId, currentUser: user }),
       
       addPedidoCompra: (p) => {
         set(s => ({ pedidosCompra: [...s.pedidosCompra, p] }))
         trySync('upsertPedidoCompra', [p, useStore.getState().lojaId], sync.upsertPedidoCompra)
       },
       atualizarStatusPedidoCompra: (id, status) => {
         let atualizado: PedidoCompra | undefined
         set(s => {
           const pedido = s.pedidosCompra.find(p => p.id === id)
           if (!pedido || pedido.status === 'received' || pedido.status === 'cancelled') return s
           atualizado = { ...pedido, status }
           return { pedidosCompra: s.pedidosCompra.map(p => p.id === id ? atualizado! : p) }
         })
         if (atualizado) trySync('upsertPedidoCompra', [atualizado, useStore.getState().lojaId], sync.upsertPedidoCompra)
       },
       receberPedidoCompra: (id) => {
         let recebido: PedidoCompra | undefined
         set(s => {
           const pedido = s.pedidosCompra.find(p => p.id === id)
           if (!pedido || pedido.status === 'received' || pedido.status === 'cancelled' || pedido.status === 'draft') return s
           recebido = { ...pedido, status: 'received', recebidoEm: new Date().toISOString() }
           const produtosComEstoque = s.produtos.map(p => {
             const item = pedido.itens.find(i => i.produtoId === p.id)
             return item ? { ...p, estoque: p.estoque + item.quantidade } : p
           })
           const pedidosAtualizados = s.pedidosCompra.map(p => p.id === id ? recebido! : p)
           const prods = recalcularPoliticaEstoque(produtosComEstoque, s.vendas, pedidosAtualizados)
           return { pedidosCompra: pedidosAtualizados, produtos: prods }
         })
         if (recebido) {
           trySync('upsertPedidoCompra', [recebido, useStore.getState().lojaId], sync.upsertPedidoCompra)
           recebido.itens.forEach(item => {
             const produto = useStore.getState().produtos.find(p => p.id === item.produtoId)
             if (produto) trySync('upsertProduto', [produto, useStore.getState().lojaId], sync.upsertProduto)
           })
         }
       },
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
