import { useState } from 'react'
import { useStore, fmtR, hoje, cortarData, type Cliente } from '../lib/store'
import { toast } from '../lib/toast'
import { Plus, Pencil, Trash2, Search, MessageCircle, Check, DollarSign } from 'lucide-react'

const EMPTY: Omit<Cliente, 'id'> = { nome: '', telefone: '', limite: 100, saldo: 0, compras: 0 }

export function Clientes() {
  const { clientes, vendas, addCliente, updateCliente, deleteCliente, quitarFiado } = useStore()
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Cliente | Omit<Cliente, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)

  // Estado para o modal de quitação
  const [quitarModal, setQuitarModal] = useState<Cliente | null>(null)
  const [valorQuitacao, setValorQuitacao] = useState<string>('')
  const [formaPagamentoQuitacao, setFormaPagamentoQuitacao] = useState<string>('dinheiro')

  const filtered = clientes.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()))

  function openNew() { setForm(EMPTY); setEditId(null); setModal(true) }
  function openEdit(c: Cliente) { setForm(c); setEditId(c.id); setModal(true) }

  function salvar() {
    const f = form as Cliente
    if (!f.nome) { toast('Nome obrigatório', 'warning'); return }
    if (editId) {
      const ex = clientes.find(x => x.id === editId)!
      updateCliente({ ...f, id: editId, saldo: ex.saldo, compras: ex.compras, ultimaCobranca: ex.ultimaCobranca })
      toast('Cliente atualizado')
    } else {
      addCliente(f)
      toast('Cliente cadastrado')
    }
    setModal(false)
  }

  function excluir(id: string) {
    if (!confirm('Excluir cliente?')) return
    deleteCliente(id); toast('Excluído', 'warning')
  }

  function abrirQuitacao(c: Cliente) {
    setQuitarModal(c)
    setValorQuitacao(c.saldo.toFixed(2))
    setFormaPagamentoQuitacao('dinheiro')
  }

  function confirmarQuitacao() {
    if (!quitarModal) return
    const valor = parseFloat(valorQuitacao)
    if (!valor || valor <= 0) {
      toast('Informe um valor válido para quitação', 'warning')
      return
    }
    if (valor > quitarModal.saldo) {
      toast('Valor informado maior que o saldo devedor', 'warning')
      return
    }

    quitarFiado(quitarModal.id, valor, formaPagamentoQuitacao)
    toast(`Débito quitado! ${fmtR(valor)} lançado no caixa e vendas.`, 'success')
    setQuitarModal(null)
  }

  const pctSaldo = (c: Cliente) => c.limite > 0 ? (c.saldo / c.limite) * 100 : 0

  // Verifica se o cliente está devendo há pelo menos 7 dias
  function podeCobrar(c: Cliente) {
    if (c.saldo <= 0) return false

    // Se já foi cobrado nos últimos 7 dias, esconde
    if (c.ultimaCobranca) {
      const seteDiasAtras = cortarData(7)
      if (seteDiasAtras && c.ultimaCobranca > seteDiasAtras) {
        return false
      }
    }

    // Busca vendas fiadas do cliente
    const vendasFiado = vendas.filter(v => v.clienteId === c.id && v.pagamento === 'fiado')
    if (vendasFiado.length === 0) return true // Tem saldo manual sem vendas associadas

    // Pega a mais antiga
    const vendaAntiga = [...vendasFiado].sort((a, b) => a.data.localeCompare(b.data))[0]
    const seteDiasAtras = cortarData(7)

    return !seteDiasAtras || vendaAntiga.data <= seteDiasAtras
  }

  function cobrarWhatsApp(c: Cliente) {
    const foneLimpo = (c.telefone || '').replace(/\D/g, '')
    const msg = `olá, acabamos de ver que você ficou devendo ${fmtR(c.saldo)} valor, quando você conseguiria pagar?`
    
    // Atualiza flag/data da última cobrança
    updateCliente({
      ...c,
      ultimaCobranca: hoje(),
    })

    toast(`Cobrança registrada para ${c.nome}!`)

    const url = foneLimpo
      ? `https://api.whatsapp.com/send?phone=55${foneLimpo}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
    
    window.open(url, '_blank')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Clientes</h2>
        <button onClick={openNew} className="ml-auto flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <Plus size={14} /> Novo Cliente
        </button>
      </div>

      <div className="card-adega p-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-background text-sm"
            placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="card-adega overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl-adega">
            <thead><tr>
              <th>Nome</th><th>Telefone</th><th>Limite</th><th>Fiado</th><th>Compras</th><th>Uso Crédito</th><th>Cobrança</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum cliente cadastrado</td></tr>
              ) : filtered.map(c => {
                const pct = pctSaldo(c)
                const exibirBotaoCobrar = podeCobrar(c)
                const cobradoRecente = c.saldo > 0 && !exibirBotaoCobrar && c.ultimaCobranca

                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.nome}</td>
                    <td className="text-muted-foreground">{c.telefone || '—'}</td>
                    <td>{fmtR(c.limite)}</td>
                    <td className={pct > 90 ? 'text-destructive font-semibold' : ''}>{fmtR(c.saldo)}</td>
                    <td>{c.compras}</td>
                    <td className="w-32">
                      <div className="prog-bar-wrap">
                        <div className="prog-bar" style={{ width: `${Math.min(100, pct)}%`, background: pct > 90 ? 'hsl(var(--destructive))' : pct > 60 ? 'hsl(var(--warning))' : 'hsl(var(--success))' }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                    </td>
                    <td>
                      {exibirBotaoCobrar ? (
                        <button
                          onClick={() => cobrarWhatsApp(c)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition active:scale-95 cursor-pointer shadow-sm whitespace-nowrap"
                          title="Enviar mensagem de cobrança no WhatsApp"
                        >
                          <MessageCircle size={13} /> Cobrar valor
                        </button>
                      ) : cobradoRecente ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded" title={`Cobrado em: ${c.ultimaCobranca}`}>
                          <Check size={11} className="text-emerald-500" /> Cobrado recentemente
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="flex gap-1">
                      {c.saldo > 0 && (
                        <button
                          onClick={() => abrirQuitacao(c)}
                          className="p-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Quitar fiado/débito"
                        >
                          <DollarSign size={15} />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-muted" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => excluir(c.id)} className="p-1 rounded text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-adega w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{editId ? 'Editar' : 'Novo'} Cliente</h3>
              <button onClick={() => setModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              {([['Nome *', 'nome', 'text'], ['Telefone', 'telefone', 'text'], ['Limite (R$)', 'limite', 'number']] as [string, keyof Omit<Cliente, 'id'>, string][]).map(([label, key, type]) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
                  <input type={type} step={type === 'number' ? '0.01' : undefined}
                    className="w-full p-2 border border-border rounded-lg bg-background"
                    value={(form as Record<string, unknown>)[key] as string || ''}
                    onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} />
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

      {/* Modal Quitar Débito */}
      {quitarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-adega w-full max-w-md p-6 bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Quitar Débito (Fiado)</h3>
                <p className="text-xs text-muted-foreground">Cliente: {quitarModal.nome}</p>
              </div>
              <button onClick={() => setQuitarModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="flex flex-col gap-4 text-sm">
              <div className="p-3 bg-muted/40 rounded-xl flex justify-between items-center">
                <span className="text-xs text-muted-foreground uppercase font-medium">Saldo Devedor Total:</span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">{fmtR(quitarModal.saldo)}</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Valor a Quitar (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={quitarModal.saldo}
                  className="w-full p-2.5 border border-border rounded-xl bg-background font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
                  value={valorQuitacao}
                  onChange={e => setValorQuitacao(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Forma de Recebimento *
                </label>
                <select
                  className="w-full p-2.5 border border-border rounded-xl bg-background text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
                  value={formaPagamentoQuitacao}
                  onChange={e => setFormaPagamentoQuitacao(e.target.value)}
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao_debito">Cartão Débito</option>
                  <option value="cartao_credito">Cartão Crédito</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
              <button
                onClick={() => setQuitarModal(null)}
                className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarQuitacao}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition active:scale-95 shadow-md shadow-emerald-600/20"
              >
                Confirmar Recebimento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
