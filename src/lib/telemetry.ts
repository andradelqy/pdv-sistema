import { supabase } from './supabase'

type TelemetryContext = {
  lojaId?: string
  userId?: string
}

type ErrorDetails = {
  origem: string
  mensagem: string
  stack?: string
  contexto?: Record<string, unknown>
}

let currentContext: TelemetryContext = {}
let installing = false

export function configurarContextoTelemetry(context: TelemetryContext) {
  currentContext = { ...context }
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[telefone]')
    .replace(/(?:eyJ|sbp_)[A-Za-z0-9._-]+/g, '[credencial]')
    .slice(0, maxLength)
}

function fingerprint(details: Pick<ErrorDetails, 'origem' | 'mensagem'>) {
  const value = `${details.origem}:${details.mensagem}`
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}

/**
 * Registra apenas diagnóstico técnico. Dados de formulário, carrinho, cliente,
 * endereço, sessão e credenciais nunca são enviados no contexto.
 */
export async function registrarErroAplicacao(details: ErrorDetails) {
  if (!currentContext.lojaId || !currentContext.userId) return
  const mensagem = sanitizeText(details.mensagem, 1000) || 'Erro sem mensagem'
  const origem = sanitizeText(details.origem, 120) || 'aplicacao'
  const contexto = {
    rota: window.location.pathname,
    online: navigator.onLine,
    userAgent: navigator.userAgent.slice(0, 250),
    stack: details.stack ? sanitizeText(details.stack, 3000) : undefined,
    ...details.contexto,
  }
  const { error } = await supabase.from('erros_aplicacao').insert({
    loja_id: currentContext.lojaId,
    usuario_id: currentContext.userId,
    fingerprint: fingerprint({ origem, mensagem }),
    origem,
    mensagem,
    contexto,
    versao: __APP_VERSION__,
  })
  if (error && import.meta.env.DEV) console.warn('[telemetry] falha ao registrar erro', error.message)
}

export function instalarCapturaGlobalDeErros() {
  if (installing) return () => undefined
  installing = true

  const onError = (event: ErrorEvent) => {
    void registrarErroAplicacao({
      origem: 'window.error',
      mensagem: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      contexto: { arquivo: event.filename?.split('/').pop(), linha: event.lineno, coluna: event.colno },
    })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    void registrarErroAplicacao({
      origem: 'unhandledrejection',
      mensagem: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    installing = false
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

