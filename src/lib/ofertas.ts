import { supabase } from './supabase'
import type { Cliente } from './store'
import { FunctionsHttpError } from '@supabase/supabase-js'

type DbError = { message: string; code?: string }

function assertOk(error: DbError | null) {
  if (error) throw new Error(error.code ? `[${error.code}] ${error.message}` : error.message)
}

export type Oferta = {
  id: string
  nome: string
  titulo: string
  descricao: string
  imagemUrl?: string
  produtoIds: string[]
  descontoTipo: 'percentual' | 'valor' | 'preco_fixo' | 'sem_desconto'
  descontoValor: number
  validadeInicio?: string
  validadeFim?: string
  mensagemPadrao: string
  status: 'rascunho' | 'ativa' | 'encerrada'
  criadoEm: string
}

export type CampanhaWhatsApp = {
  id: string
  nome: string
  ofertaId?: string
  mensagem: string
  templateNome: string
  templateIdioma: string
  status: 'rascunho' | 'processando' | 'concluida' | 'concluida_parcial' | 'cancelada'
  totalDestinatarios: number
  totalEnviados: number
  totalEntregues: number
  totalLidos: number
  totalFalhas: number
  criadoEm: string
  modoSimples: boolean
}

export type EnvioSimplesWhatsApp = {
  id: string
  campanhaId: string
  clienteId: string
  nome: string
  telefone: string
  mensagem: string
  url: string
}

export type WhatsAppConfig = {
  phoneNumberId: string
  businessAccountId: string
  nomeExibicao: string
  templatePadrao: string
  idiomaTemplate: string
  ativo: boolean
  webhookVerificado: boolean
  statusConexao: 'desconectado' | 'conectando' | 'conectado' | 'erro'
  conectadoEm?: string
  ultimoErro?: string
}

type OfertaRow = Record<string, unknown>

export function normalizarTelefoneWhatsApp(value?: string) {
  const digits = (value || '').replace(/\D/g, '')
  if (!digits) return null
  const nacional = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits
  return /^\d{8,15}$/.test(nacional) ? `+${nacional}` : null
}

export function personalizarMensagem(texto: string, cliente: Pick<Cliente, 'nome'>, oferta?: Oferta) {
  const validade = oferta?.validadeFim
    ? new Date(oferta.validadeFim).toLocaleDateString('pt-BR')
    : 'enquanto durarem os estoques'
  return texto
    .replaceAll('{nome}', cliente.nome || 'cliente')
    .replaceAll('{oferta}', oferta?.titulo || oferta?.nome || 'oferta especial')
    .replaceAll('{descricao}', oferta?.descricao || '')
    .replaceAll('{validade}', validade)
}

export function montarMensagemSimples(texto: string, cliente: Pick<Cliente, 'nome'>, oferta?: Oferta) {
  const personalizada = personalizarMensagem(texto, cliente, oferta).trim()
  if (!oferta?.imagemUrl || personalizada.includes(oferta.imagemUrl)) return personalizada
  return `${personalizada}\n\nVeja a imagem da oferta: ${oferta.imagemUrl}`
}

export function criarLinkWhatsApp(telefone: string, mensagem: string) {
  const normalizado = normalizarTelefoneWhatsApp(telefone)
  if (!normalizado) throw new Error('Telefone inválido para o WhatsApp.')
  return `https://wa.me/${normalizado.slice(1)}?text=${encodeURIComponent(mensagem)}`
}

function mapOferta(row: OfertaRow): Oferta {
  return {
    id: String(row.id), nome: String(row.nome), titulo: String(row.titulo),
    descricao: String(row.descricao || ''), imagemUrl: row.imagem_url ? String(row.imagem_url) : undefined,
    produtoIds: (row.produto_ids || []) as string[], descontoTipo: row.desconto_tipo as Oferta['descontoTipo'],
    descontoValor: Number(row.desconto_valor || 0), validadeInicio: row.validade_inicio ? String(row.validade_inicio) : undefined,
    validadeFim: row.validade_fim ? String(row.validade_fim) : undefined,
    mensagemPadrao: String(row.mensagem_padrao || ''), status: row.status as Oferta['status'], criadoEm: String(row.criado_em),
  }
}

