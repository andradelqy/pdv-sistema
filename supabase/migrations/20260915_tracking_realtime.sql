-- Complemento do rastreamento: histórico de rota, RLS e atualizações Realtime.
-- Execute este arquivo no SQL Editor para instalações que já aplicaram a migração anterior.
begin;

create table if not exists public.rastreio_pontos (
  id bigserial primary key,
  loja_id text not null,
  entregador_id uuid not null references auth.users(id) on delete cascade,
  entrega_id text references public.entregas(id) on delete set null,
  lat numeric not null check (lat between -90 and 90),
  lng numeric not null check (lng between -180 and 180),
  precisao_m numeric,
  criado_em timestamptz not null default now()
);

create index if not exists rastreio_pontos_entrega_criado_idx on public.rastreio_pontos(loja_id, entrega_id, criado_em desc);
create index if not exists rastreio_pontos_entregador_criado_idx on public.rastreio_pontos(loja_id, entregador_id, criado_em desc);

alter table public.rastreio_pontos enable row level security;
revoke all on public.rastreio_pontos from anon;
grant select, insert on public.rastreio_pontos to authenticated;
grant usage, select on sequence public.rastreio_pontos_id_seq to authenticated;

drop policy if exists "ler historico da loja" on public.rastreio_pontos;
drop policy if exists "publicar proprio ponto" on public.rastreio_pontos;
create policy "ler historico da loja" on public.rastreio_pontos for select to authenticated
  using (loja_id in (select loja_id from public.perfis where id = (select auth.uid())));
create policy "publicar proprio ponto" on public.rastreio_pontos for insert to authenticated
  with check (
    entregador_id = (select auth.uid())
    and loja_id in (select loja_id from public.perfis where id = (select auth.uid()))
  );

-- O mapa recebe cada nova posição instantaneamente. A consulta periódica do
-- cliente continua como fallback caso Realtime esteja indisponível.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rastreio_entregadores'
  ) then
    alter publication supabase_realtime add table public.rastreio_entregadores;
  end if;
end $$;

commit;
