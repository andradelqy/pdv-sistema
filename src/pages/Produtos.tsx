import { useState, useMemo } from 'react'
import { useStore, fmtR, margemLiquida, calcularEstoqueMinimoRecomendado, type Produto } from '../lib/store'
import { toast } from '../lib/toast'
import { Plus, Pencil, Trash2, Search, Sparkles, Wand2 } from 'lucide-react'

const EMPTY: Omit<Produto, 'id'> = {
  sku: '', nome: '', barcode: '', descricao: '', categoria: '', fornecedor: '',
  leadTime: 7, precoCompra: 0, precoVenda: 0, imposto: 0, frete: 0, comissao: 0,
  margemAlvo: 30, estoque: 0, estoqueMin: 5, pontoPedido: 10, qualidade: 3,
}

export function Produtos() {
  const { produtos, movimentacoes, addProduto, updateProduto, deleteProduto } = useStore()
  const [busca, setBusca] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Produto | Omit<Produto, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 20

  // Mapa de estoque mínimo inteligente sugerido para cada produto
  const estoquesSugeridos = useMemo(() => {
    const mapa: Record<string, number> = {}
    produtos.forEach(p => {
      mapa[p.id] = calcularEstoqueMinimoRecomendado(p, movimentacoes)
    })
    return mapa
  }, [produtos, movimentacoes])

  // Aplica a sugestão inteligente em lote para todos os produtos
  function aplicarMinimoInteligenteLote() {
    let alterados = 0
    produtos.forEach(p => {
      const sugerido = calcularEstoqueMinimoRecomendado(p, movimentacoes)
      if (p.estoqueMin !== sugerido) {
        updateProduto({
          ...p,
          estoqueMin: sugerido,
          pontoPedido: Math.max(sugerido + 2, Math.ceil(sugerido * 1.5)),
        })
        alterados++
      }
    })
    toast(`Estoque mínimo ajustado para ${alterados} produto(s) com base no giro!`, 'success')
  }

  const cats = [...new Set(produtos.map(p => p.categoria).filter(Boolean))]

  const filtered = produtos.filter(p =>
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.sku.toLowerCase().includes(busca.toLowerCase())) &&
    (!filterCat || p.categoria === filterCat)
  )

  const totalPages = Math.ceil(filtered.length / perPage)
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)

  function openNew() {
    setForm(EMPTY); setEditId(null); setModal(true)
  }
  function openEdit(p: Produto) {
    setForm(p); setEditId(p.id); setModal(true)
  }

  function aplicarSugeridoNoForm() {
    const pTemp = { ...(form as Produto), id: editId || 'temp' }
    const sugerido = calcularEstoqueMinimoRecomendado(pTemp, movimentacoes)
    setForm(f => ({
      ...f,
      estoqueMin: sugerido,
      pontoPedido: Math.max(sugerido + 2, Math.ceil(sugerido * 1.5)),
    }))
    toast(`Mínimo sugerido de ${sugerido} un aplicado!`)
  }

  function salvar() {
    const f = form as Produto
    if (!f.sku || !f.nome || f.precoCompra <= 0 || f.precoVenda <= 0) {
      toast('Preencha SKU, Nome, Custo e Venda', 'warning'); return
    }
    if (f.precoVenda < f.precoCompra) {
      toast('Preço de venda menor que custo', 'warning'); return
    }
    // Garantir que imposto, frete e comissão fiquem zerados
    const produtoSalvo = {
      ...f,
      imposto: 0,
      frete: 0,
      comissao: 0,
    }
    if (editId) { 
      updateProduto({ ...produtoSalvo, id: editId }); 
      toast('Produto atualizado') 
    } else { 
      addProduto(produtoSalvo as Omit<Produto, 'id'>); 
      toast('Produto cadastrado') 
    }
    setModal(false)
  }
  function excluir(id: string) {
    if (!confirm('Excluir produto?')) return
    deleteProduto(id); toast('Excluído', 'warning')
  }

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const statusCls = (p: Produto) =>
    p.estoque <= p.estoqueMin ? 'badge-danger' : p.estoque <= p.pontoPedido ? 'badge-warning' : 'badge-success'
  const statusLabel = (p: Produto) =>
    p.estoque <= p.estoqueMin ? 'Crítico' : p.estoque <= p.pontoPedido ? 'Alerta' : 'OK'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Produtos</h2>
        <div className="ml-auto flex gap-2">
          <button
            onClick={aplicarMinimoInteligenteLote}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            title="Recalcular e ajustar estoque mínimo de todos os produtos com base nas vendas recentes"
          >
            <Wand2 size={14} /> Mínimo Inteligente (Auto)
          </button>
          <button onClick={openNew} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Plus size={14} /> Novo
          </button>
        </div>
      </div>

      <div className="card-adega p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-background text-sm"
            placeholder="Buscar..." value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} />
        </div>
        <select className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}>
          <option value="">Todas categorias</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card-adega overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl-adega">
            <thead><tr>
              <th>SKU</th><th>Nome</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th>
              <th>Custo</th><th>Venda</th><th>Margem</th><th>Qualidade</th><th>Situação</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum produto cadastrado</td></tr>
              ) : pageItems.map(p => {
                const mg = margemLiquida(p)
                const sugerido = estoquesSugeridos[p.id] || p.estoqueMin
                const temDivergencia = sugerido !== p.estoqueMin

                return (
                  <tr key={p.id}>
                    <td><code className="text-xs bg-muted px-1 rounded">{p.sku}</code></td>
                    <td className="font-medium">{p.nome}</td>
                    <td><span className="badge-adega badge-info">{p.categoria || '—'}</span></td>
                    <td className={`font-bold ${p.estoque <= p.estoqueMin ? 'text-destructive' : p.estoque <= p.pontoPedido ? 'text-warning' : ''}`}>{p.estoque}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground font-medium">{p.estoqueMin}</span>
                        {temDivergencia && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold cursor-help"
                            title={`Mínimo sugerido pelo giro de vendas: ${sugerido} un`}
                          >
                            Sug: {sugerido}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{fmtR(p.precoCompra)}</td>
                    <td className="font-semibold">{fmtR(p.precoVenda)}</td>
                    <td className={mg > 30 ? 'text-success font-semibold' : mg > 15 ? 'text-warning font-semibold' : 'text-destructive font-semibold'}>{mg.toFixed(1)}%</td>
                    <td>{'★'.repeat(p.qualidade)}{'☆'.repeat(5 - p.qualidade)}</td>
                    <td><span className={`badge-adega ${statusCls(p)}`}>{statusLabel(p)}</span></td>
                    <td className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="p-1 rounded hover:bg-muted" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => excluir(p.id)} className="p-1 rounded text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 border border-border rounded disabled:opacity-40">‹</button>
            <span className="text-muted-foreground">Página {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 border border-border rounded disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-adega w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">{editId ? 'Editar' : 'Novo'} Produto</h3>
                <p className="text-xs text-muted-foreground">Cadastre as informações de estoque e fornecedor.</p>
              </div>
              <button onClick={() => setModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Sparkles size={16} className="text-amber-500 shrink-0" />
                <span>
                  Sugerido pelo giro:{' '}
                  <strong>
                    {calcularEstoqueMinimoRecomendado({ ...(form as Produto), id: editId || 'temp' }, movimentacoes)} un
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={aplicarSugeridoNoForm}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer shadow-sm"
              >
                Aplicar Sugestão
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {([
                ['SKU *', 'sku', 'text'],
                ['Nome *', 'nome', 'text'],
                ['Cód. Barras', 'barcode', 'text'],
                ['Categoria', 'categoria', 'text'],
                ['Fornecedor', 'fornecedor', 'text'],
                ['Lead Time (dias)', 'leadTime', 'number'],
                ['Custo *', 'precoCompra', 'number'],
                ['Venda *', 'precoVenda', 'number'],
                ['Margem Alvo (%)', 'margemAlvo', 'number'],
                ['Estoque', 'estoque', 'number'],
                ['Mínimo', 'estoqueMin', 'number'],
                ['Ponto Pedido', 'pontoPedido', 'number'],
                ['Qualidade (1-5)', 'qualidade', 'number'],
                ['URL Imagem', 'imagem', 'text'],
              ] as [string, keyof Omit<Produto, 'id'>, string][]).map(([label, key, type]) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
                  <input
                    type={type} step={type === 'number' ? '0.01' : undefined}
                    min={type === 'number' ? 0 : undefined}
                    max={key === 'qualidade' ? 5 : undefined}
                    className="w-full p-2 border border-border rounded-lg bg-background"
                    value={(form as Record<string, unknown>)[key] as string || ''}
                    onChange={e => setField(key, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">Cancelar</button>
              <button onClick={salvar} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