export async function carregarCentralOfertas(lojaId: string) {
  const [ofertasResult, campanhasResult, configResult] = await Promise.all([
    supabase.from('ofertas').select('*').eq('loja_id', lojaId).order('criado_em', { ascending: false }),
    supabase.from('campanhas_whatsapp').select('*').eq('loja_id', lojaId).order('criado_em', { ascending: false }).limit(50),
    supabase.from('whatsapp_configuracoes').select('*').eq('loja_id', lojaId).maybeSingle(),
  ])
  assertOk(ofertasResult.error); assertOk(campanhasResult.error); assertOk(configResult.error)
  return {
    ofertas: (ofertasResult.data || []).map(row => mapOferta(row as OfertaRow)),
    campanhas: (campanhasResult.data || []).map(row => ({
      id: String(row.id), nome: String(row.nome), ofertaId: row.oferta_id ? String(row.oferta_id) : undefined,
      mensagem: String(row.mensagem), templateNome: String(row.template_nome), templateIdioma: String(row.template_idioma),
      status: row.status as CampanhaWhatsApp['status'], totalDestinatarios: Number(row.total_destinatarios),
      totalEnviados: Number(row.total_enviados), totalEntregues: Number(row.total_entregues),
      totalLidos: Number(row.total_lidos), totalFalhas: Number(row.total_falhas), criadoEm: String(row.criado_em),
      modoSimples: String(row.template_nome) === 'modo_simples',
    })),
    config: configResult.data ? {
      phoneNumberId: configResult.data.phone_number_id ? String(configResult.data.phone_number_id) : '',
      businessAccountId: String(configResult.data.business_account_id || ''), nomeExibicao: String(configResult.data.nome_exibicao || ''),
      templatePadrao: String(configResult.data.template_padrao || ''), idiomaTemplate: String(configResult.data.idioma_template || 'pt_BR'),
      ativo: Boolean(configResult.data.ativo), webhookVerificado: Boolean(configResult.data.webhook_verificado),
      statusConexao: (configResult.data.status_conexao || 'desconectado') as WhatsAppConfig['statusConexao'],
      conectadoEm: configResult.data.conectado_em ? String(configResult.data.conectado_em) : undefined,
      ultimoErro: configResult.data.ultimo_erro ? String(configResult.data.ultimo_erro) : undefined,
    } satisfies WhatsAppConfig : null,
  }
}

export async function criarCampanhaSimples(args: {
  lojaId: string; nome: string; oferta?: Oferta; mensagem: string; clientes: Cliente[]
}) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Sessão expirada.')
  const destinatarios = args.clientes.map(cliente => ({ cliente, telefone: normalizarTelefoneWhatsApp(cliente.telefone) }))
    .filter((item): item is { cliente: Cliente; telefone: string } => Boolean(item.telefone && item.cliente.whatsappOptIn && !item.cliente.whatsappOptOutEm))
  if (!destinatarios.length) throw new Error('Selecione ao menos um cliente com telefone válido e consentimento de WhatsApp.')
  if (destinatarios.length > 50) throw new Error('Prepare no máximo 50 contatos por campanha.')

  const { data: campanha, error } = await supabase.from('campanhas_whatsapp').insert({
    loja_id: args.lojaId, oferta_id: args.oferta?.id || null, criado_por: userData.user.id,
    nome: args.nome.trim(), mensagem: args.mensagem.trim(), template_nome: 'modo_simples',
    template_idioma: 'pt_BR', status: 'concluida_parcial', iniciado_em: new Date().toISOString(),
    total_destinatarios: destinatarios.length,
  }).select('id').single()
  assertOk(error)
  if (!campanha) throw new Error('O Supabase não retornou o identificador da campanha.')

  const { data: rows, error: destinatarioError } = await supabase.from('campanha_destinatarios').insert(destinatarios.map(({ cliente, telefone }) => ({
    campanha_id: campanha.id, loja_id: args.lojaId, cliente_id: cliente.id, nome: cliente.nome, telefone_e164: telefone,
  }))).select('id,cliente_id,nome,telefone_e164')
  if (destinatarioError) {
    await supabase.from('campanhas_whatsapp').delete().eq('id', campanha.id)
    assertOk(destinatarioError)
  }

  return (rows || []).map(row => {
    const cliente = destinatarios.find(item => item.cliente.id === row.cliente_id)?.cliente
      || destinatarios.find(item => item.telefone === row.telefone_e164)?.cliente
    const mensagem = montarMensagemSimples(args.mensagem, cliente || { nome: row.nome }, args.oferta)
    return {
      id: String(row.id), campanhaId: String(campanha.id), clienteId: String(row.cliente_id || ''),
      nome: String(row.nome), telefone: String(row.telefone_e164), mensagem,
      url: criarLinkWhatsApp(String(row.telefone_e164), mensagem),
    } satisfies EnvioSimplesWhatsApp
  })
}

