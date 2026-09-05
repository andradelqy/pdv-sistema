import { useState, useRef, useEffect } from 'react'
import { useStore } from './lib/store'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({ html: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-500"><circle cx="12" cy="12" r="10"/></svg>`, className: '', iconSize: [32, 32] })

function MapFollower({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], 16) }, [lat, lng, map])
  return null
}

export function AppEntregador() {
  const { entregas, updateStatusEntrega } = useStore()
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

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <div className="h-48 rounded-xl overflow-hidden bg-muted">
        {currentPos ? (
          <MapContainer center={currentPos} zoom={13} style={{ height: '300px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={currentPos} icon={motoIcon} />
            <MapFollower lat={currentPos[0]} lng={currentPos[1]} />
          </MapContainer>
        ) : <div className="h-48 flex items-center justify-center">Aguardando GPS...</div>}
      </div>

      {!rastreando ? (
        <button onClick={iniciarRastreamento} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold">Iniciar Rota</button>
      ) : (
        <button onClick={pararRastreamento} className="w-full bg-rose-600 text-white p-4 rounded-xl font-bold">Parar</button>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pedidos Disponíveis</h3>
        {entregas.filter(e => e.status === 'pendente').map(e => (
          <div key={e.id} className="p-4 border rounded-xl bg-card">
            <p className="font-bold">{e.clienteNome}</p>
            <button onClick={() => updateStatusEntrega(e.id, 'em_rota', { id: 'ent-1', nome: 'Moto' })} className="mt-2 w-full bg-amber-500 text-white p-2 rounded">Aceitar</button>
          </div>
        ))}
      </div>
    </div>
  )
}
