begin;

-- Consentimento explícito para campanhas de marketing no WhatsApp.
alter table public.clientes
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_em timestamptz,
  add column if not exists whatsapp_opt_out_em timestamptz;

create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null,
  criado_por uuid not null references auth.users(id),
  nome text not null check (char_length(btrim(nome)) between 2 and 100),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 120),
  descricao text not null default '',
  imagem_url text,
  produto_ids text[] not null default '{}',
  desconto_tipo text not null default 'sem_desconto'
    check (desconto_tipo in ('percentual', 'valor', 'preco_fixo', 'sem_desconto')),
  desconto_valor numeric(12,2) not null default 0 check (desconto_valor >= 0),
  validade_inicio timestamptz,
  validade_fim timestamptz,
  mensagem_padrao text not null default '',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativa', 'encerrada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (validade_fim is null or validade_inicio is null or validade_fim > validade_inicio)
);

create table if not exists public.whatsapp_configuracoes (
  loja_id text primary key,
  phone_number_id text not null,
  business_account_id text,
  nome_exibicao text,
  template_padrao text,
  idioma_template text not null default 'pt_BR',
  ativo boolean not null default true,
  webhook_verificado boolean not null default false,
  atualizado_por uuid not null references auth.users(id),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.campanhas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null,
  oferta_id uuid references public.ofertas(id) on delete set null,
  criado_por uuid not null references auth.users(id),
  nome text not null check (char_length(btrim(nome)) between 2 and 100),
  mensagem text not null check (char_length(btrim(mensagem)) between 2 and 4096),
  template_nome text not null,
  template_idioma text not null default 'pt_BR',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'processando', 'concluida', 'concluida_parcial', 'cancelada')),
  total_destinatarios integer not null default 0 check (total_destinatarios >= 0),
  total_enviados integer not null default 0 check (total_enviados >= 0),
  total_entregues integer not null default 0 check (total_entregues >= 0),
  total_lidos integer not null default 0 check (total_lidos >= 0),
  total_falhas integer not null default 0 check (total_falhas >= 0),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.campanha_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas_whatsapp(id) on delete cascade,
  loja_id text not null,
  cliente_id text references public.clientes(id) on delete set null,
  nome text not null,
  telefone_e164 text not null check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou', 'opt_out')),
  whatsapp_message_id text,
  erro text,
  enviado_em timestamptz,
  entregue_em timestamptz,
  lido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (campanha_id, telefone_e164)
);

create index if not exists ofertas_loja_status_idx
  on public.ofertas (loja_id, status, criado_em desc);
create index if not exists campanhas_whatsapp_loja_status_idx
  on public.campanhas_whatsapp (loja_id, status, criado_em desc);
create index if not exists campanhas_whatsapp_oferta_idx
  on public.campanhas_whatsapp (oferta_id) where oferta_id is not null;
create index if not exists campanha_destinatarios_campanha_status_idx
  on public.campanha_destinatarios (campanha_id, status);
create index if not exists campanha_destinatarios_loja_telefone_idx
  on public.campanha_destinatarios (loja_id, telefone_e164);
create index if not exists campanha_destinatarios_cliente_idx
  on public.campanha_destinatarios (cliente_id) where cliente_id is not null;

create or replace function private.atualizar_timestamp_ofertas()
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

drop trigger if exists ofertas_atualizado_em on public.ofertas;
create trigger ofertas_atualizado_em before update on public.ofertas
for each row execute function private.atualizar_timestamp_ofertas();
drop trigger if exists campanhas_whatsapp_atualizado_em on public.campanhas_whatsapp;
create trigger campanhas_whatsapp_atualizado_em before update on public.campanhas_whatsapp
for each row execute function private.atualizar_timestamp_ofertas();
drop trigger if exists whatsapp_configuracoes_atualizado_em on public.whatsapp_configuracoes;
create trigger whatsapp_configuracoes_atualizado_em before update on public.whatsapp_configuracoes
for each row execute function private.atualizar_timestamp_ofertas();

