import { useState } from 'react'
import { useStore, fmtData, hoje } from '../lib/store'
import { toast } from '../lib/toast'
import { Plus, Trash2 } from 'lucide-react'

export function Movimentacoes() {
  const { produtos, movimentacoes, addMovimentacao, deleteMovimentacao } = useStore()
  const [modal, setModal] = useState(false)
  const [produtoId, setProdutoId] = useState('')
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [quantidade, setQuantidade] = useState(1)
  const [data, setData] = useState(hoje())
  const [lote, setLote] = useState('')
  const [validade, setValidade] = useState('')
  const [obs, setObs] = useState('')

  const filteredProds = produtos.filter(p => 
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const [filterProd, setFilterProd] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 20

  const filtered = [...movimentacoes]
    .filter(m =>
      (!filterProd || m.produtoId === filterProd) &&
      (!filterTipo || m.tipo === filterTipo) &&
      (!filterFrom || m.data >= filterFrom) &&
      (!filterTo || m.data <= filterTo)
    )
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))

  const totalPages = Math.ceil(filtered.length / perPage)
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)

  function salvar() {
    if (!produtoId || quantidade <= 0) { toast('Preencha produto e quantidade', 'warning'); return }
    const p = produtos.find(x => x.id === produtoId)!
    if (tipo === 'saida' && p.estoque < quantidade) {
      toast('Estoque insuficiente', 'danger'); return
    }
    addMovimentacao({ produtoId, tipo, quantidade, data, lote, validade, obs })
    toast(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada`)
    setModal(false)
    setProdutoId(''); setSearch(''); setQuantidade(1); setLote(''); setValidade(''); setObs('')
  }

  function remover(id: string) {
    if (!confirm('Excluir movimentação?')) return
    deleteMovimentacao(id); toast('Removida', 'warning')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Movimentações</h2>
        <button onClick={() => setModal(true)} className="ml-auto flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <Plus size={14} /> Nova
        </button>
      </div>

      <div className="card-adega p-3 flex flex-wrap gap-2">
        <select className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          value={filterProd} onChange={e => { setFilterProd(e.target.value); setPage(1) }}>
          <option value="">Todos produtos</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1) }}>
          <option value="">Todos tipos</option>
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
        </select>
        <input type="date" className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1) }} />
        <input type="date" className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1) }} />
      </div>

      <div className="card-adega overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl-adega">
            <thead><tr>
              <th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Lote</th><th>Validade</th><th>Obs</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma movimentação</td></tr>
              ) : pageItems.map(m => {
                const p = produtos.find(x => x.id === m.produtoId)
                return (
                  <tr key={m.id}>
                    <td>{fmtData(m.data)}</td>
                    <td>{p?.nome || 'Removido'}</td>
                    <td><span className={`badge-adega ${m.tipo === 'entrada' ? 'badge-success' : 'badge-danger'}`}>{m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                    <td className={`font-bold ${m.tipo === 'entrada' ? 'text-success' : 'text-destructive'}`}>{m.tipo === 'entrada' ? '+' : '-'}{m.quantidade}</td>
                    <td>{m.lote || '—'}</td>
                    <td>{m.validade ? fmtData(m.validade) : '—'}</td>
                    <td className="text-muted-foreground">{m.obs || '—'}</td>
                    <td><button onClick={() => remover(m.id)} className="p-1 rounded text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button></td>
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-adega w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Nova Movimentação</h3>
              <button onClick={() => setModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Produto *</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full p-2 border border-border rounded-lg bg-background" 
                    placeholder="Digite nome ou SKU..." 
                    value={search} 
                    onChange={e => { setSearch(e.target.value); setShowDropdown(true); if(!e.target.value) setProdutoId('') }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {showDropdown && search && (
                    <div className="absolute z-10 w-full bg-background border border-border rounded-lg mt-1 max-h-40 overflow-y-auto shadow-lg">
                      {filteredProds.map(p => (
                        <div 
                          key={p.id} 
                          className="p-2 hover:bg-muted cursor-pointer"
                          onClick={() => { setProdutoId(p.id); setSearch(`[${p.sku}] ${p.nome}`); setShowDropdown(false) }}
                        >
                          [{p.sku}] {p.nome} (Estoque: {p.estoque})
                        </div>
                      ))}
                      {filteredProds.length === 0 && <div className="p-2 text-muted-foreground">Produto não encontrado</div>}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Tipo</label>
                  <select className="w-full p-2 border border-border rounded-lg bg-background" value={tipo} onChange={e => setTipo(e.target.value as 'entrada' | 'saida')}>
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Quantidade</label>
                  <input type="number" min={1} className="w-full p-2 border border-border rounded-lg bg-background" value={quantidade} onChange={e => setQuantidade(parseInt(e.target.value) || 1)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Data</label>
                  <input type="date" className="w-full p-2 border border-border rounded-lg bg-background" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Lote (opcional)</label>
                  <input className="w-full p-2 border border-border rounded-lg bg-background" value={lote} onChange={e => setLote(e.target.value)} placeholder="Lote" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Validade</label>
                  <input type="date" className="w-full p-2 border border-border rounded-lg bg-background" value={validade} onChange={e => setValidade(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Observação</label>
                  <input className="w-full p-2 border border-border rounded-lg bg-background" value={obs} onChange={e => setObs(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">Cancelar</button>
              <button onClick={salvar} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90">Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