export async function retomarCampanhaSimples(campanhaId: string, ofertas: Oferta[]) {
  const [campanhaResult, destinatariosResult] = await Promise.all([
    supabase.from('campanhas_whatsapp').select('id,mensagem,oferta_id,template_nome').eq('id', campanhaId).single(),
    supabase.from('campanha_destinatarios').select('id,cliente_id,nome,telefone_e164').eq('campanha_id', campanhaId).eq('status', 'pendente').order('criado_em'),
  ])
  assertOk(campanhaResult.error); assertOk(destinatariosResult.error)
  const campanha = campanhaResult.data
  if (!campanha || campanha.template_nome !== 'modo_simples') throw new Error('Esta campanha não pertence ao modo simples.')
  const oferta = ofertas.find(item => item.id === campanha.oferta_id)
  return (destinatariosResult.data || []).map(row => {
    const mensagem = montarMensagemSimples(String(campanha.mensagem), { nome: String(row.nome) }, oferta)
    return {
      id: String(row.id), campanhaId: String(campanha.id), clienteId: String(row.cliente_id || ''),
      nome: String(row.nome), telefone: String(row.telefone_e164), mensagem,
      url: criarLinkWhatsApp(String(row.telefone_e164), mensagem),
    } satisfies EnvioSimplesWhatsApp
  })
}

async function totaisDaCampanhaSimples(campanhaId: string) {
  const { data, error } = await supabase.from('campanha_destinatarios').select('status').eq('campanha_id', campanhaId)
  assertOk(error)
  const status = (data || []).map(item => String(item.status))
  return {
    total: status.length,
    enviados: status.filter(item => ['enviado', 'entregue', 'lido'].includes(item)).length,
  }
}

export async function confirmarEnvioSimples(campanhaId: string, destinatarioId: string) {
  const { error } = await supabase.from('campanha_destinatarios').update({
    status: 'enviado', enviado_em: new Date().toISOString(), erro: null,
  }).eq('id', destinatarioId).eq('campanha_id', campanhaId)
  assertOk(error)
  const totais = await totaisDaCampanhaSimples(campanhaId)
  const { error: campanhaError } = await supabase.from('campanhas_whatsapp').update({
    total_enviados: totais.enviados,
  }).eq('id', campanhaId)
  assertOk(campanhaError)
  return totais
}

export async function concluirCampanhaSimples(campanhaId: string) {
  const totais = await totaisDaCampanhaSimples(campanhaId)
  const { error } = await supabase.from('campanhas_whatsapp').update({
    status: totais.enviados === totais.total ? 'concluida' : 'concluida_parcial',
    total_enviados: totais.enviados, total_falhas: 0, concluido_em: new Date().toISOString(),
  }).eq('id', campanhaId)
  assertOk(error)
  return totais
}

