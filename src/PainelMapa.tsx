import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { supabase } from './lib/supabase'

type EntregadorLocation = {
  entregador_id: string
  nome: string
  lat: number
  lng: number
  ultima_atualizacao: Date
}

export function PainelMapa() {
  const [entregadores, setEntregadores] = useState<Record<string, EntregadorLocation>>({})
  
  // Localização padrão do mapa (São Paulo/Guarulhos)
  const centerPosition: [number, number] = [-23.4545, -46.5341]

  useEffect(() => {
    // Inscreve-se no mesmo canal que o app do entregador está mandando os dados
    const channel = supabase.channel('rastreamento_entregas')
      .on('broadcast', { event: 'localizacao_atualizada' }, (mensagem) => {
        const dados = mensagem.payload
        
        setEntregadores((atual) => ({
          ...atual,
          [dados.entregador_id]: {
            ...dados,
            ultima_atualizacao: new Date()
          }
        }))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const listaEntregadores = Object.values(entregadores)

  return (
    <div className="flex flex-col h-[70vh] border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="bg-card p-4 border-b border-border flex justify-between items-center">
        <h2 className="text-xl font-bold">Monitoramento em Tempo Real</h2>
        <span className="text-sm px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
          {listaEntregadores.length} online
        </span>
      </div>

      <div className="flex-1 relative">
        <MapContainer 
          center={centerPosition} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          
          {listaEntregadores.map((entregador) => (
            <Marker key={entregador.entregador_id} position={[entregador.lat, entregador.lng]}>
              <Popup>
                <strong>{entregador.nome}</strong><br/>
                Atualizado: {entregador.ultima_atualizacao.toLocaleTimeString()}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}