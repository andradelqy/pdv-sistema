import { useEffect, useState } from 'react'
import { Camera, CheckCircle2, Clock3, Copy, ExternalLink, KeyRound, MapPin, PackageCheck, X } from 'lucide-react'
import { fmtR, type PedidoEntrega } from '../lib/store'
import { listarEventosEntrega, obterCodigoClienteEntrega, urlComprovanteEntrega, type EntregaEvento } from '../lib/sync'
import { toast } from '../lib/toast'

const nomes: Record<string, string> = {
  criada: 'Pedido criado e estoque reservado',
  aceita: 'Pedido aceito',
  em_rota: 'Rota iniciada',
  entregue: 'Entrega confirmada',
  nao_entregue: 'Tentativa sem sucesso',
  cancelada: 'Pedido cancelado',
}

export function DeliveryDetailsDialog({ entrega, onClose }: { entrega: PedidoEntrega; onClose: () => void }) {
  const [eventos, setEventos] = useState<EntregaEvento[]>([])
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [codigoCliente, setCodigoCliente] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let ativo = true
    void listarEventosEntrega(entrega.id)
      .then(valor => { if (ativo) setEventos(valor) })
      .catch(error => toast(error instanceof Error ? error.message : 'Falha ao carregar histórico.', 'danger'))
    void obterCodigoClienteEntrega(entrega.id)
      .then(valor => { if (ativo) setCodigoCliente(valor) })
      .catch(error => {
        if (ativo) setCodigoCliente(null)
        toast(error instanceof Error ? error.message : 'Falha ao carregar o código do cliente.', 'danger')
      })
    if (entrega.comprovanteFotoUrl) {
      void urlComprovanteEntrega(entrega.comprovanteFotoUrl).then(valor => { if (ativo) setFotoUrl(valor) }).catch(() => undefined)
    }
    return () => { ativo = false }
  }, [entrega.id, entrega.comprovanteFotoUrl])

  const link = entrega.trackingToken ? `${window.location.origin}/acompanhar/${entrega.trackingToken}` : null
  const copiarAcesso = () => {
    if (!link) return
    const mensagem = codigoCliente
      ? `Acompanhe seu pedido: ${link}\nCódigo de recebimento: ${codigoCliente}`
      : link
    void navigator.clipboard.writeText(mensagem)
    toast(codigoCliente ? 'Link e código copiados.' : 'Link de acompanhamento copiado.', 'success')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Detalhes da entrega">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-card p-5">
          <div>
            <p className="text-xs text-muted-foreground">ENTREGA #{entrega.id.slice(-4)}</p>
            <h2 className="text-xl font-bold">{entrega.clienteNome}</h2>
            <p className="text-sm text-muted-foreground">{entrega.endereco}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-bold"><PackageCheck size={18} /> Pedido</h3>
            <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
              <div className="flex justify-between"><span>Status</span><b className="capitalize">{entrega.status.replaceAll('_', ' ')}</b></div>
              <div className="flex justify-between"><span>Pagamento</span><b>{entrega.pagamento}</b></div>
              <div className="flex justify-between"><span>Total</span><b>{fmtR(entrega.total)}</b></div>
              <div className="border-t pt-2">
                {entrega.itens.map(item => <div key={item.produtoId} className="flex justify-between text-xs"><span>{item.produtoNome || 'Produto'}</span><b>{item.quantidade} un.</b></div>)}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><KeyRound size={15} className="text-cyan-600" /> Código do cliente</p>
              {codigoCliente === undefined
                ? <p className="mt-2 text-sm text-muted-foreground">Carregando código…</p>
                : codigoCliente
                  ? <p className="mt-2 font-mono text-3xl font-black tracking-[0.35em] text-cyan-700 dark:text-cyan-300">{codigoCliente}</p>
                  : <p className="mt-2 text-sm text-muted-foreground">Código indisponível para esta entrega.</p>}
              <p className="mt-2 text-xs text-muted-foreground">O cliente informa este código ao responsável no recebimento.</p>
            </div>

            {link && <button type="button" onClick={copiarAcesso} className="flex w-full items-center justify-center gap-2 rounded-lg border p-2 text-sm"><Copy size={15} /> {codigoCliente ? 'Copiar link e PIN' : 'Copiar link do cliente'}</button>}
            {link && <a href={link} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg border p-2 text-sm"><ExternalLink size={15} /> Abrir acompanhamento</a>}

            {entrega.recebedorNome && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/20">
                <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={17} /> Recebido por {entrega.recebedorNome}</p>
                {entrega.comprovanteLat != null && <p className="mt-1 flex items-center gap-1 text-xs"><MapPin size={13} /> {entrega.comprovanteLat.toFixed(5)}, {entrega.comprovanteLng?.toFixed(5)} · precisão {Math.round(entrega.comprovantePrecisao || 0)} m</p>}
              </div>
            )}
            {fotoUrl && <a href={fotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border"><img src={fotoUrl} alt="Comprovante da entrega" className="max-h-64 w-full object-cover" /><span className="flex items-center justify-center gap-2 p-2 text-xs"><Camera size={14} /> Abrir comprovante</span></a>}
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-bold"><Clock3 size={18} /> Linha do tempo auditável</h3>
            <div className="space-y-0">
              {eventos.length ? eventos.map((evento, index) => (
                <div key={evento.id} className="flex gap-3">
                  <div className="flex flex-col items-center"><div className="mt-0.5 h-3 w-3 rounded-full bg-primary" />{index < eventos.length - 1 && <div className="h-12 w-px bg-border" />}</div>
                  <div className="pb-4"><p className="text-sm font-semibold">{nomes[evento.tipo] || evento.tipo.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{new Date(evento.criadoEm).toLocaleString('pt-BR')}</p>{typeof evento.detalhe.motivo === 'string' && <p className="mt-1 text-xs text-rose-600">{evento.detalhe.motivo}</p>}</div>
                </div>
              )) : <p className="text-sm text-muted-foreground">Carregando eventos…</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
