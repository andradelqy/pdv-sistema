begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Implementações privilegiadas de entrega precisam furar RLS para manter cada
-- transição atômica, mas não devem ficar diretamente expostas pela Data API.
-- Os wrappers públicos permanecem SECURITY INVOKER e conservam as assinaturas
-- consumidas pelo frontend.
do $$
begin
  if to_regprocedure('private.transicionar_entrega_atomica_impl_v2(text,text,jsonb)') is null
     and to_regprocedure('public.transicionar_entrega_atomica(text,text,jsonb)') is not null then
    alter function public.transicionar_entrega_atomica(text,text,jsonb) set schema private;
    alter function private.transicionar_entrega_atomica(text,text,jsonb)
      rename to transicionar_entrega_atomica_impl_v2;
  end if;

  if to_regprocedure('private.listar_entregas_entregador_impl_v2()') is null
     and to_regprocedure('public.listar_entregas_entregador()') is not null then
    alter function public.listar_entregas_entregador() set schema private;
    alter function private.listar_entregas_entregador()
      rename to listar_entregas_entregador_impl_v2;
  end if;

  if to_regprocedure('private.publicar_localizacao_entrega_impl_v2(text,numeric,numeric,numeric,uuid)') is null
     and to_regprocedure('public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid)') is not null then
    alter function public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid) set schema private;
    alter function private.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid)
      rename to publicar_localizacao_entrega_impl_v2;
  end if;
end
$$;

revoke all on function private.transicionar_entrega_atomica_impl_v2(text,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.transicionar_entrega_atomica_impl_v2(text,text,jsonb)
  to authenticated, service_role;

revoke all on function private.listar_entregas_entregador_impl_v2()
  from public, anon, authenticated;
grant execute on function private.listar_entregas_entregador_impl_v2()
  to authenticated, service_role;

revoke all on function private.publicar_localizacao_entrega_impl_v2(text,numeric,numeric,numeric,uuid)
  from public, anon, authenticated;
grant execute on function private.publicar_localizacao_entrega_impl_v2(text,numeric,numeric,numeric,uuid)
  to authenticated, service_role;

create or replace function public.transicionar_entrega_atomica(
  p_entrega_id text,
  p_novo_status text,
  p_detalhes jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.transicionar_entrega_atomica_impl_v2(
    p_entrega_id, p_novo_status, p_detalhes
  )
$$;

create or replace function public.listar_entregas_entregador()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.listar_entregas_entregador_impl_v2()
$$;

create or replace function public.publicar_localizacao_entrega(
  p_entrega_id text,
  p_lat numeric,
  p_lng numeric,
  p_precisao_m numeric,
  p_cliente_evento_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.publicar_localizacao_entrega_impl_v2(
    p_entrega_id, p_lat, p_lng, p_precisao_m, p_cliente_evento_id
  )
$$;

revoke all on function public.transicionar_entrega_atomica(text,text,jsonb),
  public.listar_entregas_entregador(),
  public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid)
from public, anon;
grant execute on function public.transicionar_entrega_atomica(text,text,jsonb),
  public.listar_entregas_entregador(),
  public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid)
to authenticated, service_role;

-- A policy FOR ALL também conta como SELECT e duplicava a policy de leitura.
-- Separamos as mutações para que cada ação avalie uma única policy permissiva.
drop policy if exists "gestao altera configuracao entregas" on public.config_entregas;
drop policy if exists "gestao cria configuracao entregas" on public.config_entregas;
drop policy if exists "gestao atualiza configuracao entregas" on public.config_entregas;
drop policy if exists "gestao remove configuracao entregas" on public.config_entregas;

create policy "gestao cria configuracao entregas"
on public.config_entregas for insert to authenticated
with check (
  loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
  and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
);

create policy "gestao atualiza configuracao entregas"
on public.config_entregas for update to authenticated
using (
  loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
  and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
)
with check (
  loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
  and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
);

create policy "gestao remove configuracao entregas"
on public.config_entregas for delete to authenticated
using (
  loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
  and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
);

commit;
