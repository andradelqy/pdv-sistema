// src/lib/dateBR.ts
// Helpers de data sempre em America/Sao_Paulo (BRT, UTC-3, sem DST).
// Substituem `new Date().toISOString().split('T')[0]` que usava UTC
// e fazia o dia virar às 21h BRT (no horário de Brasília).

const TZ = 'America/Sao_Paulo'

function fmtBRT(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: TZ }).format(date)
}

// "YYYY-MM-DD" do dia atual em BRT.
export function hojeBRT(d: Date = new Date()): string {
  return fmtBRT(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ISO string preservando o instante real (sem trocar timezone).
export function agoraISO(d: Date = new Date()): string {
  return d.toISOString()
}

// YYYY-MM-DD a partir de qualquer ISO string, já convertido pra BRT.
export function isoParaDataBRT(iso: string): string {
  if (!iso) return ''
  return fmtBRT(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// Corta N dias atrás em BRT (para filtros tipo "últimos 7 dias").
export function cortarDataBRT(dias: number, ref: Date = new Date()): string {
  const d = new Date(ref)
  d.setDate(d.getDate() - Number(dias))
  return hojeBRT(d)
}

// "HH:mm" em BRT, útil pra UI.
export function horaBRT(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(date)
}
