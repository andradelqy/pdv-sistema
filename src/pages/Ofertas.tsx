import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, Check, CheckCheck, Clock3, Copy, ExternalLink, ImagePlus, Loader2, Megaphone,
  MessageCircle, Package, Plus, RefreshCw, Search, Send, ShieldCheck, SkipForward,
  Tag, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore, type Cliente } from '../lib/store'
import { toast } from '../lib/toast'
import {
  carregarCentralOfertas, concluirCampanhaSimples, confirmarEnvioSimples, criarCampanhaSimples,
  normalizarTelefoneWhatsApp, personalizarMensagem, retomarCampanhaSimples, salvarOferta, uploadImagemOferta,
  type CampanhaWhatsApp, type EnvioSimplesWhatsApp, type Oferta,
} from '../lib/ofertas'

type Aba = 'campanha' | 'ofertas' | 'ajuda'

const mensagemInicial = 'Olá, {nome}! 🚀\n\n{oferta}\n{descricao}\n\nVálida até {validade}. Aproveite!'

const ofertaVazia = (): Omit<Oferta, 'id' | 'criadoEm'> => ({
  nome: '', titulo: '', descricao: '', produtoIds: [], descontoTipo: 'sem_desconto',
  descontoValor: 0, mensagemPadrao: mensagemInicial, status: 'rascunho',
})

function statusCampanha(status: CampanhaWhatsApp['status']) {
  const labels = { rascunho: 'Rascunho', processando: 'Em andamento', concluida: 'Concluída', concluida_parcial: 'Parcial', cancelada: 'Cancelada' }
  return labels[status]
}

function descontoDaOferta(oferta: Oferta) {
  if (oferta.descontoTipo === 'percentual') return `${oferta.descontoValor}% OFF`
  if (oferta.descontoTipo === 'valor') return `R$ ${oferta.descontoValor.toFixed(2).replace('.', ',')} de desconto`
  if (oferta.descontoTipo === 'preco_fixo') return `Por R$ ${oferta.descontoValor.toFixed(2).replace('.', ',')}`
  return 'Oferta especial'
}

