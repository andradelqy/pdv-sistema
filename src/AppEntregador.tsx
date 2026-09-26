import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  AlertTriangle, Camera, CheckCircle2, Clock3, MapPin, MessageCircle,
  Navigation, PackageCheck, Phone, Play, RefreshCw, Route, ShieldCheck, XCircle,
} from 'lucide-react'
import { fmtR, useStore, type PedidoEntrega } from './lib/store'
import * as sync from './lib/sync'
import { podeOperarEntrega, validarComprovanteEntrega } from './lib/delivery'
import { toast } from './lib/toast'
import { supabase } from './lib/supabase'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({ html: '<div style="font-size:28px">🛵</div>', className: '', iconSize: [32, 32], iconAnchor: [16, 16] })

function MapFollower({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], 16) }, [lat, lng, map])
  return null
}

function telefoneNumerico(value?: string) {
  const digits = (value || '').replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function abrirNavegacao(entrega: PedidoEntrega, app: 'google' | 'waze') {
  const destino = entrega.lat != null && entrega.lng != null ? `${entrega.lat},${entrega.lng}` : entrega.endereco
  const url = app === 'waze'
    ? `https://waze.com/ul?q=${encodeURIComponent(destino)}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

function EtapasEntrega({ entrega }: { entrega: PedidoEntrega }) {
  const etapas = [
    { label: 'Aceita', data: entrega.aceitoEm },
    { label: 'Em rota', data: entrega.emRotaEm },
    { label: 'Entregue', data: entrega.entregueEm },
  ]
  return <div className="grid grid-cols-3 gap-2">
    {etapas.map((etapa, index) => <div key={etapa.label} className="text-center">
      <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${etapa.data ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>{etapa.data ? '✓' : index + 1}</div>
      <p className="mt-1 text-[11px] font-semibold">{etapa.label}</p>
      {etapa.data && <p className="text-[10px] text-muted-foreground">{new Date(etapa.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
    </div>)}
  </div>
}

export function AppEntregador() {
  const { entregas, updateStatusEntrega, sincronizarEntregas, currentUser, currentRole, lojaId, setRole } = useStore()
  const [perfilErro, setPerfilErro] = useState<string | null>(null)
  const [perfilCarregando, setPerfilCarregando] = useState(!currentUser)
  const [rastreando, setRastreando] = useState(false)
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number; precisao: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'desligado' | 'buscando' | 'ativo' | 'offline' | 'erro'>('desligado')
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<Date | null>(null)
  const [recebedor, setRecebedor] = useState('')
  const [codigo, setCodigo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [config, setConfig] = useState<sync.ConfigEntrega | null>(null)
  const watchId = useRef<number | null>(null)
  const ultimaPublicacao = useRef(0)
  const ultimaPosicaoPublicada = useRef<[number, number] | null>(null)

  const disponiveis = useMemo(() => entregas.filter(e => e.status === 'pendente'), [entregas])
  const minhas = useMemo(() => entregas.filter(e => e.entregadorId === currentUser?.id && ['aceito', 'em_rota', 'nao_entregue'].includes(e.status)), [entregas, currentUser?.id])
  const entregaEmRota = minhas.find(e => e.status === 'em_rota')
  const entregaEmRotaId = entregaEmRota?.id
  const currentUserId = currentUser?.id

  useEffect(() => {
    if (currentUser) { setPerfilCarregando(false); return }
    let ativo = true
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) {
        if (ativo) { setPerfilErro('Sessão não encontrada. Entre novamente no sistema.'); setPerfilCarregando(false) }
        return
      }
      const { data: perfil, error } = await supabase.from('perfis').select('role,loja_id,email,nome').eq('id', auth.user.id).maybeSingle()
      if (!ativo) return
      if (error) setPerfilErro(`Supabase: ${error.message}`)
      else if (!perfil) setPerfilErro('Nenhum perfil visível para esta sessão.')
      else if (!podeOperarEntrega(perfil.role)) setPerfilErro('Esta conta não possui permissão para operar entregas.')
      else if (!perfil.loja_id) setPerfilErro('Seu perfil não possui loja vinculada.')
      else {
        setRole(perfil.role, perfil.loja_id, { id: auth.user.id, nome: perfil.nome || perfil.email || auth.user.email || 'Responsável' })
        setPerfilErro(null)
      }
      setPerfilCarregando(false)
    })()
    return () => { ativo = false }
  }, [currentUser, setRole])

  useEffect(() => {
    if (!lojaId || !currentUser) return
    void sync.carregarConfigEntrega(lojaId).then(setConfig).catch(() => undefined)
    const atualizar = () => void sincronizarEntregas().catch(() => undefined)
    atualizar()
    const timer = window.setInterval(atualizar, 10_000)
    window.addEventListener('focus', atualizar)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', atualizar) }
  }, [lojaId, currentUser, sincronizarEntregas])

  // O GPS nasce e morre junto com a rota. Pontos que falham entram na fila
  // idempotente existente e são reenviados na reconexão.
  useEffect(() => {
    if (!entregaEmRotaId || !currentUserId || !navigator.geolocation) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      setRastreando(false)
      setGpsStatus(entregaEmRotaId ? 'erro' : 'desligado')
      return
    }
    setGpsStatus('buscando')
    setRastreando(true)
    watchId.current = navigator.geolocation.watchPosition(position => {
      const { latitude: lat, longitude: lng, accuracy: precisao } = position.coords
      setCurrentPos({ lat, lng, precisao })
      if (precisao > Math.max(config?.precisaoMaximaM || 150, 250)) {
        setGpsStatus('erro')
        return
      }
      const anterior = ultimaPosicaoPublicada.current
      const deslocamento = anterior ? Math.hypot((lat - anterior[0]) * 111_000, (lng - anterior[1]) * 85_000) : Infinity
      if (Date.now() - ultimaPublicacao.current < 10_000 && deslocamento < 25) return
      ultimaPublicacao.current = Date.now()
      ultimaPosicaoPublicada.current = [lat, lng]
      const localizacao: sync.LocalizacaoEntrega = { id: crypto.randomUUID(), entregaId: entregaEmRotaId, lat, lng, precisao }
      void sync.atualizarLocalizacaoEntregador(localizacao, lojaId)
        .then(() => { setUltimaSincronizacao(new Date()); setGpsStatus('ativo') })
        .catch(error => {
          sync.enfileirarSync('atualizarLocalizacaoEntregador', [localizacao, lojaId], error)
          setGpsStatus(navigator.onLine ? 'erro' : 'offline')
        })
    }, error => {
      setGpsStatus('erro')
      if (error.code === error.PERMISSION_DENIED) toast('Permita o acesso à localização para realizar a rota.', 'warning')
    }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 })
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      setRastreando(false)
    }
  }, [entregaEmRotaId, currentUserId, lojaId, config?.precisaoMaximaM])

  const executarStatus = async (entrega: PedidoEntrega, status: PedidoEntrega['status'], details: sync.EntregaTransitionDetails = {}) => {
    setProcessando(entrega.id)
    try {
      await updateStatusEntrega(entrega.id, status, details)
      await sincronizarEntregas()
      toast(status === 'aceito' ? 'Entrega atribuída a você.' : status === 'em_rota' ? 'Rota iniciada e GPS ativado.' : 'Ocorrência registrada.', status === 'nao_entregue' ? 'warning' : 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível atualizar a entrega.', 'danger')
    } finally { setProcessando(null) }
  }

  const concluirEntrega = async (entrega: PedidoEntrega) => {
    const erroProva = validarComprovanteEntrega({
      exigirPin: config?.exigirPin !== false, exigirLocalizacao: config?.exigirLocalizacao !== false,
      exigirFoto: Boolean(config?.exigirFoto), precisaoMaximaM: config?.precisaoMaximaM || 150,
    }, { recebedor, pin: codigo, lat: currentPos?.lat, lng: currentPos?.lng, precisao: currentPos?.precisao, temFoto: Boolean(foto) })
    if (erroProva) return toast(erroProva, 'warning')
    setProcessando(entrega.id)
    let fotoPath: string | undefined
    try {
      fotoPath = foto ? await sync.uploadComprovanteEntrega(foto, lojaId, entrega.id) : undefined
      await updateStatusEntrega(entrega.id, 'entregue', {
        recebedorNome: recebedor.trim(), codigoConfirmacao: codigo,
        comprovanteFotoUrl: fotoPath, lat: currentPos?.lat, lng: currentPos?.lng, precisao: currentPos?.precisao,
      })
      setRecebedor(''); setCodigo(''); setFoto(null)
      await sincronizarEntregas()
      toast('Entrega confirmada com comprovante e auditoria.', 'success')
    } catch (error) {
      if (fotoPath) void sync.removerComprovanteEntrega(fotoPath).catch(() => undefined)
      toast(error instanceof Error ? error.message : 'Não foi possível concluir a entrega.', 'danger')
    } finally { setProcessando(null) }
  }

  if (!currentUser) return <div className="mx-auto max-w-md rounded-xl border bg-card p-5 space-y-2"><b>{perfilCarregando ? 'Carregando seu perfil operacional…' : 'Não foi possível abrir o App do Entregador'}</b>{perfilErro && <p className="text-sm text-rose-600">{perfilErro}</p>}</div>
  if (!podeOperarEntrega(currentRole)) return <div className="mx-auto max-w-md rounded-xl border bg-card p-5 space-y-2"><b>Conta sem permissão operacional</b><p className="text-sm text-muted-foreground">Somente owner, gerente ou entregador podem assumir entregas. Use a tela de Entregas para acompanhar a operação.</p></div>

  return <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-12">
    <header className="flex items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">Operação de entrega</p>{currentRole !== 'entregador' && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Gestão em operação</span>}</div><h1 className="text-2xl font-bold">Olá, {currentUser.nome.split(' ')[0]}</h1>{currentRole !== 'entregador' && <p className="mt-1 text-xs text-muted-foreground">Ao aceitar, você será registrado como responsável por esta entrega.</p>}</div><button onClick={() => void sincronizarEntregas()} className="rounded-xl border p-3 hover:bg-muted" aria-label="Atualizar pedidos"><RefreshCw size={18} /></button></header>

    <div className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${gpsStatus === 'ativo' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200' : gpsStatus === 'offline' ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'bg-card'}`}>
      {rastreando ? <Navigation size={18} className={gpsStatus === 'ativo' ? 'text-emerald-600' : 'text-amber-600'} /> : <MapPin size={18} />}
      <div><b>{gpsStatus === 'ativo' ? 'Rastreamento sincronizado' : gpsStatus === 'offline' ? 'Sem internet · pontos guardados para envio' : gpsStatus === 'buscando' ? 'Buscando sinal GPS…' : gpsStatus === 'erro' ? 'GPS sem precisão ou permissão' : 'GPS inicia automaticamente com a rota'}</b>{ultimaSincronizacao && <p className="text-xs opacity-75">Último envio {ultimaSincronizacao.toLocaleTimeString('pt-BR')}</p>}</div>
    </div>

    {currentPos && <div className="h-44 overflow-hidden rounded-xl border bg-muted"><MapContainer center={[currentPos.lat, currentPos.lng]} zoom={15} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" /><Marker position={[currentPos.lat, currentPos.lng]} icon={motoIcon} /><MapFollower lat={currentPos.lat} lng={currentPos.lng} /></MapContainer></div>}

    {entregaEmRota && <section className="overflow-hidden rounded-2xl border border-amber-300 bg-card shadow-sm">
      <div className="bg-amber-500 p-4 text-white"><div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 font-bold"><Route size={20} /> Em rota · #{entregaEmRota.id.slice(-4)}</span>{entregaEmRota.previsaoEntregaEm && <span className="text-xs">Previsão {new Date(entregaEmRota.previsaoEntregaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}</div><h2 className="mt-2 text-xl font-black">{entregaEmRota.clienteNome}</h2><p className="text-sm text-white/90">{entregaEmRota.endereco}</p></div>
      <div className="space-y-4 p-4">
        <EtapasEntrega entrega={entregaEmRota} />
        <div className="grid grid-cols-2 gap-2"><button onClick={() => abrirNavegacao(entregaEmRota, 'google')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-sm font-bold text-white"><Navigation size={17} /> Google Maps</button><button onClick={() => abrirNavegacao(entregaEmRota, 'waze')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 p-3 text-sm font-bold text-white"><Route size={17} /> Waze</button>{entregaEmRota.telefone && <><a href={`tel:${entregaEmRota.telefone}`} className="inline-flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold"><Phone size={17} /> Ligar</a><a href={`https://wa.me/${telefoneNumerico(entregaEmRota.telefone)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold"><MessageCircle size={17} /> WhatsApp</a></>}</div>
        <div className="rounded-xl bg-muted/50 p-3 text-sm"><div className="flex justify-between"><span>Pagamento</span><b className="capitalize">{entregaEmRota.pagamento.replaceAll('_', ' ')}</b></div><div className="mt-1 flex justify-between"><span>Total</span><b>{fmtR(entregaEmRota.total)}</b></div><div className="mt-3 border-t pt-2 space-y-1">{entregaEmRota.itens.map(item => <div key={item.produtoId} className="flex justify-between text-xs"><span>{item.produtoNome || 'Produto'}</span><b>{item.quantidade} un.</b></div>)}</div>{entregaEmRota.obs && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">Obs.: {entregaEmRota.obs}</p>}</div>
        <div className="space-y-2 rounded-xl border p-3"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="text-emerald-600" size={18} /> Comprovante de entrega</div><input value={recebedor} onChange={e => setRecebedor(e.target.value)} placeholder="Nome de quem recebeu *" className="w-full rounded-lg border bg-background p-3" /><input inputMode="numeric" maxLength={4} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder={config?.exigirPin === false ? 'PIN do cliente (opcional)' : 'PIN de 4 dígitos do cliente *'} className="w-full rounded-lg border bg-background p-3 tracking-[0.3em]" /><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm"><Camera size={17} /> {foto ? foto.name : config?.exigirFoto ? 'Fotografar comprovante *' : 'Adicionar foto (opcional)'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={e => setFoto(e.target.files?.[0] || null)} /></label><button disabled={processando === entregaEmRota.id} onClick={() => void concluirEntrega(entregaEmRota)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50"><CheckCircle2 size={18} /> {processando === entregaEmRota.id ? 'Validando e concluindo…' : 'Confirmar entrega'}</button></div>
        <div className="space-y-2 rounded-xl border border-rose-200 p-3"><p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Não foi possível entregar?</p><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo obrigatório" className="w-full rounded-lg border bg-background p-3" /><button disabled={!motivo.trim() || processando === entregaEmRota.id} onClick={() => { void executarStatus(entregaEmRota, 'nao_entregue', { motivo: motivo.trim(), lat: currentPos?.lat, lng: currentPos?.lng, precisao: currentPos?.precisao }).then(() => setMotivo('')) }} className="w-full rounded-lg border border-rose-500 p-2 font-semibold text-rose-600 disabled:opacity-50">Registrar tentativa sem sucesso</button></div>
      </div>
    </section>}

    {minhas.filter(e => e.status !== 'em_rota').map(entrega => <section key={entrega.id} className="rounded-2xl border bg-card p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">#{entrega.id.slice(-4)} · {entrega.status === 'nao_entregue' ? 'Aguardando nova tentativa' : 'Atribuída a você'}</p><h2 className="font-bold">{entrega.clienteNome}</h2><p className="text-sm">{entrega.endereco}</p></div>{entrega.status === 'nao_entregue' ? <AlertTriangle className="text-rose-500" /> : <PackageCheck className="text-amber-500" />}</div>{entrega.naoEntregueMotivo && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">Ocorrência: {entrega.naoEntregueMotivo}</p>}<div className="grid grid-cols-2 gap-2"><button onClick={() => abrirNavegacao(entrega, 'google')} className="rounded-lg border p-2 text-sm">Ver rota</button><button disabled={processando === entrega.id} onClick={() => void executarStatus(entrega, 'em_rota')} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 p-2 text-sm font-bold text-white disabled:opacity-50"><Play size={16} /> {entrega.status === 'nao_entregue' ? 'Tentar novamente' : 'Iniciar rota'}</button></div></section>)}

    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold uppercase text-sm text-muted-foreground">Pedidos disponíveis</h2><span className="rounded-full bg-muted px-2 py-1 text-xs">{disponiveis.length}</span></div>{disponiveis.map(entrega => <div key={entrega.id} className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><b>#{entrega.id.slice(-4)} · {entrega.clienteNome}</b><p className="my-1 text-sm">{entrega.endereco}</p>{entrega.previsaoEntregaEm && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={13} /> Previsão até {new Date(entrega.previsaoEntregaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}</div><MapPin className="text-primary" /></div><button disabled={Boolean(minhas.length) || processando === entrega.id} onClick={() => void executarStatus(entrega, 'aceito')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50"><PackageCheck size={17} /> {minhas.length ? 'Conclua sua entrega atual' : processando === entrega.id ? 'Confirmando…' : 'Aceitar entrega'}</button></div>)}</section>
    {!disponiveis.length && !minhas.length && <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground"><XCircle className="mx-auto mb-2" /><b>Nenhum pedido disponível</b><p className="mt-1 text-sm">Esta tela atualiza automaticamente.</p></div>}
  </div>
}
