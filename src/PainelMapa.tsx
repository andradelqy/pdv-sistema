import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { CircleAlert, Clock3, LocateFixed, MapPinned, Radio } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import { carregarConfigEntrega } from './lib/sync'
import { agruparRotasPorEntrega, entregaEstaAtrasada } from './lib/delivery'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({ html: `<div style="font-size:28px">🛵</div>`, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
type EntregadorLocation = { entregador_id: string; entregador_nome: string; lat: number; lng: number; atualizado_em: string }
type Ponto = { entregador_id: string; entrega_id: string; lat: number; lng: number; precisao_m?: number; criado_em: string }

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
  const [centerPosition, setCenterPosition] = useState<[number, number]>([-23.5505, -46.6333])
  const [filtroEntrega, setFiltroEntrega] = useState('')

  useEffect(() => {
    void carregarConfigEntrega(lojaId).then(config => {
      if (config.latitudeOrigem != null && config.longitudeOrigem != null) setCenterPosition([config.latitudeOrigem, config.longitudeOrigem])
    }).catch(() => undefined)
  }, [lojaId])

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      const desde = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const [{ data: locais, error: locaisError }, { data: historico, error: historicoError }] = await Promise.all([
        supabase.from('rastreio_entregadores').select('entregador_id, entregador_nome, lat, lng, atualizado_em').eq('loja_id', lojaId).order('atualizado_em', { ascending: false }),
        supabase.from('rastreio_pontos').select('entregador_id, entrega_id, lat, lng, precisao_m, criado_em').eq('loja_id', lojaId).gte('criado_em', desde).order('criado_em', { ascending: true }).limit(2000),
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
  const rotasPorEntrega = useMemo(() => {
    return agruparRotasPorEntrega(pontos.map(ponto => ({
      entregadorId: ponto.entregador_id, entregaId: ponto.entrega_id,
      lat: Number(ponto.lat), lng: Number(ponto.lng), precisao: Number(ponto.precisao_m || 0), criadoEm: ponto.criado_em,
    })))
  }, [pontos])
  const rotasVisiveis = filtroEntrega ? rotasPorEntrega.filter(rota => rota.entregaId === filtroEntrega) : rotasPorEntrega
  const posicoes = ativos.map(item => [Number(item.lat), Number(item.lng)] as [number, number])
  const pedidoAtivo = (id: string) => entregas.find(e => e.entregadorId === id && e.status === 'em_rota')
  const atrasadas = entregas.filter(e => entregaEstaAtrasada(e.status, e.previsaoEntregaEm, agora))
  const entregasComRota = [...new Set(rotasPorEntrega.map(rota => rota.entregaId))]
  const cores = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444']

  return <div className="space-y-3">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="font-bold flex gap-2 items-center"><MapPinned /> Rastreamento de entregas</h2><p className="text-sm text-muted-foreground">Posições ao vivo e trajetos separados por pedido, com descarte de saltos imprecisos.</p></div><div className="flex items-center gap-3 text-xs">{realtimeAtivo ? <span className="text-emerald-600 flex gap-1"><Radio size={14} />Ao vivo</span> : <span className="text-amber-600 flex gap-1"><Clock3 size={14} />Atualização de segurança</span>}{atualizadoEm && <span className="text-muted-foreground">Consulta: {atualizadoEm.toLocaleTimeString('pt-BR')}</span>}</div></div>
    <div className="grid md:grid-cols-3 gap-3"><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Em rota com sinal</p><b className="text-xl text-emerald-600">{ativos.length}</b></div><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Posição desatualizada</p><b className="text-xl text-amber-600">{inativos.length}</b></div><div className="card-adega p-3"><p className="text-xs text-muted-foreground">Entregas em rota</p><b className="text-xl">{entregas.filter(e => e.status === 'em_rota').length}</b></div></div>
    <div className="flex items-center gap-2"><label className="text-xs font-semibold text-muted-foreground">TRAJETO</label><select value={filtroEntrega} onChange={e => setFiltroEntrega(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Todas as entregas recentes</option>{entregasComRota.map(id => <option key={id} value={id}>Pedido #{id.slice(-4)}</option>)}</select></div>
    {atrasadas.length > 0 && <div className="p-3 border border-rose-300 bg-rose-50 dark:bg-rose-950/20 rounded-lg text-sm flex gap-2 text-rose-800 dark:text-rose-200"><CircleAlert size={18} />{atrasadas.length} entrega{atrasadas.length > 1 ? 's' : ''} ultrapassou a previsão: {atrasadas.map(item => `#${item.id.slice(-4)}`).join(', ')}</div>}
    <div className="h-[65vh] border rounded-lg overflow-hidden"><MapContainer center={posicoes[0] ?? centerPosition} zoom={12} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" /><AjustarMapa posicoes={posicoes} />{ativos.map(ent => <Marker key={ent.entregador_id} position={[Number(ent.lat), Number(ent.lng)]} icon={motoIcon}><Popup><b>{ent.entregador_nome}</b><br />{pedidoAtivo(ent.entregador_id) ? `Em rota para ${pedidoAtivo(ent.entregador_id)?.clienteNome}` : 'Sem entrega em rota'}<br />Atualizado: {new Date(ent.atualizado_em).toLocaleTimeString('pt-BR')}</Popup></Marker>)}{rotasVisiveis.map((rota, index) => rota.pontos.length > 1 ? <Polyline key={rota.chave} positions={rota.pontos} color={cores[index % cores.length]} weight={4} opacity={0.78} /> : null)}</MapContainer></div>
    {inativos.length > 0 && <div className="p-3 border border-amber-300 rounded-lg text-sm flex gap-2 text-amber-800 dark:text-amber-200"><CircleAlert size={18} />{inativos.map(item => `${item.entregador_nome} sem atualização desde ${new Date(item.atualizado_em).toLocaleTimeString('pt-BR')}`).join(' · ')}</div>}
    {!ativos.length && <div className="text-sm text-muted-foreground flex gap-2"><LocateFixed size={17} />Nenhum entregador com GPS ativo nos últimos cinco minutos.</div>}
  </div>
}
