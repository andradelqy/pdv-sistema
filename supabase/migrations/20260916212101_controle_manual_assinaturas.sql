begin;

-- Controle comercial manual por loja. A permissão de uso pertence à loja,
-- enquanto public.perfis.role continua representando somente a função do
-- colaborador (owner, gerente, atendente ou entregador).
create table if not exists public.assinaturas_lojas (
  loja_id text primary key,
  nome_loja text not null,
  plano text not null default 'cortesia',
  status text not null default 'active'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  inicio_em timestamptz not null default now(),
  periodo_teste_ate timestamptz,
  acesso_ate timestamptz,
  carencia_ate timestamptz,
  mensagem_bloqueio text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (status <> 'trial' or periodo_teste_ate is not null),
  check (status <> 'past_due' or carencia_ate is not null)
);

comment on table public.assinaturas_lojas is
  'Liberação comercial manual do Órbita por loja; alterada apenas pelo operador da plataforma.';
comment on column public.assinaturas_lojas.status is
  'trial: teste; active: liberado; past_due: em carência; suspended/cancelled: bloqueado.';

alter table public.assinaturas_lojas enable row level security;
revoke all on public.assinaturas_lojas from anon, authenticated;
grant select on public.assinaturas_lojas to authenticated;
grant all on public.assinaturas_lojas to service_role;

-- Preserva o acesso das lojas que já existem ao aplicar a migration.
insert into public.assinaturas_lojas (loja_id, nome_loja, plano, status)
select distinct perfil.loja_id, perfil.loja_id, 'cortesia', 'active'
from public.perfis perfil
where perfil.loja_id is not null and btrim(perfil.loja_id) <> ''
on conflict (loja_id) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.atualizar_assinatura_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists assinaturas_lojas_atualizado_em on public.assinaturas_lojas;
create trigger assinaturas_lojas_atualizado_em
before update on public.assinaturas_lojas
for each row execute function private.atualizar_assinatura_em();

-- A função usa sempre a loja do usuário autenticado; não aceita um
-- loja_id arbitrário e, portanto, não revela o estado de outros clientes.
create or replace function private.assinatura_atual_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assinaturas_lojas assinatura
    where assinatura.loja_id = (select private.loja_atual())
      and (
        (assinatura.status = 'active'
          and (assinatura.acesso_ate is null or assinatura.acesso_ate >= now()))
        or (assinatura.status = 'trial'
          and assinatura.periodo_teste_ate >= now())
        or (assinatura.status = 'past_due'
          and assinatura.carencia_ate >= now())
      )
  )
$$;

revoke all on function private.atualizar_assinatura_em(), private.assinatura_atual_ativa()
  from public, anon;
grant execute on function private.assinatura_atual_ativa() to authenticated;

drop policy if exists "ler assinatura da propria loja" on public.assinaturas_lojas;
create policy "ler assinatura da propria loja"
on public.assinaturas_lojas for select to authenticated
using (loja_id = (select private.loja_atual()));

-- Política restritiva: ela não substitui as permissões funcionais existentes;
-- é somada a elas. Assim, o usuário precisa pertencer à loja, ter permissão
-- pelo seu papel e a assinatura da loja precisa estar válida.
do $$
declare
  tabela record;
begin
  for tabela in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'loja_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('perfis', 'assinaturas_lojas')
  loop
    execute format('alter table public.%I enable row level security', tabela.table_name);
    execute format('drop policy if exists "assinatura ativa da loja" on public.%I', tabela.table_name);
    execute format(
      'create policy "assinatura ativa da loja" on public.%I as restrictive for all to authenticated
       using (loja_id = (select private.loja_atual()) and (select private.assinatura_atual_ativa()))
       with check (loja_id = (select private.loja_atual()) and (select private.assinatura_atual_ativa()))',
      tabela.table_name
    );
  end loop;
end
$$;

commit;
