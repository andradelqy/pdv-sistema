import { useEffect, useState } from 'react'
import { ExternalLink, LocateFixed, MapPin, Save, Settings2, X } from 'lucide-react'
import { interpretarCoordenada, validarCoordenadas } from '../lib/geo'
import { useStore } from '../lib/store'
import { carregarConfigEntrega, geocodificarEntrega, salvarConfigEntrega, type ConfigEntrega } from '../lib/sync'
import { toast } from '../lib/toast'

function textoCoordenada(valor?: number) {
  return valor == null ? '' : String(valor)
}

export function DeliverySettingsDialog({ onClose }: { onClose: () => void }) {
  const lojaId = useStore(state => state.lojaId)
  const [config, setConfig] = useState<ConfigEntrega | null>(null)
  const [latitudeTexto, setLatitudeTexto] = useState('')
  const [longitudeTexto, setLongitudeTexto] = useState('')
  const [enderecoEncontrado, setEnderecoEncontrado] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [localizando, setLocalizando] = useState(false)

  useEffect(() => {
    let ativo = true
    void carregarConfigEntrega(lojaId)
      .then(valor => {
        if (!ativo) return
        setConfig(valor)
        setLatitudeTexto(textoCoordenada(valor.latitudeOrigem))
        setLongitudeTexto(textoCoordenada(valor.longitudeOrigem))
      })
      .catch(error => toast(error instanceof Error ? error.message : 'Falha ao carregar configuração.', 'danger'))
    return () => { ativo = false }
  }, [lojaId])

  if (!config) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60"><div className="rounded-xl bg-card p-6">Carregando configuração…</div></div>
  }

  const latitude = interpretarCoordenada(latitudeTexto)
  const longitude = interpretarCoordenada(longitudeTexto)
  const erroCoordenadas = validarCoordenadas(latitude, longitude)
  const mapaUrl = erroCoordenadas
    ? null
    : `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`

  const localizar = async () => {
    if (!config.enderecoOrigem?.trim()) return toast('Informe o endereço completo da loja.', 'warning')
    setLocalizando(true)
    try {
      const local = await geocodificarEntrega(config.enderecoOrigem, config.contextoGeocodificacao)
      setLatitudeTexto(String(local.lat))
      setLongitudeTexto(String(local.lng))
      setConfig({ ...config, latitudeOrigem: local.lat, longitudeOrigem: local.lng })
      setEnderecoEncontrado(local.enderecoEncontrado ?? config.enderecoOrigem)
      toast('Endereço localizado. Confira o ponto antes de salvar.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível localizar.', 'danger')
    } finally {
      setLocalizando(false)
    }
  }

  const salvar = async () => {
    const erro = validarCoordenadas(latitude, longitude)
    if (erro) return toast(erro, 'warning')
    const configAtualizada = { ...config, latitudeOrigem: latitude, longitudeOrigem: longitude }
    setSalvando(true)
    try {
      await salvarConfigEntrega(configAtualizada)
      toast('Configuração de entregas salva.', 'success')
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Falha ao salvar.', 'danger')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Configuração de entregas">
      <div className="max-h-[92vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
        <header className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-primary"><Settings2 size={15} /> OPERAÇÃO</p>
            <h2 className="text-xl font-bold">Configuração de entregas</h2>
            <p className="text-sm text-muted-foreground">Origem, SLA e exigências do comprovante por loja.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Nome da loja
            <input value={config.nomeLoja || ''} onChange={e => setConfig({ ...config, nomeLoja: e.target.value })} className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Endereço de saída
            <input
              value={config.enderecoOrigem || ''}
              onChange={e => {
                setConfig({ ...config, enderecoOrigem: e.target.value, latitudeOrigem: undefined, longitudeOrigem: undefined })
                setLatitudeTexto('')
                setLongitudeTexto('')
                setEnderecoEncontrado(null)
              }}
              placeholder="Rua, número, bairro, cidade - UF"
              className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal"
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Contexto de busca
            <input value={config.contextoGeocodificacao} onChange={e => setConfig({ ...config, contextoGeocodificacao: e.target.value })} placeholder="São Paulo - SP, Brasil" className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Informe cidade e estado para evitar endereços homônimos.</span>
          </label>
          <button type="button" onClick={() => void localizar()} disabled={localizando} className="sm:col-span-2 flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            <LocateFixed size={17} /> {localizando ? 'Localizando…' : 'Localizar endereço no mapa'}
          </button>

          <div className="sm:col-span-2">
            <p className="text-sm font-semibold">Coordenadas da loja</p>
            <p className="text-xs text-muted-foreground">Use a busca automática ou informe manualmente com ponto ou vírgula decimal.</p>
          </div>
          <label className="text-sm font-semibold">Latitude
            <input
              type="text"
              inputMode="decimal"
              value={latitudeTexto}
              onChange={e => { setLatitudeTexto(e.target.value); setEnderecoEncontrado(null) }}
              placeholder="-23.550520"
              className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal"
            />
          </label>
          <label className="text-sm font-semibold">Longitude
            <input
              type="text"
              inputMode="decimal"
              value={longitudeTexto}
              onChange={e => { setLongitudeTexto(e.target.value); setEnderecoEncontrado(null) }}
              placeholder="-46.633308"
              className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal"
            />
          </label>

          {mapaUrl && (
            <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="flex min-w-0 gap-2">
                <MapPin className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Ponto válido</p>
                  <p className="truncate text-xs text-muted-foreground">{enderecoEncontrado || `${latitude}, ${longitude}`}</p>
                </div>
              </div>
              <a href={mapaUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">Conferir <ExternalLink size={14} /></a>
            </div>
          )}
          {!mapaUrl && (latitudeTexto || longitudeTexto) && <p className="sm:col-span-2 text-xs font-medium text-destructive">{erroCoordenadas}</p>}

          <label className="text-sm font-semibold">SLA padrão (min)
            <input type="number" min={10} max={1440} value={config.slaMinutos} onChange={e => setConfig({ ...config, slaMinutos: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal" />
          </label>
          <label className="text-sm font-semibold">Velocidade estimada (km/h)
            <input type="number" min={5} max={120} value={config.velocidadeMediaKmh} onChange={e => setConfig({ ...config, velocidadeMediaKmh: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Precisão máxima do GPS (m)
            <input type="number" min={10} max={1000} value={config.precisaoMaximaM} onChange={e => setConfig({ ...config, precisaoMaximaM: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-background p-2.5 font-normal" />
          </label>
        </div>

        <div className="grid gap-2 rounded-xl border p-3 text-sm">
          {([['exigirPin', 'Exigir PIN do cliente'], ['exigirLocalizacao', 'Exigir GPS no recebimento'], ['exigirFoto', 'Exigir foto do comprovante']] as const).map(([campo, label]) => (
            <label key={campo} className="flex items-center justify-between gap-3"><span>{label}</span><input type="checkbox" checked={config[campo]} onChange={e => setConfig({ ...config, [campo]: e.target.checked })} className="h-4 w-4" /></label>
          ))}
        </div>
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50">
          <Save size={17} /> {salvando ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
