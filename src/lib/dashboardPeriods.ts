export type PeriodoDashboard = 'hoje' | 'semana' | 'mes' | 'historico'

export type IntervaloDashboard = {
  inicio: string
  fim: string
  rotulo: string
}

function dataLocal(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia, 12)
}

function dataISO(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function ultimoDiaMes(chaveMes: string) {
  const [ano, mes] = chaveMes.split('-').map(Number)
  return dataISO(new Date(ano, mes, 0, 12))
}

export function chaveMesDaData(data: string) {
  return data.slice(0, 7)
}

export function formatarMes(chaveMes: string) {
  const [ano, mes] = chaveMes.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(ano, mes - 1, 1, 12))
}

export function intervaloDashboard(
  periodo: PeriodoDashboard,
  hoje: string,
  mesHistorico = chaveMesDaData(hoje),
): IntervaloDashboard {
  if (periodo === 'hoje') return { inicio: hoje, fim: hoje, rotulo: 'Hoje' }

  if (periodo === 'semana') {
    const atual = dataLocal(hoje)
    const diaSemana = atual.getDay()
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1
    atual.setDate(atual.getDate() - diasDesdeSegunda)
    return { inicio: dataISO(atual), fim: hoje, rotulo: 'Semana atual' }
  }

  const chaveMes = periodo === 'historico' ? mesHistorico : chaveMesDaData(hoje)
  const fimNatural = ultimoDiaMes(chaveMes)
  const fim = chaveMes === chaveMesDaData(hoje) ? hoje : fimNatural
  return {
    inicio: `${chaveMes}-01`,
    fim,
    rotulo: periodo === 'historico' ? formatarMes(chaveMes) : 'Mês atual',
  }
}

export function intervaloAnterior(
  periodo: Exclude<PeriodoDashboard, 'historico'>,
  intervalo: IntervaloDashboard,
): IntervaloDashboard {
  const inicioAtual = dataLocal(intervalo.inicio)
  const fimAnterior = new Date(inicioAtual)
  fimAnterior.setDate(fimAnterior.getDate() - 1)

  if (periodo === 'hoje') {
    const iso = dataISO(fimAnterior)
    return { inicio: iso, fim: iso, rotulo: 'ontem' }
  }

  if (periodo === 'semana') {
    const inicioAnterior = new Date(fimAnterior)
    inicioAnterior.setDate(inicioAnterior.getDate() - 6)
    return { inicio: dataISO(inicioAnterior), fim: dataISO(fimAnterior), rotulo: 'vs sem. ant.' }
  }

  const chaveMesAnterior = `${fimAnterior.getFullYear()}-${String(fimAnterior.getMonth() + 1).padStart(2, '0')}`
  return {
    inicio: `${chaveMesAnterior}-01`,
    fim: ultimoDiaMes(chaveMesAnterior),
    rotulo: 'vs mês ant.',
  }
}

export function dentroDoIntervalo(data: string, intervalo: IntervaloDashboard) {
  return data >= intervalo.inicio && data <= intervalo.fim
}

export function ultimosMeses(hoje: string, quantidade = 12) {
  const referencia = dataLocal(`${chaveMesDaData(hoje)}-01`)
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(referencia)
    data.setMonth(data.getMonth() - (quantidade - 1 - indice))
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
  })
}
