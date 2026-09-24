begin;

-- A identificação pública permanece visível à gestão da loja. O token da Meta
-- fica em uma tabela separada, sem qualquer acesso pelos papéis do navegador.
alter table public.whatsapp_configuracoes
  alter column phone_number_id drop not null,
  add column if not exists status_conexao text not null default 'desconectado',
  add column if not exists meta_business_id text,
  add column if not exists conectado_em timestamptz,
  add column if not exists ultimo_erro text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_configuracoes_status_conexao_check'
      and conrelid = 'public.whatsapp_configuracoes'::regclass
  ) then
    alter table public.whatsapp_configuracoes
      add constraint whatsapp_configuracoes_status_conexao_check
      check (status_conexao in ('desconectado', 'conectando', 'conectado', 'erro'));
  end if;
end $$;

create table if not exists public.whatsapp_credenciais (
  loja_id text primary key,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  token_expira_em timestamptz,
  business_account_id text not null,
  phone_number_id text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists whatsapp_credenciais_atualizado_em on public.whatsapp_credenciais;
create trigger whatsapp_credenciais_atualizado_em
before update on public.whatsapp_credenciais
for each row execute function private.atualizar_timestamp_ofertas();

alter table public.whatsapp_credenciais enable row level security;
alter table public.whatsapp_credenciais force row level security;

-- Nem owner nem gerente acessam o token pelo PostgREST. Somente as Edge
-- Functions, usando o cliente administrativo no servidor, leem esta tabela.
revoke all on public.whatsapp_credenciais from public, anon, authenticated;
grant all on public.whatsapp_credenciais to service_role;

comment on table public.whatsapp_credenciais is
  'Tokens por loja criptografados pela Edge Function. Nunca expor ao cliente.';
comment on column public.whatsapp_credenciais.access_token_ciphertext is
  'Access token da Meta cifrado com AES-GCM; a chave vive nos Secrets do Supabase.';

commit;
