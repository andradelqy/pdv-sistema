import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { CircleAlert, Clock3, LocateFixed, MapPinned, Radio } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({ html: `<div style="font-size:28px">🛵</div>`, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
type EntregadorLocation = { entregador_id: string; entregador_nome: string; lat: number; lng: number; atualizado_em: string }
type Ponto = { entregador_id: string; entrega_id: string; lat: number; lng: number; criado_em: string }

function AjustarMapa({ posicoes }: { posicoes: [number, number][] }) {
  const map = useMap()
  useEffect(() => { if (posicoes.length) map.fitBounds(L.latLngBounds(posicoes), { padding: [35, 35], maxZoom: 15 }) }, [map, posicoes])
  return null
}

export function PainelMapa() {
  const { lojaId, entregas } = useStore()
  const [entregadores, setEntregadores] = useState<EntregadorLocation[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [realtimeAtivo, setRealtimeAtivo] = useState(false)
  const centerPosition: [number, number] = [-23.5505, -46.6333]

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      const desde = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const [{ data: locais, error: locaisError }, { data: historico, error: historicoError }] = await Promise.all([
        supabase.from('rastreio_entregadores').select('entregador_id, entregador_nome, lat, lng, atualizado_em').eq('loja_id', lojaId).order('atualizado_em', { ascending: false }),
        supabase.from('rastreio_pontos').select('entregador_id, entrega_id, lat, lng, criado_em').eq('loja_id', lojaId).gte('criado_em', desde).order('criado_em', { ascending: true }).limit(1000),
      ])
      if (ativo && !locaisError) { setEntregadores((locais ?? []) as EntregadorLocation[]); setAtualizadoEm(new Date()) }
      if (ativo && !historicoError) setPontos((historico ?? []) as Ponto[])
    }
    const aplicarLocal = (row: EntregadorLocation) => {
      if (row && row.atualizado_em && ativo) setEntregadores(atual => [row, ...atual.filter(item => item.entregador_id !== row.entregador_id)])
    }
    void carregar()
    const channel = supabase.channel(`rastreio-loja-${lojaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rastreio_entregadores', filter: `loja_id=eq.${lojaId}` }, payload => {
        if (payload.eventType !== 'DELETE') aplicarLocal(payload.new as EntregadorLocation)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rastreio_pontos', filter: `loja_id=eq.${lojaId}` }, payload => {
        if (ativo) setPontos(atual => [...atual.slice(-999), payload.new as Ponto])
      })
      .subscribe(status => setRealtimeAtivo(status === 'SUBSCRIBED'))
    const timer = window.setInterval(() => void carregar(), 20_000)
    return () => { ativo = false; window.clearInterval(timer); void supabase.removeChannel(channel) }
  }, [lojaId])

  const agora = Date.now()
  const ativos = entregadores.filter(item => agora - new Date(item.atualizado_em).getTime() <= 5 * 60_000)
  const inativos = entregadores.filter(item => !ativos.includes(item))
  const rotaPorEntregador = useMemo(() => pontos.reduce<Record<string, [number, number][]>>((rotas, ponto) => ({ ...rotas, [ponto.entregador_id]: [...(rotas[ponto.entregador_id] ?? []), [Number(ponto.lat), Number(ponto.lng)]] }), {}), [pontos])
  const posicoes = ativos.map(item => [Number(item.lat), Number(item.lng)] as [number, number])
  const pedidoAtivo = (id: string) => entregas.find(e => e.entregadorId === id && e.status === 'em_rota')

  return <div className="space-y-3">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="font-bold flex gap-2 items-center"><MapPinned /> Rastreamento de entregas</h2><p className="text-sm text-muted-foreground">Posições ao vivo com histórico das últimas quatro horas.</p></div><div className="flex items-center gap-3 text-xs">{realtimeAtivo ? <span className="text-emerald-600 flex gap-1"><Radio size={14} />Ao vivo</span> : <span className="text-amber-600 flex gap-1"><Clock3 size={14} />Atualização de segurança</span>}{atualizadoEm && <span className="text-muted-foreground">Consulta: {atualizadoEm.toLocaleTimeString('pt-BR')}</span>}</div></div>
    <div className="grid md:grid-cols-3 gap-3"><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Em rota com sinal</p><b className="text-xl text-emerald-600">{ativos.length}</b></div><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Posição desatualizada</p><b className="text-xl text-amber-600">{inativos.length}</b></div><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Entregas em rota</p><b className="text-xl">{entregas.filter(e => e.status === 'em_rota').length}</b></div></div>
    <div className="h-[65vh] border rounded-lg overflow-hidden"><MapContainer center={posicoes[0] ?? centerPosition} zoom={12} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><AjustarMapa posicoes={posicoes} />{ativos.map(ent => <Marker key={ent.entregador_id} position={[Number(ent.lat), Number(ent.lng)]} icon={motoIcon}><Popup><b>{ent.entregador_nome}</b><br />{pedidoAtivo(ent.entregador_id) ? `Em rota para ${pedidoAtivo(ent.entregador_id)?.clienteNome}` : 'Sem entrega em rota'}<br />Atualizado: {new Date(ent.atualizado_em).toLocaleTimeString('pt-BR')}</Popup></Marker>)}{Object.entries(rotaPorEntregador).map(([id, rota]) => rota.length > 1 ? <Polyline key={id} positions={rota} color="#f59e0b" weight={4} opacity={0.75} /> : null)}</MapContainer></div>
    {inativos.length > 0 && <div className="p-3 border border-amber-300 rounded-lg text-sm flex gap-2 text-amber-800 dark:text-amber-200"><CircleAlert size={18} />{inativos.map(item => `${item.entregador_nome} sem atualização desde ${new Date(item.atualizado_em).toLocaleTimeString('pt-BR')}`).join(' · ')}</div>}
    {!ativos.length && <div className="text-sm text-muted-foreground flex gap-2"><LocateFixed size={17} />Nenhum entregador com GPS ativo nos últimos cinco minutos.</div>}
  </div>
}
