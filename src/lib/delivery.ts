export type PontoRota = {
  entregadorId: string
  entregaId: string
  lat: number
  lng: number
  precisao?: number
  criadoEm: string
}

export type RotaEntrega = {
  chave: string
  entregadorId: string
  entregaId: string
  pontos: [number, number][]
}

/**
 * Mantém cada pedido em sua própria linha e descarta pontos cuja precisão ou
 * velocidade implícita indicam salto de GPS.
 */
export function agruparRotasPorEntrega(pontos: PontoRota[], precisaoMaxima = 250, velocidadeMaximaKmh = 140): RotaEntrega[] {
  const grupos = new Map<string, PontoRota[]>()
  pontos.forEach(ponto => {
    if (!ponto.entregaId || Number(ponto.precisao || 0) > precisaoMaxima) return
    const chave = `${ponto.entregadorId}:${ponto.entregaId}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), ponto])
  })
  return [...grupos.entries()].map(([chave, registros]) => {
    const validos: [number, number][] = []
    let anterior: PontoRota | undefined
    registros.sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()).forEach(ponto => {
      if (anterior) {
        const metros = Math.hypot((ponto.lat - anterior.lat) * 111_000, (ponto.lng - anterior.lng) * 85_000)
        const segundos = Math.max(1, (new Date(ponto.criadoEm).getTime() - new Date(anterior.criadoEm).getTime()) / 1000)
        if ((metros / segundos) * 3.6 > velocidadeMaximaKmh) return
      }
      validos.push([ponto.lat, ponto.lng])
      anterior = ponto
    })
    return { chave, entregaId: registros[0].entregaId, entregadorId: registros[0].entregadorId, pontos: validos }
  })
}

export function validarComprovanteEntrega(
  config: { exigirPin: boolean; exigirLocalizacao: boolean; exigirFoto: boolean; precisaoMaximaM: number },
  prova: { recebedor: string; pin?: string; lat?: number; lng?: number; precisao?: number; temFoto: boolean },
): string | null {
  if (!prova.recebedor.trim()) return 'Informe quem recebeu o pedido.'
  if (config.exigirPin && !/^\d{4}$/.test(prova.pin || '')) return 'Informe o PIN de quatro dígitos do cliente.'
  if (config.exigirLocalizacao && (prova.lat == null || prova.lng == null)) return 'Aguarde o GPS localizar sua posição.'
  if (prova.precisao != null && prova.precisao > config.precisaoMaximaM) return 'O sinal do GPS ainda está impreciso.'
  if (config.exigirFoto && !prova.temFoto) return 'Esta loja exige uma foto do comprovante.'
  return null
}

export function entregaEstaAtrasada(status: string, previsao?: string, agora = Date.now()) {
  return ['pendente', 'aceito', 'em_rota'].includes(status) && Boolean(previsao) && new Date(previsao!).getTime() < agora
}
