import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { CheckCircle2, Clock3, MapPin, PackageCheck, Route, ShieldCheck, Truck } from 'lucide-react'
import { acompanharEntregaPublica } from '../lib/sync'
import 'leaflet/dist/leaflet.css'

type Acompanhamento = {
  id: string
  loja: string
  status: 'pendente' | 'aceito' | 'em_rota' | 'entregue' | 'cancelado' | 'nao_entregue'
  criado_em: string
  aceito_em?: string
  em_rota_em?: string
  entregue_em?: string
  previsao_entrega_em?: string
  entregador?: string
  lat?: number
  lng?: number
  localizacao_atualizada_em?: string
}

const motoIcon = L.divIcon({ html: '<div style="font-size:34px">🛵</div>', className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
const ordem = ['pendente', 'aceito', 'em_rota', 'entregue']
const rotulos: Record<string, string> = { pendente: 'Pedido confirmado', aceito: 'Entregador a caminho da loja', em_rota: 'Saiu para entrega', entregue: 'Pedido entregue', cancelado: 'Pedido cancelado', nao_entregue: 'Tentativa sem sucesso' }

export function AcompanharEntrega() {
  const { token = '' } = useParams()
  const [dados, setDados] = useState<Acompanhamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      try {
        const resposta = await acompanharEntregaPublica(token) as unknown as Acompanhamento
        if (ativo) { setDados(resposta); setErro(null) }
      } catch (error) {
        if (ativo) setErro(error instanceof Error ? error.message : 'Não foi possível acompanhar o pedido.')
      } finally { if (ativo) setCarregando(false) }
    }
    void carregar()
    const timer = window.setInterval(() => void carregar(), 15_000)
    return () => { ativo = false; window.clearInterval(timer) }
  }, [token])

  if (carregando) return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><Truck className="mx-auto mb-3 animate-bounce text-cyan-400" /><p>Localizando seu pedido…</p></div></div>
  if (erro || !dados) return <div className="grid min-h-screen place-items-center bg-slate-950 p-5 text-white"><div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-7 text-center"><ShieldCheck className="mx-auto mb-3 text-cyan-400" /><h1 className="text-xl font-bold">Link de acompanhamento inválido</h1><p className="mt-2 text-sm text-slate-400">{erro}</p></div></div>

  const atual = ordem.indexOf(dados.status)
  const posicao = dados.lat != null && dados.lng != null ? [Number(dados.lat), Number(dados.lng)] as [number, number] : null
  const finalizada = dados.status === 'entregue'
  const problema = dados.status === 'cancelado' || dados.status === 'nao_entregue'

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center justify-between"><div><p className="text-sm text-cyan-400">Órbita · {dados.loja}</p><h1 className="text-2xl font-black">Pedido #{dados.id}</h1></div><div className={`rounded-full px-3 py-1.5 text-xs font-bold ${finalizada ? 'bg-emerald-500/20 text-emerald-300' : problema ? 'bg-rose-500/20 text-rose-300' : 'bg-cyan-500/20 text-cyan-300'}`}>{rotulos[dados.status]}</div></header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
        <div className="mb-5 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-300">{finalizada ? <CheckCircle2 /> : dados.status === 'em_rota' ? <Route /> : <PackageCheck />}</div><div><h2 className="font-bold">{rotulos[dados.status]}</h2>{dados.previsao_entrega_em && !finalizada && <p className="flex items-center gap-1 text-sm text-slate-400"><Clock3 size={14} /> Previsão até {new Date(dados.previsao_entrega_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}</div></div>
        <div className="space-y-0">{ordem.map((status, index) => { const concluida = atual >= index || finalizada; return <div key={status} className="flex gap-3"><div className="flex flex-col items-center"><div className={`grid h-7 w-7 place-items-center rounded-full border text-xs ${concluida ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-600 text-slate-500'}`}>{concluida ? '✓' : index + 1}</div>{index < ordem.length - 1 && <div className={`h-8 w-px ${atual > index ? 'bg-cyan-400' : 'bg-slate-700'}`} />}</div><p className={`pt-1 text-sm ${concluida ? 'font-semibold' : 'text-slate-500'}`}>{rotulos[status]}</p></div> })}</div>
      </section>

      {posicao && <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"><div className="flex items-center justify-between p-4"><div><h2 className="font-bold">Localização do entregador</h2><p className="text-xs text-slate-400">{dados.entregador ? `${dados.entregador} · ` : ''}{dados.localizacao_atualizada_em ? `Atualizado às ${new Date(dados.localizacao_atualizada_em).toLocaleTimeString('pt-BR')}` : 'Atualizando…'}</p></div><MapPin className="text-cyan-400" /></div><div className="h-72"><MapContainer center={posicao} zoom={15} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" /><Marker position={posicao} icon={motoIcon} /></MapContainer></div></section>}
      {!posicao && dados.status !== 'entregue' && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-400">O mapa aparece quando o pedido sair para entrega.</div>}
      <p className="text-center text-xs text-slate-500">A página atualiza automaticamente a cada 15 segundos. Nenhum dado financeiro ou telefone é exibido.</p>
    </div>
  </main>
}
