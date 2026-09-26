import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { CheckCircle2, Clock3, MapPin, PackageCheck, Route, ShieldCheck, Truck } from 'lucide-react'
import { acompanharEntregaPublica } from '../lib/sync'
import 'leaflet/dist/leaflet.css'

type Acompanhamento = {
  id: string
  loja: string
  status: 'pendente' | 'aceito' | 'em_rota' | 'entregue' | 'cancelado' | 'nao_entregue'
  codigo_confirmacao?: string
  criado_em: string
  aceito_em?: string
  em_rota_em?: string
  entregue_em?: string
  previsao_entrega_em?: string
  entregador?: string
  lat?: number
  lng?: number
  localizacao_atualizada_em?: string
}

const motoIcon = L.divIcon({ html: '<div style="font-size:34px">🛵</div>', className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
const ordem = ['pendente', 'aceito', 'em_rota', 'entregue']
const rotulos: Record<string, string> = { pendente: 'Pedido confirmado', aceito: 'Entregador a caminho da loja', em_rota: 'Saiu para entrega', entregue: 'Pedido entregue', cancelado: 'Pedido cancelado', nao_entregue: 'Tentativa sem sucesso' }

const formatarHorario = (valor?: string) => valor
  ? new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : null

export function AcompanharEntrega() {
  const { token = '' } = useParams()
  const [dados, setDados] = useState<Acompanhamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      try {
        const resposta = await acompanharEntregaPublica(token) as unknown as Acompanhamento
        if (ativo) { setDados(resposta); setErro(null) }
      } catch (error) {
        if (ativo) setErro(error instanceof Error ? error.message : 'Não foi possível acompanhar o pedido.')
      } finally { if (ativo) setCarregando(false) }
    }
    void carregar()
    const timer = window.setInterval(() => void carregar(), 15_000)
    return () => { ativo = false; window.clearInterval(timer) }
  }, [token])

  if (carregando) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0F1115] px-5 text-[#F1F3F5]">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#171A20] shadow-2xl shadow-black/20">
            <Truck className="animate-bounce text-[#AEB4BE]" size={26} />
          </div>
          <p className="font-semibold tracking-tight">Localizando seu pedido…</p>
          <p className="mt-1 text-xs text-[#667085]">Sincronizando informações da entrega</p>
        </div>
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0F1115] p-5 text-[#F1F3F5]">
        <div className="w-full max-w-md rounded-3xl bg-[#171A20] p-7 text-center shadow-2xl shadow-black/25 ring-1 ring-white/[0.04]">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#22262E] text-[#AEB4BE]">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Link de acompanhamento inválido</h1>
          <p className="mt-2 text-sm leading-6 text-[#9299A5]">{erro}</p>
        </div>
      </div>
    )
  }

  const atual = ordem.indexOf(dados.status)
  const posicao = dados.lat != null && dados.lng != null ? [Number(dados.lat), Number(dados.lng)] as [number, number] : null
  const finalizada = dados.status === 'entregue'
  const problema = dados.status === 'cancelado' || dados.status === 'nao_entregue'
  const progresso = atual >= 0 ? Math.round(((atual + 1) / ordem.length) * 100) : 0
  const previsao = formatarHorario(dados.previsao_entrega_em)

  const horarios: Record<string, string | null> = {
    pendente: formatarHorario(dados.criado_em),
    aceito: formatarHorario(dados.aceito_em),
    em_rota: formatarHorario(dados.em_rota_em),
    entregue: formatarHorario(dados.entregue_em),
  }

  return (
    <main className="min-h-screen bg-[#0F1115] px-4 py-5 text-[#F1F3F5] sm:px-6 sm:py-8">
      <style>{`
        .orbita-delivery-map .leaflet-tile-pane {
          filter: grayscale(1) invert(.92) hue-rotate(170deg) brightness(.62) contrast(1.18);
        }
        .orbita-delivery-map .leaflet-control-zoom a {
          background: #22262E;
          border-color: #2B3039;
          color: #F1F3F5;
        }
        .orbita-delivery-map .leaflet-control-attribution {
          background: rgba(15, 19, 28, .82);
          color: #667085;
        }
        .orbita-delivery-map .leaflet-control-attribution a {
          color: #AEB4BE;
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-5">
        <header className="flex items-start justify-between gap-4 px-1 pt-1">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#667085]">
              <span>Órbita</span>
              <span className="h-1 w-1 rounded-full bg-[#3b494b]" />
              <span className="truncate text-[#AEB4BE]">#{dados.id}</span>
            </div>
            <h1 className="truncate text-xl font-bold tracking-tight text-[#F1F3F5] sm:text-2xl">{dados.loja}</h1>
          </div>

          <div className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] shadow-lg ${
            finalizada
              ? 'bg-[#6FCF97]/10 text-[#8BD9AC]'
              : problema
                ? 'bg-[#93000a]/30 text-[#ffb4ab]'
                : 'bg-[#22262E] text-[#AEB4BE]'
          }`}>
            <span className={`h-2 w-2 rounded-full ${finalizada ? 'bg-[#6FCF97]' : problema ? 'bg-[#ffb4ab]' : 'animate-pulse bg-[#6FCF97]'}`} />
            <span className="max-w-[150px] truncate">{rotulos[dados.status]}</span>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-[#171A20] p-5 shadow-2xl shadow-black/20 ring-1 ring-white/[0.035] sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#6FCF97]/[0.055] blur-3xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#667085]">
                {previsao && !finalizada ? 'Previsão de chegada' : 'Status da entrega'}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {previsao && !finalizada ? (
                  <span className="text-3xl font-bold tracking-[-0.04em] text-[#F1F3F5] sm:text-4xl">{previsao}</span>
                ) : (
                  <span className={`text-2xl font-bold tracking-tight ${problema ? 'text-[#ffb4ab]' : finalizada ? 'text-[#8BD9AC]' : 'text-[#F1F3F5]'}`}>
                    {rotulos[dados.status]}
                  </span>
                )}
                {!problema && !finalizada && atual >= 0 && (
                  <span className="font-mono text-xs font-semibold text-[#AEB4BE]">{progresso}% concluído</span>
                )}
              </div>
            </div>

            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-inner ${
              finalizada
                ? 'bg-[#22262E] text-[#AEB4BE]'
                : problema
                  ? 'bg-[#93000a]/30 text-[#ffb4ab]'
                  : 'bg-[#2B3039] text-[#AEB4BE]'
            }`}>
              {finalizada ? <CheckCircle2 size={23} /> : dados.status === 'em_rota' ? <Route size={23} /> : <PackageCheck size={23} />}
            </div>
          </div>

          {!problema && atual >= 0 && (
            <div className="relative mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-[#0B0D10]">
                <div
                  className="h-full rounded-full bg-[#6FCF97] transition-[width] duration-700"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] font-medium text-[#667085]">
                <span>{rotulos[ordem[Math.max(0, atual)]]}</span>
                {previsao && !finalizada && <span className="flex items-center gap-1 text-[#9299A5]"><Clock3 size={12} /> até {previsao}</span>}
              </div>
            </div>
          )}
        </section>

        {posicao && (
          <section className="overflow-hidden rounded-3xl bg-[#0B0D10] shadow-2xl shadow-black/25 ring-1 ring-white/[0.035]">
            <div className="flex items-center justify-between gap-4 bg-[#171A20] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6FCF97] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6FCF97]" />
                  </span>
                  <h2 className="truncate font-semibold tracking-tight text-[#F1F3F5]">Localização do entregador</h2>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] tracking-wide text-[#667085]">
                  {dados.entregador ? `${dados.entregador} · ` : ''}
                  {dados.localizacao_atualizada_em
                    ? `Atualizado às ${new Date(dados.localizacao_atualizada_em).toLocaleTimeString('pt-BR')}`
                    : 'Atualizando…'}
                </p>
              </div>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#22262E] text-[#AEB4BE]">
                <MapPin size={18} />
              </div>
            </div>

            <div className="orbita-delivery-map h-72 sm:h-80">
              <MapContainer center={posicao} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                <Marker position={posicao} icon={motoIcon} />
              </MapContainer>
            </div>
          </section>
        )}

        {!posicao && dados.status !== 'entregue' && (
          <div className="flex items-center gap-3 rounded-2xl bg-[#171A20] px-4 py-4 text-sm text-[#9299A5] shadow-lg shadow-black/10 ring-1 ring-white/[0.03]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#22262E] text-[#AEB4BE]">
              <MapPin size={17} />
            </div>
            <span>O mapa aparece quando o pedido sair para entrega.</span>
          </div>
        )}

        {dados.codigo_confirmacao && (
          <section className="rounded-3xl bg-[#171A20] p-5 shadow-2xl shadow-black/20 ring-1 ring-white/[0.035] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#22262E] text-[#AEB4BE]">
                  <ShieldCheck size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold tracking-tight text-[#F1F3F5]">Código de recebimento</h2>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#667085]">Validação da entrega</p>
                </div>
              </div>
              <span className="rounded-lg bg-[#6FCF97]/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#8BD9AC]">Protegido</span>
            </div>

            <div className="mt-5 flex gap-2 sm:gap-3">
              {String(dados.codigo_confirmacao).split('').map((digito, index) => (
                <div key={`${digito}-${index}`} className="grid h-16 min-w-0 flex-1 place-items-center rounded-2xl bg-[#2B3039] shadow-inner shadow-black/20 ring-1 ring-white/[0.025]">
                  <span className="font-mono text-2xl font-bold tracking-wider text-[#F1F3F5] sm:text-3xl">{digito}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-sm leading-6 text-[#9299A5]">Informe este código ao responsável somente quando receber seu pedido.</p>
          </section>
        )}

        <section className="rounded-3xl bg-[#171A20] p-5 shadow-2xl shadow-black/20 ring-1 ring-white/[0.035] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-semibold tracking-tight text-[#F1F3F5]">Linha do tempo</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#667085]">4 etapas</span>
          </div>

          <div className="relative">
            {ordem.map((status, index) => {
              const concluida = atual >= index || finalizada
              const ativa = !finalizada && !problema && atual === index
              const horario = horarios[status]

              return (
                <div key={status} className={`relative flex gap-4 ${index < ordem.length - 1 ? 'pb-6' : ''}`}>
                  {index < ordem.length - 1 && (
                    <div className={`absolute left-[15px] top-8 h-[calc(100%-20px)] w-px ${atual > index || finalizada ? 'bg-[#6FCF97]/50' : 'bg-[#2B3039]'}`} />
                  )}

                  <div className="relative z-10 shrink-0">
                    {ativa && <span className="absolute -inset-1.5 animate-ping rounded-full bg-[#6FCF97]/20" />}
                    <div className={`relative grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors ${
                      concluida
                        ? ativa
                          ? 'bg-[#6FCF97] text-[#111418] shadow-lg shadow-black/25'
                          : 'bg-[#22262E] text-[#6FCF97] ring-1 ring-[#6FCF97]/25'
                        : 'bg-[#2B3039] text-[#667085]'
                    }`}>
                      {concluida ? <CheckCircle2 size={16} /> : index + 1}
                    </div>
                  </div>

                  <div className={`min-w-0 flex-1 pt-1 ${!concluida ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={`min-w-0 truncate text-sm ${ativa ? 'font-bold text-[#8BD9AC]' : concluida ? 'font-semibold text-[#F1F3F5]' : 'font-medium text-[#9299A5]'}`}>
                        {rotulos[status]}
                      </p>
                      {horario && <span className={`shrink-0 font-mono text-[10px] ${ativa ? 'text-[#AEB4BE]' : concluida ? 'text-[#8BD9AC]' : 'text-[#667085]'}`}>{horario}</span>}
                    </div>
                    {status === 'entregue' && !horario && previsao && !problema && (
                      <p className="mt-1 font-mono text-[10px] text-[#667085]">Previsão: {previsao}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {problema && (
            <div className="mt-5 rounded-2xl bg-[#93000a]/20 px-4 py-3 text-sm font-medium text-[#ffb4ab] ring-1 ring-[#ffb4ab]/10">
              {rotulos[dados.status]}
            </div>
          )}
        </section>

        <footer className="flex flex-col items-center justify-center gap-1 px-4 pb-2 pt-1 text-center">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-[#667085]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#AEB4BE]" />
            <span>A página atualiza automaticamente a cada 15 segundos.</span>
          </div>
          <p className="text-[11px] leading-5 text-[#667085]">Nenhum dado financeiro ou telefone é exibido.</p>
        </footer>
      </div>
    </main>
  )
}
