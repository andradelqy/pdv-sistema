begin;

alter table public.catalogos
  add column if not exists idioma_padrao text not null default 'pt-BR',
  add column if not exists idiomas_ativos text[] not null default array['pt-BR']::text[],
  add column if not exists pedido_minimo numeric(12,2) not null default 0,
  add column if not exists taxa_entrega numeric(12,2) not null default 0,
  add column if not exists regioes_entrega text[] not null default '{}'::text[],
  add column if not exists formas_pagamento text[] not null default array['pix','dinheiro','cartao']::text[],
  add column if not exists dias_funcionamento smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  add column if not exists horario_abertura time,
  add column if not exists horario_fechamento time,
  add column if not exists fuso_horario text not null default 'America/Sao_Paulo',
  add column if not exists mensagem_fechado text,
  add column if not exists prazo_entrega_min integer,
  add column if not exists prazo_entrega_max integer,
  add column if not exists limite_estoque_baixo integer not null default 3,
  add column if not exists seo_titulo text,
  add column if not exists seo_descricao text,
  add column if not exists instagram_url text,
  add column if not exists dominio_personalizado text,
  add column if not exists banner_mobile_path text,
  add column if not exists mostrar_ofertas boolean not null default true;

alter table public.catalogo_categorias
  add column if not exists nome_es text,
  add column if not exists nome_en text,
  add column if not exists descricao_es text,
  add column if not exists descricao_en text;

alter table public.catalogo_produtos
  add column if not exists nome_publico_es text,
  add column if not exists nome_publico_en text,
  add column if not exists descricao_publica_es text,
  add column if not exists descricao_publica_en text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalogos_idiomas_check') then
    alter table public.catalogos add constraint catalogos_idiomas_check check (
      idioma_padrao = any(idiomas_ativos)
      and idiomas_ativos <@ array['pt-BR','es','en']::text[]
      and cardinality(idiomas_ativos) between 1 and 3
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogos_comercial_valores_check') then
    alter table public.catalogos add constraint catalogos_comercial_valores_check check (
      pedido_minimo >= 0 and taxa_entrega >= 0 and limite_estoque_baixo >= 0
      and (prazo_entrega_min is null or prazo_entrega_min >= 0)
      and (prazo_entrega_max is null or prazo_entrega_max >= coalesce(prazo_entrega_min, 0))
      and dias_funcionamento <@ array[0,1,2,3,4,5,6]::smallint[]
    );
  end if;
end
$$;

create table public.catalogo_eventos (
  id bigint generated always as identity primary key,
  catalogo_id uuid not null,
  loja_id text not null,
  tipo text not null check (tipo in (
    'visita','produto_visualizado','adicionado_carrinho','removido_carrinho',
    'whatsapp','compartilhamento','busca'
  )),
  produto_id text,
  sessao_hash text not null check (char_length(sessao_hash) = 64),
  origem text check (origem is null or char_length(origem) <= 300),
  idioma text not null default 'pt-BR' check (idioma in ('pt-BR','es','en')),
  criado_em timestamptz not null default now(),
  constraint catalogo_eventos_catalogo_fkey
    foreign key (catalogo_id, loja_id)
      references public.catalogos(id, loja_id) on delete cascade
);

create index catalogo_eventos_gestao_idx
  on public.catalogo_eventos (loja_id, criado_em desc);
create index catalogo_eventos_catalogo_tipo_idx
  on public.catalogo_eventos (catalogo_id, tipo, criado_em desc);
create index catalogo_eventos_produto_idx
  on public.catalogo_eventos (catalogo_id, produto_id, criado_em desc)
  where produto_id is not null;
create index catalogo_eventos_limite_idx
  on public.catalogo_eventos (catalogo_id, sessao_hash, criado_em desc);

alter table public.catalogo_eventos enable row level security;
revoke all on public.catalogo_eventos from public, anon, authenticated;
grant select, delete on public.catalogo_eventos to authenticated;
grant all on public.catalogo_eventos to service_role;

create policy "gestao consulta metricas catalogo da loja"
on public.catalogo_eventos for select to authenticated
using ((select private.pode_gerir_catalogo(loja_id)));

create policy "gestao remove metricas catalogo da loja"
on public.catalogo_eventos for delete to authenticated
using ((select private.pode_gerir_catalogo(loja_id)));

create or replace function public.metricas_catalogo(
  p_catalogo_id uuid,
  p_dias integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with periodo as (
    select * from public.catalogo_eventos evento
    where evento.catalogo_id = p_catalogo_id
      and evento.criado_em >= now() - make_interval(days => greatest(1, least(p_dias, 365)))
  ), totais as (
    select
      count(*) filter (where tipo = 'visita') as visitas,
      count(distinct sessao_hash) filter (where tipo = 'visita') as visitantes,
      count(*) filter (where tipo = 'produto_visualizado') as visualizacoes,
      count(*) filter (where tipo = 'adicionado_carrinho') as carrinho,
      count(*) filter (where tipo = 'whatsapp') as whatsapp,
      count(*) filter (where tipo = 'compartilhamento') as compartilhamentos
    from periodo
  ), ranking as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'produtoId', produto_id, 'total', total
    ) order by total desc), '[]'::jsonb) as produtos
    from (
      select produto_id, count(*) as total
      from periodo
      where tipo = 'produto_visualizado' and produto_id is not null
      group by produto_id
      order by total desc
      limit 10
    ) lista
  )
  select jsonb_build_object(
    'periodoDias', greatest(1, least(p_dias, 365)),
    'visitas', totais.visitas,
    'visitantes', totais.visitantes,
    'visualizacoesProdutos', totais.visualizacoes,
    'adicoesCarrinho', totais.carrinho,
    'cliquesWhatsapp', totais.whatsapp,
    'compartilhamentos', totais.compartilhamentos,
    'conversaoWhatsapp', case when totais.visitas > 0
      then round((totais.whatsapp::numeric / totais.visitas::numeric) * 100, 2)
      else 0 end,
    'produtosMaisVistos', ranking.produtos
  )
  from totais cross join ranking
$$;

revoke all on function public.metricas_catalogo(uuid, integer) from public, anon, authenticated;
grant execute on function public.metricas_catalogo(uuid, integer) to authenticated;

commit;
