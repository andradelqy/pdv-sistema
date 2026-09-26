import type { AuthChangeEvent } from '@supabase/supabase-js'

/**
 * O Supabase pode emitir SIGNED_IN novamente quando uma sessão existente é
 * reestabelecida. Recarregar todo o contexto nesse caso desmonta formulários.
 */
export function deveRecarregarContextoDaSessao(
  evento: AuthChangeEvent,
  usuarioCarregadoId: string | null,
  proximoUsuarioId: string | null,
) {
  if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return false
  if (evento === 'SIGNED_OUT') return true
  if (evento === 'USER_UPDATED') return true
  return Boolean(proximoUsuarioId && proximoUsuarioId !== usuarioCarregadoId)
}
