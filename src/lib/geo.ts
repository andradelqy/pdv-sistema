export function interpretarCoordenada(valor: string | number | null | undefined) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined
  const texto = String(valor ?? '').trim().replace(',', '.')
  if (!texto) return undefined
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : undefined
}

export function validarCoordenadas(lat?: number, lng?: number): string | null {
  if (lat == null || lng == null) return 'Informe a latitude e a longitude da loja.'
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'A latitude deve estar entre -90 e 90.'
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'A longitude deve estar entre -180 e 180.'
  return null
}
