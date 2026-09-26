function dataLocalISO(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function dataISOValida(valor?: string | null) {
  const texto = String(valor ?? '').trim()
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!correspondencia) return null

  const ano = Number(correspondencia[1])
  const mes = Number(correspondencia[2])
  const dia = Number(correspondencia[3])
  const candidata = new Date(Date.UTC(ano, mes - 1, dia))
  return candidata.getUTCFullYear() === ano
    && candidata.getUTCMonth() === mes - 1
    && candidata.getUTCDate() === dia
    ? texto
    : null
}

/**
 * Garante uma data comercial válida antes de enviá-la a colunas `date`.
 * Itens antigos da fila offline podem conter uma string vazia.
 */
export function dataISOValidaOuHoje(valor?: string | null, agora = new Date()) {
  return dataISOValida(valor) ?? dataLocalISO(agora)
}

/** Datas opcionais vazias ou inválidas devem chegar ao Postgres como NULL. */
export function dataISOValidaOuNula(valor?: string | null) {
  return dataISOValida(valor)
}

/** Garante um timestamp ISO válido antes de gravá-lo no Supabase. */
export function timestampISOValidoOuAgora(valor?: string | null, agora = new Date()) {
  const texto = String(valor ?? '').trim()
  return texto && Number.isFinite(Date.parse(texto)) ? texto : agora.toISOString()
}

/** Timestamps opcionais vazios ou inválidos devem chegar ao Postgres como NULL. */
export function timestampISOValidoOuNulo(valor?: string | null) {
  const texto = String(valor ?? '').trim()
  return texto && Number.isFinite(Date.parse(texto)) ? texto : null
}