export function Ofertas() {
  const { lojaId, clientes, produtos } = useStore()
  const [aba, setAba] = useState<Aba>('campanha')
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [campanhas, setCampanhas] = useState<CampanhaWhatsApp[]>([])
  const [nomeExibicao, setNomeExibicao] = useState('Sua loja')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalOferta, setModalOferta] = useState(false)
  const [formOferta, setFormOferta] = useState<Omit<Oferta, 'id' | 'criadoEm'> & { id?: string }>(ofertaVazia())
  const [imagemArquivo, setImagemArquivo] = useState<File | null>(null)
  const [salvandoOferta, setSalvandoOferta] = useState(false)
  const [buscaContato, setBuscaContato] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [ofertaId, setOfertaId] = useState('')
  const [nomeCampanha, setNomeCampanha] = useState('')
  const [mensagem, setMensagem] = useState(mensagemInicial)
  const [enviando, setEnviando] = useState(false)
  const [filaEnvios, setFilaEnvios] = useState<EnvioSimplesWhatsApp[]>([])
  const [indiceEnvio, setIndiceEnvio] = useState(0)
  const [whatsappAberto, setWhatsappAberto] = useState(false)
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const data = await carregarCentralOfertas(lojaId)
      setOfertas(data.ofertas); setCampanhas(data.campanhas)
      setNomeExibicao(data.config?.nomeExibicao || 'Sua loja')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar a central.')
    } finally { setCarregando(false) }
  }, [lojaId])

  useEffect(() => { void carregar() }, [carregar])

  const ofertaSelecionada = ofertas.find(oferta => oferta.id === ofertaId)
  const contatos = useMemo(() => clientes.filter(cliente => {
    const termo = buscaContato.toLowerCase().trim()
    return !termo || [cliente.nome, cliente.telefone, ...(cliente.tags || [])].some(valor => valor?.toLowerCase().includes(termo))
  }), [buscaContato, clientes])
  const elegiveis = useMemo(() => contatos.filter(cliente => cliente.whatsappOptIn && !cliente.whatsappOptOutEm && normalizarTelefoneWhatsApp(cliente.telefone)), [contatos])
  const selecionadosClientes = clientes.filter(cliente => selecionados.has(cliente.id))
  const contatoPreview = selecionadosClientes[0] || clientes[0] || ({ nome: 'Cliente' } as Cliente)
  const preview = personalizarMensagem(mensagem, contatoPreview, ofertaSelecionada)
  const enviados = campanhas.reduce((total, campanha) => total + campanha.totalEnviados, 0)
  const envioAtual = filaEnvios[indiceEnvio]

  function selecionarOferta(id: string) {
    setOfertaId(id)
    const oferta = ofertas.find(item => item.id === id)
    if (oferta) {
      setMensagem(oferta.mensagemPadrao || mensagemInicial)
      setNomeCampanha(oferta.nome)
    }
  }

  function alternarContato(id: string) {
    setSelecionados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  function selecionarTodos() {
    const ids = elegiveis.map(cliente => cliente.id)
    const todosMarcados = ids.every(id => selecionados.has(id))
    setSelecionados(atual => {
      const proximo = new Set(atual)
      ids.forEach(id => todosMarcados ? proximo.delete(id) : proximo.add(id))
      return proximo
    })
  }

  async function gravarOferta() {
    if (!formOferta.nome.trim() || !formOferta.titulo.trim()) return toast('Informe o nome interno e o título da oferta.', 'warning')
    setSalvandoOferta(true)
    try {
      let imagemUrl = formOferta.imagemUrl
      if (imagemArquivo) imagemUrl = await uploadImagemOferta(imagemArquivo, lojaId)
      await salvarOferta({ ...formOferta, imagemUrl }, lojaId)
      toast('Oferta salva com sucesso.', 'success'); setModalOferta(false); setImagemArquivo(null)
      await carregar()
    } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar oferta.', 'danger') }
    finally { setSalvandoOferta(false) }
  }

  async function enviarCampanha() {
    if (!nomeCampanha.trim() || !mensagem.trim()) return toast('Preencha o nome da campanha e a mensagem.', 'warning')
    if (!selecionadosClientes.length) return toast('Selecione pelo menos um contato autorizado.', 'warning')
    setEnviando(true)
    try {
      const fila = await criarCampanhaSimples({ lojaId, nome: nomeCampanha, oferta: ofertaSelecionada, mensagem, clientes: selecionadosClientes })
      setFilaEnvios(fila); setIndiceEnvio(0); setWhatsappAberto(false)
      toast(`${fila.length} mensagem(ns) preparada(s).`, 'success')
    } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao preparar a campanha.', 'danger') }
    finally { setEnviando(false) }
  }

  function abrirWhatsAppAtual() {
    if (!envioAtual) return
    window.open(envioAtual.url, '_blank', 'noopener,noreferrer')
    setWhatsappAberto(true)
  }

  async function copiarMensagemAtual() {
    if (!envioAtual) return
    try {
      await navigator.clipboard.writeText(envioAtual.mensagem)
      toast('Mensagem copiada.', 'success')
    } catch { toast('Não foi possível copiar a mensagem.', 'danger') }
  }

  async function finalizarFila(mensagemFinal: string) {
    const campanhaId = filaEnvios[0]?.campanhaId
    if (campanhaId) await concluirCampanhaSimples(campanhaId)
    setFilaEnvios([]); setIndiceEnvio(0); setWhatsappAberto(false); setSelecionados(new Set())
    await carregar(); toast(mensagemFinal, 'success')
  }

  async function confirmarEAvancar() {
    if (!envioAtual) return
    setConfirmandoEnvio(true)
    try {
      await confirmarEnvioSimples(envioAtual.campanhaId, envioAtual.id)
      if (indiceEnvio >= filaEnvios.length - 1) await finalizarFila('Campanha finalizada e salva no histórico.')
      else { setIndiceEnvio(atual => atual + 1); setWhatsappAberto(false) }
    } catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível registrar o envio.', 'danger') }
    finally { setConfirmandoEnvio(false) }
  }

  async function pularEnvio() {
    if (indiceEnvio >= filaEnvios.length - 1) {
      setConfirmandoEnvio(true)
      try { await finalizarFila('Campanha encerrada. Os contatos pulados ficaram como pendentes.') }
      catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível encerrar a campanha.', 'danger') }
      finally { setConfirmandoEnvio(false) }
    } else { setIndiceEnvio(atual => atual + 1); setWhatsappAberto(false) }
  }

  async function encerrarFila() {
    setConfirmandoEnvio(true)
    try { await finalizarFila('Progresso registrado. Os contatos não enviados ficaram pendentes.') }
    catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível salvar o progresso.', 'danger') }
    finally { setConfirmandoEnvio(false) }
  }

  async function retomarCampanha(campanhaId: string) {
    setEnviando(true)
    try {
      const fila = await retomarCampanhaSimples(campanhaId, ofertas)
      if (!fila.length) return toast('Esta campanha não possui contatos pendentes.', 'warning')
      setFilaEnvios(fila); setIndiceEnvio(0); setWhatsappAberto(false)
    } catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível retomar a campanha.', 'danger') }
    finally { setEnviando(false) }
  }

  if (carregando) return <div className="grid min-h-72 place-items-center"><Loader2 className="animate-spin text-primary" /></div>
  if (erro) return <div className="mx-auto max-w-xl card-adega p-6 text-center"><Megaphone className="mx-auto mb-3 text-destructive" /><h2 className="font-bold">Central indisponível</h2><p className="mt-2 text-sm text-muted-foreground">{erro}</p><p className="mt-3 text-xs text-muted-foreground">Aplique a migration da Central de Ofertas no Supabase e tente novamente.</p><button onClick={() => void carregar()} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Tentar novamente</button></div>

  return <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600"><Megaphone size={19} /></span><h2 className="text-xl font-bold">Central de ofertas</h2></div><p className="mt-1 text-sm text-muted-foreground">Crie campanhas e envie mensagens personalizadas pelo seu WhatsApp, sem configuração técnica.</p></div>
      <button onClick={() => { setFormOferta(ofertaVazia()); setImagemArquivo(null); setModalOferta(true) }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm"><Plus size={16} /> Nova oferta</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([
        [Tag, 'Ofertas ativas', ofertas.filter(o => o.status === 'ativa').length, 'Campanhas disponíveis'],
        [Users, 'Contatos autorizados', clientes.filter(c => c.whatsappOptIn && !c.whatsappOptOutEm && normalizarTelefoneWhatsApp(c.telefone)).length, `${clientes.length} no CRM`],
        [Send, 'Mensagens enviadas', enviados, `${campanhas.length} campanhas`],
        [CheckCheck, 'Modo atual', 'Simples', 'Sem API ou mensalidade'],
      ] as [LucideIcon, string, string | number, string][]).map(([Icon, label, valor, detalhe]) => <div key={label} className="card-adega flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></span><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="text-xl font-bold">{valor}</p><p className="text-[11px] text-muted-foreground">{detalhe}</p></div></div>)}
    </div>

    <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
      {([['campanha', MessageCircle, 'Montar campanha'], ['ofertas', Tag, 'Ofertas'], ['ajuda', ShieldCheck, 'Como enviar']] as [Aba, typeof Tag, string][]).map(([id, Icon, label]) => <button key={id} onClick={() => setAba(id)} className={`inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${aba === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Icon size={15} /> {label}</button>)}
    </div>

    {aba === 'campanha' && <>
      <div className="grid min-h-[590px] overflow-hidden rounded-2xl border border-border bg-card xl:grid-cols-[320px_minmax(360px,1fr)_380px]">
        <section className="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
          <div className="border-b border-border p-4"><div className="flex items-center justify-between"><div><h3 className="font-bold">Contatos</h3><p className="text-xs text-muted-foreground">{selecionados.size} selecionado(s), máximo 50</p></div><button onClick={selecionarTodos} className="text-xs font-semibold text-primary">{elegiveis.every(c => selecionados.has(c.id)) && elegiveis.length ? 'Limpar' : 'Selecionar aptos'}</button></div><div className="relative mt-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={buscaContato} onChange={e => setBuscaContato(e.target.value)} placeholder="Nome, telefone ou tag" className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm" /></div></div>
          <div className="max-h-[500px] flex-1 overflow-y-auto p-2">{contatos.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p> : contatos.map(cliente => {
            const telefone = normalizarTelefoneWhatsApp(cliente.telefone)
            const apto = Boolean(cliente.whatsappOptIn && !cliente.whatsappOptOutEm && telefone)
            return <button key={cliente.id} disabled={!apto} onClick={() => alternarContato(cliente.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selecionados.has(cliente.id) ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-muted/70'} disabled:cursor-not-allowed disabled:opacity-55`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white">{cliente.nome.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{cliente.nome}</strong><span className="block truncate text-xs text-muted-foreground">{telefone || 'Telefone inválido'}</span><span className={`mt-1 inline-block text-[10px] ${apto ? 'text-emerald-600' : 'text-amber-600'}`}>{apto ? 'Autorizado para ofertas' : 'Sem consentimento'}</span></span><span className={`grid h-5 w-5 place-items-center rounded-full border ${selecionados.has(cliente.id) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`}>{selecionados.has(cliente.id) && <Check size={12} />}</span></button>
          })}</div>
        </section>

        <section className="flex flex-col bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_45%)] p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Prévia da conversa</h3><p className="text-xs text-muted-foreground">Personalizada para {contatoPreview.nome}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600"><ShieldCheck size={12} /> Modo simples</span></div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-[#efeae2] shadow-xl dark:border-slate-700 dark:bg-[#0b141a]">
            <div className="flex items-center gap-3 bg-[#075e54] p-3 text-white"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 font-bold">O</span><div><p className="text-sm font-semibold">{nomeExibicao}</p><p className="text-[10px] text-white/70">conta comercial</p></div></div>
            <div className="flex-1 overflow-y-auto p-4"><div className="ml-auto max-w-[88%] overflow-hidden rounded-xl rounded-tr-sm bg-[#d9fdd3] text-slate-900 shadow-sm dark:bg-[#005c4b] dark:text-white">{ofertaSelecionada?.imagemUrl && <img src={ofertaSelecionada.imagemUrl} alt="Oferta" className="h-48 w-full object-cover" />}<p className="whitespace-pre-wrap p-3 text-sm leading-5">{preview || 'Sua mensagem aparecerá aqui.'}</p><p className="px-3 pb-2 text-right text-[10px] opacity-60">agora <CheckCheck className="ml-1 inline text-sky-500" size={13} /></p></div></div>
          </div>
        </section>

        <section className="border-t border-border p-5 xl:border-l xl:border-t-0"><h3 className="font-bold">Configurar envio</h3><p className="mb-4 text-xs text-muted-foreground">O Órbita abrirá uma conversa por vez com a mensagem preenchida.</p><div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oferta<select value={ofertaId} onChange={e => selecionarOferta(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case"><option value="">Campanha sem oferta vinculada</option>{ofertas.filter(o => o.status !== 'encerrada').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome da campanha<input value={nomeCampanha} onChange={e => setNomeCampanha(e.target.value)} placeholder="Ex.: Especial de fim de semana" className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagem<textarea rows={7} maxLength={1024} value={mensagem} onChange={e => setMensagem(e.target.value)} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /><span className="mt-1 block text-[10px] font-normal normal-case">Variáveis: {'{nome}'}, {'{oferta}'}, {'{descricao}'}, {'{validade}'}</span></label>
          <button onClick={() => void enviarCampanha()} disabled={enviando || !selecionados.size} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Preparar {selecionados.size} mensagem(ns)</button>
          <p className="text-[11px] leading-4 text-muted-foreground">Você confirma cada envio no próprio WhatsApp. Imagens são incluídas como link público na mensagem. Somente contatos com consentimento podem ser selecionados.</p>
        </div></section>
      </div>

      <div className="card-adega overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h3 className="font-bold">Histórico de campanhas</h3><p className="text-xs text-muted-foreground">No modo simples, “enviada” significa confirmação manual do operador.</p></div><button onClick={() => void carregar()} title="Atualizar" className="rounded-lg p-2 hover:bg-muted"><RefreshCw size={15} /></button></div><div className="overflow-x-auto"><table className="tbl-adega"><thead><tr><th>Campanha</th><th>Modo</th><th>Status</th><th>Público</th><th>Confirmadas</th><th>Pendentes</th><th>Criada em</th><th></th></tr></thead><tbody>{campanhas.length ? campanhas.map(c => { const pendentes = Math.max(0, c.totalDestinatarios - c.totalEnviados - c.totalFalhas); return <tr key={c.id}><td className="font-semibold">{c.nome}</td><td><span className="badge-adega badge-secondary">{c.modoSimples ? 'Simples' : 'API'}</span></td><td><span className={`badge-adega ${c.status === 'concluida' ? 'badge-success' : c.status === 'concluida_parcial' ? 'badge-warning' : 'badge-info'}`}>{statusCampanha(c.status)}</span></td><td>{c.totalDestinatarios}</td><td>{c.totalEnviados}</td><td>{pendentes}</td><td>{new Date(c.criadoEm).toLocaleString('pt-BR')}</td><td>{c.modoSimples && pendentes > 0 && <button onClick={() => void retomarCampanha(c.id)} disabled={enviando} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Continuar</button>}</td></tr> }) : <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma campanha enviada.</td></tr>}</tbody></table></div></div>
    </>}

    {aba === 'ofertas' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ofertas.length ? ofertas.map(oferta => <article key={oferta.id} className="card-adega overflow-hidden"><div className="relative h-48 bg-muted">{oferta.imagemUrl ? <img src={oferta.imagemUrl} alt={oferta.titulo} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted-foreground"><ImagePlus size={32} /></div>}<span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-bold text-white">{descontoDaOferta(oferta)}</span></div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{oferta.nome}</p><h3 className="mt-1 font-bold">{oferta.titulo}</h3></div><span className={`badge-adega ${oferta.status === 'ativa' ? 'badge-success' : oferta.status === 'encerrada' ? 'badge-secondary' : 'badge-warning'}`}>{oferta.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{oferta.descricao || 'Sem descrição.'}</p><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Package size={13} /> {oferta.produtoIds.length} produto(s)</span><span className="inline-flex items-center gap-1"><Clock3 size={13} /> {oferta.validadeFim ? `até ${new Date(oferta.validadeFim).toLocaleDateString('pt-BR')}` : 'sem validade'}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => { setOfertaId(oferta.id); selecionarOferta(oferta.id); setAba('campanha') }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Criar campanha</button><button onClick={() => { setFormOferta({ ...oferta }); setImagemArquivo(null); setModalOferta(true) }} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">Editar</button></div></div></article>) : <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center"><Tag className="mx-auto text-muted-foreground" /><h3 className="mt-3 font-bold">Crie sua primeira oferta</h3><p className="mt-1 text-sm text-muted-foreground">Associe produtos, imagem, desconto, validade e mensagem.</p></div>}</div>}

    {aba === 'ajuda' && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="card-adega p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600"><MessageCircle /></span><div><h3 className="font-bold">Modo simples ativo</h3><p className="text-xs text-muted-foreground">Funciona com WhatsApp comum ou Business, sem API, chave ou aprovação da Meta.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{[
        ['1', 'Escolha os contatos', 'Somente clientes com telefone válido e consentimento aparecem como aptos.'],
        ['2', 'Monte a mensagem', 'Use as variáveis para personalizar automaticamente o nome, oferta e validade.'],
        ['3', 'Abra cada conversa', 'O Órbita abre o WhatsApp com destinatário e texto já preenchidos.'],
        ['4', 'Confirme o envio', 'Depois de enviar no WhatsApp, confirme no Órbita para atualizar o histórico.'],
      ].map(([numero, titulo, descricao]) => <div key={numero} className="rounded-2xl border border-border p-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{numero}</span><h4 className="mt-3 font-bold">{titulo}</h4><p className="mt-1 text-sm text-muted-foreground">{descricao}</p></div>)}</div></div>
      <aside className="card-adega p-5"><h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="text-emerald-600" size={18} /> Transparência do modo simples</h3><ul className="mt-4 space-y-4 text-sm"><li className="flex gap-3"><BadgeCheck className="shrink-0 text-primary" size={17} /><span>Não exige CNPJ, token, plugin ou mensalidade.</span></li><li className="flex gap-3"><BadgeCheck className="shrink-0 text-primary" size={17} /><span>Não envia nada sem uma ação explícita do operador.</span></li><li className="flex gap-3"><BadgeCheck className="shrink-0 text-primary" size={17} /><span>A imagem da oferta é adicionada como link na mensagem.</span></li><li className="flex gap-3"><BadgeCheck className="shrink-0 text-primary" size={17} /><span>Entrega e leitura não podem ser verificadas automaticamente.</span></li></ul><div className="mt-5 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">Evite mensagens excessivas. Respeite o consentimento e pedidos de descadastro dos clientes.</div></aside>
    </div>}

    {envioAtual && <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"><div className="card-adega my-6 w-full max-w-xl overflow-hidden bg-background"><div className="flex items-start justify-between border-b border-border p-5"><div><span className="text-xs font-semibold uppercase tracking-wide text-primary">Mensagem {indiceEnvio + 1} de {filaEnvios.length}</span><h3 className="mt-1 text-lg font-bold">Enviar para {envioAtual.nome}</h3><p className="text-sm text-muted-foreground">{envioAtual.telefone}</p></div><button onClick={() => void encerrarFila()} disabled={confirmandoEnvio} title="Encerrar e registrar progresso" className="rounded-lg p-2 hover:bg-muted disabled:opacity-50"><X size={18} /></button></div><div className="p-5"><div className="mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${((indiceEnvio + 1) / filaEnvios.length) * 100}%` }} /></div><div className="rounded-2xl bg-[#efeae2] p-4 dark:bg-[#0b141a]"><div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[#d9fdd3] p-3 text-sm leading-5 text-slate-900 shadow-sm dark:bg-[#005c4b] dark:text-white">{envioAtual.mensagem}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => void copiarMensagemAtual()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><Copy size={16} /> Copiar mensagem</button><button onClick={abrirWhatsAppAtual} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"><ExternalLink size={16} /> Abrir no WhatsApp</button></div>{whatsappAberto && <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-center text-xs text-emerald-700 dark:text-emerald-300">Depois de tocar em enviar no WhatsApp, volte ao Órbita e confirme abaixo.</div>}</div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-5"><button onClick={() => void pularEnvio()} disabled={confirmandoEnvio} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><SkipForward size={16} /> Pular contato</button><button onClick={() => void confirmarEAvancar()} disabled={!whatsappAberto || confirmandoEnvio} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{confirmandoEnvio ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Já enviei, continuar</button></div></div></div>}

    {modalOferta && <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"><div className="card-adega my-6 w-full max-w-3xl overflow-hidden bg-background"><div className="flex items-center justify-between border-b border-border p-5"><div><h3 className="text-lg font-bold">{formOferta.id ? 'Editar oferta' : 'Nova oferta'}</h3><p className="text-xs text-muted-foreground">Conteúdo que será reutilizado nas campanhas.</p></div><button onClick={() => setModalOferta(false)} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div><div className="grid gap-5 p-5 md:grid-cols-2"><div className="space-y-4"><label className="block text-xs font-semibold uppercase text-muted-foreground">Nome interno *<input value={formOferta.nome} onChange={e => setFormOferta(f => ({ ...f, nome: e.target.value }))} placeholder="Especial de sábado" className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Título para o cliente *<input value={formOferta.titulo} onChange={e => setFormOferta(f => ({ ...f, titulo: e.target.value }))} placeholder="Combo em dobro" className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Descrição<textarea rows={4} value={formOferta.descricao} onChange={e => setFormOferta(f => ({ ...f, descricao: e.target.value }))} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImagemArquivo(e.target.files?.[0] || null)} className="mt-1.5 w-full rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm font-normal normal-case" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold uppercase text-muted-foreground">Tipo<select value={formOferta.descontoTipo} onChange={e => setFormOferta(f => ({ ...f, descontoTipo: e.target.value as Oferta['descontoTipo'] }))} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case"><option value="sem_desconto">Sem valor explícito</option><option value="percentual">Percentual</option><option value="valor">Valor de desconto</option><option value="preco_fixo">Preço promocional</option></select></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Valor<input type="number" min="0" step="0.01" disabled={formOferta.descontoTipo === 'sem_desconto'} value={formOferta.descontoValor} onChange={e => setFormOferta(f => ({ ...f, descontoValor: Number(e.target.value) }))} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case disabled:opacity-50" /></label></div></div><div className="space-y-4"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Produtos vinculados</p><div className="mt-1.5 max-h-36 overflow-y-auto rounded-xl border border-border p-2">{produtos.map(produto => <label key={produto.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted"><input type="checkbox" checked={formOferta.produtoIds.includes(produto.id)} onChange={e => setFormOferta(f => ({ ...f, produtoIds: e.target.checked ? [...f.produtoIds, produto.id] : f.produtoIds.filter(id => id !== produto.id) }))} className="accent-primary" /> <span className="flex-1">{produto.nome}</span><span className="text-xs text-muted-foreground">R$ {produto.precoVenda.toFixed(2)}</span></label>)}</div></div><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold uppercase text-muted-foreground">Início<input type="datetime-local" value={formOferta.validadeInicio?.slice(0, 16) || ''} onChange={e => setFormOferta(f => ({ ...f, validadeInicio: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Fim<input type="datetime-local" value={formOferta.validadeFim?.slice(0, 16) || ''} onChange={e => setFormOferta(f => ({ ...f, validadeFim: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label></div><label className="block text-xs font-semibold uppercase text-muted-foreground">Mensagem padrão<textarea rows={5} maxLength={1024} value={formOferta.mensagemPadrao} onChange={e => setFormOferta(f => ({ ...f, mensagemPadrao: e.target.value }))} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted-foreground">Status<select value={formOferta.status} onChange={e => setFormOferta(f => ({ ...f, status: e.target.value as Oferta['status'] }))} className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal normal-case"><option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option></select></label></div></div><div className="flex justify-end gap-2 border-t border-border p-5"><button onClick={() => setModalOferta(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancelar</button><button onClick={() => void gravarOferta()} disabled={salvandoOferta} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{salvandoOferta && <Loader2 size={15} className="animate-spin" />} Salvar oferta</button></div></div></div>}
  </div>
}