export async function uploadImagemOferta(file: File, lojaId: string) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem JPG, PNG ou WebP.')
  if (file.size > 6 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 6 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${lojaId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('ofertas').upload(path, file, { contentType: file.type, upsert: false })
  assertOk(error)
  return supabase.storage.from('ofertas').getPublicUrl(path).data.publicUrl
}

export async function salvarOferta(oferta: Omit<Oferta, 'id' | 'criadoEm'> & { id?: string }, lojaId: string) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Sessão expirada.')
  const payload = {
    loja_id: lojaId, nome: oferta.nome.trim(), titulo: oferta.titulo.trim(),
    descricao: oferta.descricao.trim(), imagem_url: oferta.imagemUrl || null, produto_ids: oferta.produtoIds,
    desconto_tipo: oferta.descontoTipo, desconto_valor: oferta.descontoValor,
    validade_inicio: oferta.validadeInicio || null, validade_fim: oferta.validadeFim || null,
    mensagem_padrao: oferta.mensagemPadrao.trim(), status: oferta.status,
  }
  const query = oferta.id
    ? supabase.from('ofertas').update(payload).eq('id', oferta.id).eq('loja_id', lojaId)
    : supabase.from('ofertas').insert({ ...payload, criado_por: userData.user.id })
  const { error } = await query
  assertOk(error)
}

export async function salvarConfigWhatsApp(config: WhatsAppConfig, lojaId: string) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Sessão expirada.')
  const { error } = await supabase.from('whatsapp_configuracoes').upsert({
    loja_id: lojaId, template_padrao: config.templatePadrao.trim() || null,
    idioma_template: config.idiomaTemplate.trim() || 'pt_BR', ativo: config.ativo,
    atualizado_por: userData.user.id,
  })
  assertOk(error)
}

export async function criarEEnviarCampanha(args: {
  lojaId: string; nome: string; oferta?: Oferta; mensagem: string; templateNome: string; templateIdioma: string; clientes: Cliente[]
}) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Sessão expirada.')
  const destinatarios = args.clientes.map(cliente => ({ cliente, telefone: normalizarTelefoneWhatsApp(cliente.telefone) }))
    .filter((item): item is { cliente: Cliente; telefone: string } => Boolean(item.telefone && item.cliente.whatsappOptIn && !item.cliente.whatsappOptOutEm))
  if (!destinatarios.length) throw new Error('Selecione ao menos um cliente com telefone válido e consentimento de WhatsApp.')
  if (destinatarios.length > 50) throw new Error('Envie no máximo 50 contatos por campanha nesta versão.')

  const { data: campanha, error } = await supabase.from('campanhas_whatsapp').insert({
    loja_id: args.lojaId, oferta_id: args.oferta?.id || null, criado_por: userData.user.id,
    nome: args.nome.trim(), mensagem: args.mensagem.trim(), template_nome: args.templateNome.trim(),
    template_idioma: args.templateIdioma.trim() || 'pt_BR', total_destinatarios: destinatarios.length,
  }).select('id').single()
  assertOk(error)
  if (!campanha) throw new Error('O Supabase não retornou o identificador da campanha.')
  const { error: destinatarioError } = await supabase.from('campanha_destinatarios').insert(destinatarios.map(({ cliente, telefone }) => ({
    campanha_id: campanha.id, loja_id: args.lojaId, cliente_id: cliente.id, nome: cliente.nome, telefone_e164: telefone,
  })))
  if (destinatarioError) {
    await supabase.from('campanhas_whatsapp').delete().eq('id', campanha.id)
    assertOk(destinatarioError)
  }

  const { data, error: invokeError } = await supabase.functions.invoke('whatsapp-campanha', { body: { campanhaId: campanha.id } })
  if (invokeError instanceof FunctionsHttpError) {
    const body = await invokeError.context.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || invokeError.message)
  }
  if (invokeError) throw new Error(invokeError.message || 'Não foi possível chamar o serviço do WhatsApp.')
  if (data?.error) throw new Error(String(data.error))
  return data as { enviados: number; falhas: number; pendentes: number }
}
