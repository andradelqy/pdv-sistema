import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

type Perfil = {
  id: string
  nome: string
  role: string
}

export function PontoEletronico() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [funcionarioId, setFuncionarioId] = useState('')
  const [pinDigitado, setPinDigitado] = useState('')
  const [status, setStatus] = useState('')
  const [carregando, setCarregando] = useState(false)

  // Carrega a lista de funcionários
  useEffect(() => {
    async function carregarPerfis() {
      const { data } = await supabase.from('perfis').select('id,nome,role').order('nome')
      if (data) setPerfis(data)
    }
    carregarPerfis()
  }, [])

  // Captura geolocalização e insere o registro no banco
  const baterPonto = (tipo: 'entrada' | 'saida') => {
    const funcionario = perfis.find(p => p.id === funcionarioId)
    
    if (!funcionario) {
      setStatus('⚠️ Selecione um funcionário.')
      return
    }

    if (!navigator.geolocation) {
      setStatus('❌ Geolocalização não é suportada neste navegador.')
      return
    }

    setCarregando(true)
    setStatus('Capturando localização...')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords

        const { error } = await supabase.rpc('registrar_ponto', {
          p_funcionario_id: funcionarioId,
          p_pin: pinDigitado,
          p_tipo: tipo,
          p_latitude: latitude,
          p_longitude: longitude,
        })

        setCarregando(false)

        if (error) {
          setStatus(`❌ Erro ao registrar: ${error.message}`)
        } else {
          setStatus(`✅ Ponto de ${tipo.toUpperCase()} registrado! Lat: ${latitude.toFixed(4)}, Long: ${longitude.toFixed(4)}`)
          setPinDigitado('')
        }
      },
      (error) => {
        setCarregando(false)
        setStatus(`❌ Erro de Geolocalização: ${error.message}`)
      },
      { enableHighAccuracy: true }
    )
  }

  const definirPin = async () => {
    if (!funcionarioId) return setStatus('⚠️ Selecione um funcionário.')
    if (!/^\d{4,8}$/.test(pinDigitado)) return setStatus('⚠️ O PIN deve ter de 4 a 8 números.')
    setCarregando(true)
    const { error } = await supabase.rpc('definir_pin_ponto', {
      p_funcionario_id: funcionarioId,
      p_novo_pin: pinDigitado,
    })
    setCarregando(false)
    if (error) return setStatus(`❌ Erro ao definir PIN: ${error.message}`)
    setPinDigitado('')
    setStatus('✅ PIN definido com segurança.')
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-card border border-border rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-center">Ponto Eletrônico</h2>

      {status && (
        <div className="mb-4 p-3 rounded text-sm font-medium bg-muted text-foreground border border-border">
          {status}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Funcionário</label>
          <select 
            className="w-full p-2 border border-border rounded bg-background"
            value={funcionarioId} 
            onChange={(e) => setFuncionarioId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} ({p.role})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">PIN Individual</label>
          <input 
            type="password" 
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            className="w-full p-2 border border-border rounded bg-background text-center text-lg tracking-widest"
            placeholder="****"
            value={pinDigitado}
            onChange={(e) => setPinDigitado(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void definirPin()}
            disabled={carregando || !funcionarioId}
            className="mt-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Definir ou alterar PIN deste colaborador
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <button 
            onClick={() => baterPonto('entrada')}
            disabled={carregando}
            className="bg-green-600 text-white font-bold py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Entrada
          </button>
          <button 
            onClick={() => baterPonto('saida')}
            disabled={carregando}
            className="bg-destructive text-destructive-foreground font-bold py-2 rounded hover:opacity-90 disabled:opacity-50"
          >
            Saída
          </button>
        </div>
      </div>
    </div>
  )
}
