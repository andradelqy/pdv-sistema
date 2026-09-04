import { useState, useRef, useEffect } from 'react'
import { useStore, fmtR } from './lib/store'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Truck, MapPin, User, Navigation, Phone, CheckCircle, Package, DollarSign, Clock } from 'lucide-react'

const motoIcon = L.divIcon({ html: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-500"><circle cx="12" cy="12" r="10"/></svg>`, className: '', iconSize: [32, 32] })

function MapFollower({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], 16) }, [lat, lng, map])
  return null
}

export function AppEntregador() {
  const { entregas, updateStatusEntrega, produtos } = useStore()
  const [rastreando, setRastreando] = useState(false)
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null)
  const watchId = useRef<number | null>(null)

  const pararRastreamento = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    setRastreando(false)
    setCurrentPos(null)
  }

  const iniciarRastreamento = () => {
    setRastreando(true)
    watchId.current = navigator.geolocation.watchPosition((pos) => {
      setCurrentPos([pos.coords.latitude, pos.coords.longitude])
    })
  }

  const pedidosPendentes = entregas.filter(e => e.status === 'pendente')
  const pedidosEmRota = entregas.filter(e => e.status === 'em_rota')

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-6 pb-20">
      <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800"><Truck className="text-emerald-500" /> Painel do Entregador</h1>
      
      {!rastreando ? (
        <button onClick={iniciarRastreamento} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold shadow-lg">Iniciar Rastreamento</button>
      ) : (
        <div className="space-y-4">
          <div className="h-48 rounded-xl overflow-hidden border">
            {currentPos ? (
              <MapContainer center={currentPos} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={currentPos} icon={motoIcon} />
                <MapFollower lat={currentPos[0]} lng={currentPos[1]} />
              </MapContainer>
            ) : <div className="h-48 flex items-center justify-center">Aguardando GPS...</div>}
          </div>
          <button onClick={pararRastreamento} className="w-full bg-rose-600 text-white p-4 rounded-xl font-bold">Encerrar Turno</button>
        </div>
      )}

      {pedidosEmRota.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-500">Em Entrega</h2>
          {pedidosEmRota.map(e => (
            <div key={e.id} className="p-5 border-2 border-amber-500 rounded-2xl bg-amber-50 shadow-md">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-lg">{e.clienteNome}</p>
                  <p className="text-sm flex items-center gap-1"><MapPin size={14}/>{e.endereco}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Valor</p>
                  <p className="font-bold text-lg">{fmtR(e.total)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <div className="bg-white p-2 rounded flex items-center gap-2"><DollarSign size={16}/> {e.pagamento}</div>
                <div className="bg-white p-2 rounded flex items-center gap-2"><Package size={16}/> {e.itens.length} itens</div>
              </div>
              
              <div className="mb-4 space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Itens:</p>
                {e.itens.map((item, idx) => {
                  const prod = produtos.find(p => p.id === item.produtoId);
                  return (
                    <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded">
                      <span>{item.quantidade}x {prod?.nome || 'Produto não encontrado'}</span>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => updateStatusEntrega(e.id, 'entregue')} 
                className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <CheckCircle size={20}/> Finalizar Entrega
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">Pedidos Disponíveis ({pedidosPendentes.length})</h2>
        {pedidosPendentes.map(e => (
          <div key={e.id} className="p-4 border rounded-xl bg-white shadow-sm flex justify-between items-center">
            <div>
              <p className="font-bold">{e.clienteNome}</p>
              <p className="text-sm text-slate-600">{e.endereco}</p>
            </div>
            <button 
              onClick={() => updateStatusEntrega(e.id, 'em_rota', { id: 'ent-1', nome: 'Moto' })}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm"
            >
              Aceitar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
