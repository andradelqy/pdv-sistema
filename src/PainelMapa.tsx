// src/PainelMapa.tsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from './lib/supabase'
import 'leaflet/dist/leaflet.css'

const motoIcon = L.divIcon({
  html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-8 h-8 text-amber-500"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  className: '', iconSize: [32, 32], iconAnchor: [16, 32],
})

type EntregadorLocation = {
  entregador_id: string
  nome: string
  lat: number
  lng: number
  ultima_atualizacao: Date
  history: [number, number][]
  rota?: [number, number][]
}

export function PainelMapa() {
  const [entregadores, setEntregadores] = useState<Record<string, EntregadorLocation>>({})
  const centerPosition: [number, number] = [-23.4545, -46.5341]

  useEffect(() => {
    const carregarRotas = async () => {
      const { data } = await supabase
        .from('rotas_entregas')
        .select('*')
        .order('updated_at', { ascending: false })
      if (data) {
        const rotasMap: Record<string, any> = {}
        data.forEach((row: any) => {
          rotasMap[row.entregador_id] = { rota: row.rota }
        })
        setEntregadores(prev => {
          const novo = { ...prev }
          Object.keys(rotasMap).forEach(id => {
            if (novo[id]) novo[id].rota = rotasMap[id].rota
          })
          return novo
        })
      }
    }
    carregarRotas()

    const channel = supabase.channel('rastreamento_entregas')
      .on('broadcast', { event: 'localizacao_atualizada' }, (mensagem) => {
        const dados = mensagem.payload
        setEntregadores((atual) => {
          const existente = atual[dados.entregador_id]
          const novaPos: [number, number] = [dados.lat, dados.lng]
          return {
            ...atual,
            [dados.entregador_id]: {
              ...dados,
              ultima_atualizacao: new Date(),
              history: existente?.history ? [...existente.history, novaPos] : [novaPos],
              rota: existente?.rota || []
            }
          }
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="h-[70vh] border rounded-lg overflow-hidden">
      <MapContainer center={centerPosition} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {Object.values(entregadores).map((ent) => (
          <div key={ent.entregador_id}>
            <Marker position={[ent.lat, ent.lng]} icon={motoIcon} />
            {ent.history && <Polyline positions={ent.history} color="blue" />}
          </div>
        ))}
      </MapContainer>
    </div>
  )
}
