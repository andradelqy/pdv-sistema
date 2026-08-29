import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useStore, fmtR } from './lib/store'
import { toast } from './lib/toast'
import { Truck, MapPin, CheckCircle, Navigation, Phone, Clock } from 'lucide-react'

export function AppEntregador() {
  const { entregas, updateStatusEntrega } = useStore()
  const [rastreando, setRastreando] = useState(false)
  const [status, setStatus] = useState('Inativo')
  const entregadorNome = 'João MotoBoy'
  const watchId = useRef<number | null>(null)

  // Escuta novas entregas via WebSocket do Supabase
  useEffect(() => {
    const channel = supabase.channel('rastreamento_entregas')
      .on('broadcast', { event: 'novo_pedido_entrega' }, (payload) => {
        toast(`📦 Novo pedido para entrega! #${payload.payload.id.slice(-4)}`)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const iniciarRastreamento = () => {
    if (!navigator.geolocation) {
      setStatus('Geolocalização não suportada.')
      return
    }

    setRastreando(true)
    setStatus('Online e transmitindo rota...')

    const channel = supabase.channel('rastreamento_entregas')

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setStatus(`Online: Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`)
        
        channel.send({
          type: 'broadcast',
          event: 'localizacao_atualizada',
          payload: { 
            entregador_id: 'entregador-123', 
            nome: entregadorNome, 
            lat: latitude, 
            lng: longitude 
          }
        })
      },
      (err) => setStatus(`Erro de GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0 }
    )
  }

  const pararRastreamento = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setRastreando(false)
    setStatus('Inativo')
  }

  // Pedidos disponíveis para entrega
  const pedidosPendentes = entregas.filter(e => e.status === 'pendente')
  const meusPedidosEmRota = entregas.filter(e => e.status === 'em_rota')

  const aceitarEntrega = (id: string) => {
    // Só permite aceitar se estiver rastreando
    if (!rastreando) {
      toast('Você precisa estar online para aceitar entregas.', 'warning')
      return
    }
    updateStatusEntrega(id, 'em_rota', { id: 'entregador-123', nome: entregadorNome })
    toast('Entrega aceita! Boa rota.')
  }

  const finalizarEntrega = (id: string) => {
    updateStatusEntrega(id, 'entregue')
    toast('Entrega finalizada com sucesso!', 'success')
  }

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5 p-4">
      {/* Card Status & Rastreamento */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm text-center">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck className="text-amber-500" size={22} />
            <h2 className="text-lg font-bold text-left">App do Entregador</h2>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${rastreando ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-muted text-muted-foreground'}`}>
            {rastreando ? '● Online' : '○ Offline'}
          </span>
        </div>

        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-xs font-mono text-muted-foreground border border-border">
          {status}
        </div>

        {!rastreando ? (
          <button 
            onClick={iniciarRastreamento}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-base shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <Navigation size={18} /> Ficar Online / Iniciar Rota
          </button>
        ) : (
          <button 
            onClick={pararRastreamento}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl text-base transition active:scale-95 cursor-pointer shadow-md shadow-rose-600/20"
          >
            ⏹ Parar Transmissão
          </button>
        )}
      </div>

      {/* Minhas Entregas em Rota */}
      {meusPedidosEmRota.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <Clock size={16} /> Em Andamento ({meusPedidosEmRota.length})
          </h3>
          {meusPedidosEmRota.map(e => (
            <div key={e.id} className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-2.5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-base">{e.clienteNome}</span>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin size={13} className="text-amber-500" /> {e.endereco}
                  </div>
                </div>
                <span className="font-bold text-base text-primary">{fmtR(e.total)}</span>
              </div>

              {e.telefone && (
                <a
                  href={`https://wa.me/55${e.telefone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold hover:underline"
                >
                  <Phone size={12} /> WhatsApp: {e.telefone}
                </a>
              )}

              {e.obs && <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">Obs: {e.obs}</p>}

              <button
                onClick={() => finalizarEntrega(e.id)}
                className="w-full mt-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
              >
                <CheckCircle size={15} /> Confirmar Entrega Realizada
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pedidos Disponíveis para Aceitar */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Truck size={16} /> Pedidos Disponíveis ({pedidosPendentes.length})
        </h3>

        {pedidosPendentes.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Nenhum pedido aguardando entrega no momento.
          </div>
        ) : (
          pedidosPendentes.map(e => (
            <div key={e.id} className="p-4 rounded-xl border border-border bg-card flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-sm">{e.clienteNome}</span>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin size={13} className="text-rose-500" /> {e.endereco}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-primary">{fmtR(e.total)}</div>
                  <span className="text-[10px] text-muted-foreground">{e.pagamento}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Taxa: {fmtR(e.taxaEntrega)}</span>
                {rastreando ? (
                  <button
                    onClick={() => aceitarEntrega(e.id)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer active:scale-95 transition"
                  >
                    Aceitar Pedido
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                    <Clock size={12} /> Fique online para aceitar
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}