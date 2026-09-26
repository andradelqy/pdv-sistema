import type { Venda } from './store'

function timestampVenda(venda: Venda) {
  const criadoEm = Date.parse(venda.criadoEm)
  if (Number.isFinite(criadoEm)) return criadoEm
  const data = Date.parse(`${venda.data}T00:00:00`)
  return Number.isFinite(data) ? data : 0
}

/** Ordenação determinística: horário real, data comercial e id, do mais novo para o mais antigo. */
export function ordenarVendasRecentes(vendas: Venda[]) {
  return [...vendas].sort((a, b) =>
    timestampVenda(b) - timestampVenda(a)
    || b.data.localeCompare(a.data)
    || b.id.localeCompare(a.id),
  )
}

export function formatarDataHoraVenda(venda: Venda) {
  const criadoEm = Date.parse(venda.criadoEm)
  if (Number.isFinite(criadoEm)) {
    return new Date(criadoEm).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }
  return new Date(`${venda.data}T12:00:00`).toLocaleDateString('pt-BR')
}