alter table public.ofertas enable row level security;
alter table public.whatsapp_configuracoes enable row level security;
alter table public.campanhas_whatsapp enable row level security;
alter table public.campanha_destinatarios enable row level security;

revoke all on public.ofertas, public.whatsapp_configuracoes,
  public.campanhas_whatsapp, public.campanha_destinatarios from anon;
grant select, insert, update, delete on public.ofertas,
  public.campanhas_whatsapp, public.campanha_destinatarios to authenticated;
grant select, insert, update on public.whatsapp_configuracoes to authenticated;

drop policy if exists "gestao administra ofertas" on public.ofertas;
drop policy if exists "gestao le ofertas" on public.ofertas;
drop policy if exists "gestao cria ofertas" on public.ofertas;
drop policy if exists "gestao atualiza ofertas" on public.ofertas;
drop policy if exists "gestao remove ofertas" on public.ofertas;
create policy "gestao le ofertas" on public.ofertas for select to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao cria ofertas" on public.ofertas for insert to authenticated
with check (
  loja_id = (select private.loja_atual())
  and criado_por = (select auth.uid())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao atualiza ofertas" on public.ofertas for update to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
)
with check (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao remove ofertas" on public.ofertas for delete to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);

drop policy if exists "gestao configura whatsapp" on public.whatsapp_configuracoes;
create policy "gestao configura whatsapp" on public.whatsapp_configuracoes for all to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
)
with check (
  loja_id = (select private.loja_atual())
  and atualizado_por = (select auth.uid())
  and (select private.papel_atual()) in ('owner', 'gerente')
);

drop policy if exists "gestao administra campanhas" on public.campanhas_whatsapp;
drop policy if exists "gestao le campanhas" on public.campanhas_whatsapp;
drop policy if exists "gestao cria campanhas" on public.campanhas_whatsapp;
drop policy if exists "gestao atualiza campanhas" on public.campanhas_whatsapp;
drop policy if exists "gestao remove campanhas" on public.campanhas_whatsapp;
create policy "gestao le campanhas" on public.campanhas_whatsapp for select to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao cria campanhas" on public.campanhas_whatsapp for insert to authenticated
with check (
  loja_id = (select private.loja_atual())
  and criado_por = (select auth.uid())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao atualiza campanhas" on public.campanhas_whatsapp for update to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
)
with check (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
create policy "gestao remove campanhas" on public.campanhas_whatsapp for delete to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);

drop policy if exists "gestao administra destinatarios" on public.campanha_destinatarios;
create policy "gestao administra destinatarios" on public.campanha_destinatarios for all to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
)
with check (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
  and exists (
    select 1 from public.campanhas_whatsapp campanha
    where campanha.id = campanha_destinatarios.campanha_id
      and campanha.loja_id = campanha_destinatarios.loja_id
  )
);

-- Imagens promocionais são públicas porque a Meta precisa buscá-las pela URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ofertas', 'ofertas', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gestao envia imagens de ofertas" on storage.objects;
create policy "gestao envia imagens de ofertas" on storage.objects for insert to authenticated
with check (
  bucket_id = 'ofertas'
  and (storage.foldername(name))[1] = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
drop policy if exists "gestao altera imagens de ofertas" on storage.objects;
create policy "gestao altera imagens de ofertas" on storage.objects for update to authenticated
using (
  bucket_id = 'ofertas'
  and (storage.foldername(name))[1] = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
)
with check (
  bucket_id = 'ofertas'
  and (storage.foldername(name))[1] = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);
drop policy if exists "gestao remove imagens de ofertas" on storage.objects;
create policy "gestao remove imagens de ofertas" on storage.objects for delete to authenticated
using (
  bucket_id = 'ofertas'
  and (storage.foldername(name))[1] = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);

commit;
