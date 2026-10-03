import { Check, Crown, MessageCircle, Sparkles } from 'lucide-react';
import type { AssinaturaLoja } from '../lib/assinatura';
import { configuracaoDoPlano, PLANOS } from '../lib/plans';

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Planos({ assinatura }: { assinatura?: AssinaturaLoja }) {
  const atual = configuracaoDoPlano(assinatura?.plano);
  const telefone = String(import.meta.env.VITE_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
  const email = String(import.meta.env.VITE_SUPPORT_EMAIL || 'orbitapdv@gmail.com');
  const texto = encodeURIComponent(`Olá! Quero conversar sobre o plano Órbita ${atual.nome}.`);
  const contato = telefone ? `https://wa.me/${telefone}?text=${texto}` : `mailto:${email}?subject=Plano%20Órbita`;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <section className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-background to-blue-500/10 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
              <Sparkles size={14} /> Assinatura da loja
            </div>
            <h2 className="text-2xl font-bold md:text-3xl">Plano atual: {atual.nome}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {atual.descricao} A assinatura pertence à loja; todos os colaboradores consomem o mesmo limite.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 px-5 py-4 text-right shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Limite da equipe</p>
            <p className="mt-1 text-2xl font-bold">{atual.limiteUsuarios} usuários</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {Object.values(PLANOS).map(plano => {
          const selecionado = plano.id === atual.id;
          return (
            <article key={plano.id} className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${plano.destaque ? 'border-cyan-500 ring-1 ring-cyan-500/30' : 'border-border'} ${selecionado ? 'bg-cyan-500/[0.04]' : 'bg-card'}`}>
              {plano.destaque && <span className="absolute -top-3 left-6 rounded-full bg-cyan-600 px-3 py-1 text-xs font-bold text-white">Mais escolhido</span>}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold">{plano.nome}</h3>
                {selecionado && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Seu plano</span>}
              </div>
              <p className="mt-4"><strong className="text-3xl">{moeda(plano.precoMensal)}</strong><span className="text-sm text-muted-foreground">/mês</span></p>
              {plano.precoAnualMensal && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{moeda(plano.precoAnualMensal)}/mês no anual</p>}
              <p className="mt-4 min-h-10 text-sm text-muted-foreground">{plano.descricao}</p>
              <ul className="mt-5 flex-1 space-y-3">
                {plano.recursos.map(recurso => <li key={recurso} className="flex gap-2 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-cyan-600" /><span>{recurso}</span></li>)}
              </ul>
              <a href={contato} target={contato.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${selecionado ? 'border border-border text-muted-foreground' : 'bg-primary text-primary-foreground hover:opacity-90'}`}>
                {selecionado ? <Crown size={17} /> : <MessageCircle size={17} />}
                {selecionado ? 'Plano contratado' : 'Falar sobre este plano'}
              </a>
            </article>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        A ativação e a troca de plano são feitas manualmente pela equipe Órbita. Nenhuma cobrança é realizada automaticamente nesta versão.
      </p>
    </div>
  );
}
