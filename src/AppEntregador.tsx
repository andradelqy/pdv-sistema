import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { CheckCircle2, MapPin, Navigation, PackageCheck, Play, XCircle } from 'lucide-react'
import { useStore } from './lib/store'
import * as sync from './lib/sync'
import { toast } from './lib/toast'
import { supabase } from './lib/supabase'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({ html: `<div style="font-size:28px">🛵</div>`, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })

function MapFollower({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], 16) }, [lat, lng, map])
  return null
}

export function AppEntregador() {
  const { entregas, updateStatusEntrega, currentUser, lojaId, setRole } = useStore()
  const [perfilErro, setPerfilErro] = useState<string | null>(null)
  const [perfilCarregando, setPerfilCarregando] = useState(!currentUser)
  const [rastreando, setRastreando] = useState(false)
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'desligado' | 'buscando' | 'ativo' | 'erro'>('desligado')
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<Date | null>(null)
  const [recebedor, setRecebedor] = useState('')
  const [codigo, setCodigo] = useState('')
  const [motivo, setMotivo] = useState('')
  const watchId = useRef<number | null>(null)
  const ultimaPublicacao = useRef(0)
  const ultimaPosicaoPublicada = useRef<[number, number] | null>(null)
  const entregaAtiva = entregas.find(e => e.entregadorId === currentUser?.id && e.status === 'em_rota')
  const entregaAtivaId = useRef<string | undefined>(undefined)
  useEffect(() => { entregaAtivaId.current = entregaAtiva?.id }, [entregaAtiva?.id])

  // A tela não depende exclusivamente da hidratação global: em uma recarga
  // direta, recupera o perfil autenticado e explica exatamente o que faltar.
  useEffect(() => {
    if (currentUser) { setPerfilCarregando(false); return }
    let ativo = true
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) {
        if (ativo) { setPerfilErro('Sessão não encontrada. Entre novamente no sistema.'); setPerfilCarregando(false) }
        return
      }
      const { data: perfil, error } = await supabase.from('perfis').select('role, loja_id, email').eq('id', auth.user.id).maybeSingle()
      if (!ativo) return
      if (error) setPerfilErro(`Supabase: ${error.message}`)
      else if (!perfil) setPerfilErro('Nenhum perfil visível para esta sessão. Verifique a política SELECT de public.perfis.')
      else if (!perfil.loja_id) setPerfilErro('Seu perfil não possui loja_id. Vincule esta conta à loja no Supabase.')
      else {
        setRole(perfil.role, perfil.loja_id, { id: auth.user.id, nome: perfil.email || auth.user.email || 'Entregador' })
        setPerfilErro(null)
      }
      setPerfilCarregando(false)
    })()
    return () => { ativo = false }
  }, [currentUser, setRole])

  const publicarLocalizacao = (lat: number, lng: number, precisao?: number) => {
    if (!currentUser || !entregaAtivaId.current) return
    const anterior = ultimaPosicaoPublicada.current
    const deslocamento = anterior ? Math.hypot((lat - anterior[0]) * 111_000, (lng - anterior[1]) * 85_000) : Infinity
    if (Date.now() - ultimaPublicacao.current < 10_000 && deslocamento < 25) return
    ultimaPublicacao.current = Date.now()
    ultimaPosicaoPublicada.current = [lat, lng]
    void sync.atualizarLocalizacaoEntregador({ entregadorId: currentUser.id, entregadorNome: currentUser.nome, entregaId: entregaAtivaId.current, lat, lng, precisao }, lojaId)
      .then(() => { setUltimaSincronizacao(new Date()); setGpsStatus('ativo') })
      .catch(() => { setGpsStatus('erro'); toast('Não foi possível sincronizar sua localização.', 'warning') })
  }
  const pararRastreamento = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setRastreando(false)
    setGpsStatus('desligado')
  }
  const iniciarRastreamento = () => {
    if (!navigator.geolocation) return toast('Este dispositivo não oferece GPS.', 'danger')
    setGpsStatus('buscando')
    watchId.current = navigator.geolocation.watchPosition(pos => {
      const next: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      setCurrentPos(next)
      publicarLocalizacao(next[0], next[1], pos.coords.accuracy)
    }, () => { setGpsStatus('erro'); toast('Permita o acesso à localização para iniciar a rota.', 'warning') }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 })
    setRastreando(true)
  }
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current) }, [])
  if (!currentUser) return <div className="max-w-md mx-auto p-5 rounded-xl border bg-card space-y-2"><b>{perfilCarregando ? 'Carregando seu perfil de entregador…' : 'Não foi possível abrir o App do Entregador'}</b>{perfilErro && <p className="text-sm text-rose-600">{perfilErro}</p>}</div>

  const disponiveis = entregas.filter(e => e.status === 'pendente')
  const minhas = entregas.filter(e => e.entregadorId === currentUser.id && ['aceito', 'em_rota', 'nao_entregue'].includes(e.status))
  const entregaEmRota = entregaAtiva

  return <div className="max-w-md mx-auto p-4 flex flex-col gap-4">
    <header><p className="text-sm text-muted-foreground">Entregador</p><h1 className="font-bold text-xl">Olá, {currentUser.nome}</h1></header>
    <div className="h-52 rounded-xl overflow-hidden bg-muted border">{currentPos ? <MapContainer center={currentPos} zoom={13} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={currentPos} icon={motoIcon} /><MapFollower lat={currentPos[0]} lng={currentPos[1]} /></MapContainer> : <div className="h-full flex items-center justify-center text-muted-foreground"><MapPin className="mr-2" />GPS desligado</div>}</div>
    {!rastreando ? <button onClick={iniciarRastreamento} className="w-full bg-emerald-600 text-white p-3 rounded-xl font-bold flex justify-center gap-2"><Navigation size={18} /> Iniciar rastreamento</button> : <button onClick={pararRastreamento} className="w-full bg-rose-600 text-white p-3 rounded-xl font-bold">Parar rastreamento</button>}
    <p className={`text-xs ${gpsStatus === 'ativo' ? 'text-emerald-600' : gpsStatus === 'erro' ? 'text-rose-600' : 'text-muted-foreground'}`}>GPS: {gpsStatus === 'ativo' ? `sincronizado${ultimaSincronizacao ? ` às ${ultimaSincronizacao.toLocaleTimeString('pt-BR')}` : ''}` : gpsStatus === 'buscando' ? 'buscando sinal…' : gpsStatus === 'erro' ? 'sem sincronização' : 'desligado'}</p>
    {entregaEmRota && <section className="p-4 border border-amber-300 rounded-xl bg-amber-50 dark:bg-amber-950/20 space-y-3"><div className="font-bold flex gap-2"><Navigation /> Em rota: {entregaEmRota.clienteNome}</div><p className="text-sm">{entregaEmRota.endereco}</p><input value={recebedor} onChange={e => setRecebedor(e.target.value)} placeholder="Nome de quem recebeu" className="w-full p-2 border rounded" /><input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código de confirmação (opcional)" className="w-full p-2 border rounded" /><button onClick={() => { if (!recebedor.trim()) return toast('Informe quem recebeu o pedido.', 'warning'); updateStatusEntrega(entregaEmRota.id, 'entregue', { recebedorNome: recebedor.trim(), codigoConfirmacao: codigo.trim() || undefined }); setRecebedor(''); setCodigo(''); toast('Entrega confirmada.', 'success') }} className="w-full bg-emerald-600 text-white p-3 rounded font-bold flex justify-center gap-2"><CheckCircle2 size={18} /> Confirmar entrega</button><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo caso não entregue" className="w-full p-2 border rounded" /><button onClick={() => { if (!motivo.trim()) return toast('Informe o motivo.', 'warning'); updateStatusEntrega(entregaEmRota.id, 'nao_entregue', { motivo }); setMotivo(''); toast('Ocorrência registrada; aguarde orientação da loja.', 'warning') }} className="w-full border border-rose-500 text-rose-600 p-2 rounded">Cliente ausente / não entregue</button></section>}
    <section className="space-y-3"><h2 className="font-bold uppercase text-sm text-muted-foreground">Minhas entregas</h2>{minhas.filter(e => e.status !== 'em_rota').map(e => <div key={e.id} className="p-4 border rounded-xl space-y-2"><b>#{e.id.slice(-4)} · {e.clienteNome}</b><p className="text-sm">{e.endereco}</p>{e.status === 'aceito' && <button onClick={() => { updateStatusEntrega(e.id, 'em_rota'); if (!rastreando) iniciarRastreamento() }} className="w-full bg-amber-500 text-white p-2 rounded flex justify-center gap-2"><Play size={17} /> Iniciar rota</button>}{e.status === 'nao_entregue' && <span className="text-sm text-rose-600">Ocorrência: {e.naoEntregueMotivo}</span>}</div>)}</section>
    {!minhas.length && <section className="space-y-3"><h2 className="font-bold uppercase text-sm text-muted-foreground">Pedidos disponíveis</h2>{disponiveis.map(e => <div key={e.id} className="p-4 border rounded-xl"><b>#{e.id.slice(-4)} · {e.clienteNome}</b><p className="text-sm my-2">{e.endereco}</p><button onClick={() => { updateStatusEntrega(e.id, 'aceito', { entregador: currentUser }); toast('Pedido aceito.', 'success') }} className="w-full bg-amber-500 text-white p-2 rounded flex justify-center gap-2"><PackageCheck size={17} /> Aceitar entrega</button></div>)}</section>}
    {!disponiveis.length && !minhas.length && <div className="text-center p-6 text-muted-foreground"><XCircle className="mx-auto mb-2" />Nenhum pedido disponível.</div>}
  </div>
}
