import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

type ConfiguracaoPublica = { appId: string; configId: string; graphVersion: string }
type SessaoMeta = { businessAccountId: string; phoneNumberId: string; metaBusinessId?: string }

type FacebookLoginResponse = {
  authResponse?: { code?: string }
  status?: string
}

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void
}

declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void }
}

let sdkPromise: Promise<void> | null = null
let configPromise: Promise<ConfiguracaoPublica> | null = null

async function erroDaFuncao(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null) as { error?: string } | null
    return body?.error || error.message
  }
  return error instanceof Error ? error.message : 'Falha ao acessar o serviço do WhatsApp.'
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-conectar', { body })
  if (error) throw new Error(await erroDaFuncao(error))
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

function carregarFacebookSdk() {
  if (window.FB) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = resolve
    const existente = document.getElementById('facebook-jssdk')
    if (existente) return
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    script.onerror = () => reject(new Error('Não foi possível carregar a conexão segura da Meta.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

export async function prepararWhatsAppEmbedded() {
  configPromise ||= invocar<ConfiguracaoPublica>({ acao: 'configuracao_publica' })
  const [config] = await Promise.all([configPromise, carregarFacebookSdk()])
  if (!window.FB) throw new Error('O serviço de login da Meta não foi inicializado.')
  window.FB.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.graphVersion })
  return config
}

function dadosDaSessao(data: unknown): SessaoMeta | null {
  let payload = data
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch { return null }
  }
  if (!payload || typeof payload !== 'object') return null
  const event = payload as { type?: string; event?: string; data?: Record<string, unknown> }
  if (event.type !== 'WA_EMBEDDED_SIGNUP' || !event.data) return null
  if (event.event === 'CANCEL' || event.event === 'ERROR') return null
  const phoneNumberId = String(event.data.phone_number_id || (event.data.phone_number_ids as string[] | undefined)?.[0] || '')
  const businessAccountId = String(event.data.waba_id || event.data.business_account_id || '')
  if (!phoneNumberId || !businessAccountId) return null
  return {
    phoneNumberId,
    businessAccountId,
    metaBusinessId: event.data.business_id ? String(event.data.business_id) : undefined,
  }
}

export async function conectarWhatsAppEmbedded(pinRegistro: string) {
  if (!/^\d{6}$/.test(pinRegistro)) throw new Error('Crie um PIN numérico de 6 dígitos.')
  const config = await prepararWhatsAppEmbedded()
  if (!window.FB) throw new Error('O serviço de login da Meta não está disponível.')

  const resultado = await new Promise<{ codigo: string; sessao: SessaoMeta }>((resolve, reject) => {
    let codigo = ''
    let sessao: SessaoMeta | null = null
    let encerrado = false
    const concluir = () => {
      if (!encerrado && codigo && sessao) {
        encerrado = true
        limpar()
        resolve({ codigo, sessao })
      }
    }
    const listener = (event: MessageEvent) => {
      try {
        const origin = new URL(event.origin)
        if (origin.protocol !== 'https:' || !(origin.hostname === 'facebook.com' || origin.hostname.endsWith('.facebook.com'))) return
      } catch { return }
      const recebida = dadosDaSessao(event.data)
      if (recebida) { sessao = recebida; concluir() }
    }
    const timeout = window.setTimeout(() => {
      if (encerrado) return
      encerrado = true
      limpar()
      reject(new Error('A conexão com a Meta expirou. Tente novamente.'))
    }, 5 * 60 * 1000)
    const limpar = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', listener)
    }
    window.addEventListener('message', listener)
    window.FB!.login(response => {
      codigo = response.authResponse?.code || ''
      if (!codigo) {
        encerrado = true
        limpar()
        reject(new Error(response.status === 'not_authorized'
          ? 'A autorização da Meta foi cancelada.'
          : 'A Meta não retornou o código de autorização.'))
        return
      }
      concluir()
    }, {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
      extras: { setup: {}, feature: 'whatsapp_embedded_signup' },
    })
  })

  return invocar<{ ok: boolean; nomeExibicao: string; telefone?: string }>({
    acao: 'trocar_codigo',
    codigo: resultado.codigo,
    businessAccountId: resultado.sessao.businessAccountId,
    phoneNumberId: resultado.sessao.phoneNumberId,
    metaBusinessId: resultado.sessao.metaBusinessId,
    pinRegistro,
  })
}

export async function desconectarWhatsApp() {
  await invocar<{ ok: boolean }>({ acao: 'desconectar' })
}
