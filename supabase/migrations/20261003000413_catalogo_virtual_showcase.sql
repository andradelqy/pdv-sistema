begin;

-- Catálogo Virtual: camada de publicação sobre o estoque interno. Nenhuma
-- informação de custo, fornecedor ou inteligência de compras é exposta.
create table public.catalogos (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null unique,
  slug text not null unique,
  nome text not null check (char_length(btrim(nome)) between 2 and 100),
  descricao text check (descricao is null or char_length(descricao) <= 1000),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'publicado', 'pausado')),
  logo_path text,
  banner_path text,
  cor_primaria text not null default '#0891b2'
    check (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_secundaria text not null default '#0b2545'
    check (cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  telefone_whatsapp text,
  mostrar_precos boolean not null default true,
  modo_estoque text not null default 'status'
    check (modo_estoque in ('oculto', 'status', 'quantidade')),
  novos_produtos_visiveis boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint catalogos_slug_formato_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint catalogos_slug_reservado_check
    check (slug not in ('admin','api','app','login','suporte','catalogo','termos','privacidade')),
  unique (id, loja_id)
);

create table public.catalogo_categorias (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null,
  loja_id text not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  imagem_path text,
  visivel boolean not null default true,
  ordem integer not null default 0 check (ordem >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint catalogo_categorias_catalogo_fkey
    foreign key (catalogo_id, loja_id) references public.catalogos(id, loja_id) on delete cascade,
  unique (catalogo_id, slug),
  unique (id, catalogo_id, loja_id)
);

-- Necessário para garantir no próprio FK que produto e catálogo pertencem ao
-- mesmo tenant; não altera a chave primária atual de produtos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'produtos_id_loja_unique'
      and conrelid = 'public.produtos'::regclass
  ) then
    alter table public.produtos
      add constraint produtos_id_loja_unique unique (id, loja_id);
  end if;
end
$$;

create table public.catalogo_produtos (
  catalogo_id uuid not null,
  loja_id text not null,
  produto_id text not null,
  categoria_id uuid,
  visivel boolean not null default false,
  destaque boolean not null default false,
  ordem integer not null default 0 check (ordem >= 0),
  nome_publico text check (nome_publico is null or char_length(btrim(nome_publico)) between 1 and 120),
  descricao_publica text check (descricao_publica is null or char_length(descricao_publica) <= 1500),
  preco_publico numeric(12,2) check (preco_publico is null or preco_publico >= 0),
  imagem_principal_path text,
  exibir_sem_estoque boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (catalogo_id, produto_id),
  constraint catalogo_produtos_catalogo_fkey
    foreign key (catalogo_id, loja_id) references public.catalogos(id, loja_id) on delete cascade,
  constraint catalogo_produtos_produto_fkey
    foreign key (produto_id, loja_id) references public.produtos(id, loja_id) on delete cascade,
  constraint catalogo_produtos_categoria_fkey
    foreign key (categoria_id, catalogo_id, loja_id)
      references public.catalogo_categorias(id, catalogo_id, loja_id)
      on delete set null (categoria_id)
);

create table public.catalogo_produto_imagens (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null,
  loja_id text not null,
  produto_id text not null,
  storage_path text not null,
  texto_alternativo text check (texto_alternativo is null or char_length(texto_alternativo) <= 160),
  ordem integer not null default 0 check (ordem >= 0),
  criado_em timestamptz not null default now(),
  constraint catalogo_imagens_item_fkey
    foreign key (catalogo_id, produto_id)
      references public.catalogo_produtos(catalogo_id, produto_id) on delete cascade,
  constraint catalogo_imagens_catalogo_fkey
    foreign key (catalogo_id, loja_id) references public.catalogos(id, loja_id) on delete cascade,
  unique (catalogo_id, produto_id, storage_path)
);

-- Mantém a opção "publicar produtos novos" realmente automática. A vitrine
-- continua opt-in por padrão; somente catálogos que ativarem a opção recebem
-- itens novos já visíveis.
create or replace function private.sincronizar_produtos_catalogo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'catalogos' then
    if new.novos_produtos_visiveis then
      insert into public.catalogo_produtos
        (catalogo_id, loja_id, produto_id, visivel, ordem)
      select new.id, new.loja_id, produto.id, true,
        row_number() over (order by produto.nome, produto.id)::integer - 1
      from public.produtos as produto
      where produto.loja_id = new.loja_id
      on conflict (catalogo_id, produto_id) do nothing;
    end if;
  elsif tg_table_name = 'produtos' then
    insert into public.catalogo_produtos
      (catalogo_id, loja_id, produto_id, visivel, ordem)
    select catalogo.id, catalogo.loja_id, new.id, true,
      coalesce((select max(item.ordem) + 1 from public.catalogo_produtos as item
                where item.catalogo_id = catalogo.id), 0)
    from public.catalogos as catalogo
    where catalogo.loja_id = new.loja_id
      and catalogo.novos_produtos_visiveis
    on conflict (catalogo_id, produto_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger catalogos_sincroniza_produtos
after insert or update of novos_produtos_visiveis on public.catalogos
for each row execute function private.sincronizar_produtos_catalogo();

create trigger produtos_sincroniza_catalogo
after insert on public.produtos
for each row execute function private.sincronizar_produtos_catalogo();

create index catalogo_categorias_ordem_idx
  on public.catalogo_categorias (catalogo_id, visivel, ordem, id);
create index catalogo_produtos_publicos_idx
  on public.catalogo_produtos (catalogo_id, ordem, produto_id)
  where visivel;
create index catalogo_produtos_produto_idx
  on public.catalogo_produtos (produto_id, loja_id);
create index catalogo_produtos_categoria_idx
  on public.catalogo_produtos (categoria_id, ordem)
  where categoria_id is not null;
create index catalogo_imagens_produto_idx
  on public.catalogo_produto_imagens (catalogo_id, produto_id, ordem);

create or replace function private.atualizar_timestamp_catalogo()
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

create trigger catalogos_atualizado_em
before update on public.catalogos
for each row execute function private.atualizar_timestamp_catalogo();
create trigger catalogo_categorias_atualizado_em
before update on public.catalogo_categorias
for each row execute function private.atualizar_timestamp_catalogo();
create trigger catalogo_produtos_atualizado_em
before update on public.catalogo_produtos
for each row execute function private.atualizar_timestamp_catalogo();

-- Helper fechado: valida identidade, tenant, papel, assinatura e plano.
create or replace function private.pode_gerir_catalogo(p_loja_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_loja_id = (select private.loja_atual())
    and (select private.papel_atual()) in ('owner', 'gerente')
    and (select private.assinatura_atual_ativa())
    and (select private.recurso_avancado_liberado())
$$;

revoke all on function private.atualizar_timestamp_catalogo(),
  private.sincronizar_produtos_catalogo(),
  private.pode_gerir_catalogo(text)
from public, anon, authenticated;
grant execute on function private.pode_gerir_catalogo(text) to authenticated;

alter table public.catalogos enable row level security;
alter table public.catalogo_categorias enable row level security;
alter table public.catalogo_produtos enable row level security;
alter table public.catalogo_produto_imagens enable row level security;

revoke all on public.catalogos, public.catalogo_categorias,
  public.catalogo_produtos, public.catalogo_produto_imagens
from public, anon, authenticated;
grant select, insert, update, delete on public.catalogos,
  public.catalogo_categorias, public.catalogo_produtos,
  public.catalogo_produto_imagens to authenticated;
grant all on public.catalogos, public.catalogo_categorias,
  public.catalogo_produtos, public.catalogo_produto_imagens to service_role;

create policy "gestao consulta catalogos da loja"
on public.catalogos for select to authenticated
using ((select private.pode_gerir_catalogo(loja_id)));
create policy "gestao cria catalogo da loja"
on public.catalogos for insert to authenticated
with check ((select private.pode_gerir_catalogo(loja_id)));
create policy "gestao atualiza catalogo da loja"
on public.catalogos for update to authenticated
using ((select private.pode_gerir_catalogo(loja_id)))
with check ((select private.pode_gerir_catalogo(loja_id)));
create policy "gestao remove catalogo da loja"
on public.catalogos for delete to authenticated
using ((select private.pode_gerir_catalogo(loja_id)));

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['catalogo_categorias','catalogo_produtos','catalogo_produto_imagens'] loop
    execute format(
      'create policy "gestao consulta %1$s da loja" on public.%1$I for select to authenticated
       using ((select private.pode_gerir_catalogo(loja_id)))', v_tabela);
    execute format(
      'create policy "gestao cria %1$s da loja" on public.%1$I for insert to authenticated
       with check ((select private.pode_gerir_catalogo(loja_id)))', v_tabela);
    execute format(
      'create policy "gestao atualiza %1$s da loja" on public.%1$I for update to authenticated
       using ((select private.pode_gerir_catalogo(loja_id)))
       with check ((select private.pode_gerir_catalogo(loja_id)))', v_tabela);
    execute format(
      'create policy "gestao remove %1$s da loja" on public.%1$I for delete to authenticated
       using ((select private.pode_gerir_catalogo(loja_id)))', v_tabela);
  end loop;
end
$$;

-- Bucket público apenas para leitura dos arquivos publicados. Escrita e
-- listagem administrativas continuam limitadas por policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogos', 'catalogos', true, 5242880,
  array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gestao lista imagens catalogo" on storage.objects;
drop policy if exists "gestao envia imagens catalogo" on storage.objects;
drop policy if exists "gestao altera imagens catalogo" on storage.objects;
drop policy if exists "gestao remove imagens catalogo" on storage.objects;

create policy "gestao lista imagens catalogo"
on storage.objects for select to authenticated
using (
  bucket_id = 'catalogos'
  and (select private.pode_gerir_catalogo((storage.foldername(name))[1]))
);
create policy "gestao envia imagens catalogo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalogos'
  and (select private.pode_gerir_catalogo((storage.foldername(name))[1]))
);
create policy "gestao altera imagens catalogo"
on storage.objects for update to authenticated
using (
  bucket_id = 'catalogos'
  and (select private.pode_gerir_catalogo((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'catalogos'
  and (select private.pode_gerir_catalogo((storage.foldername(name))[1]))
);
create policy "gestao remove imagens catalogo"
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalogos'
  and (select private.pode_gerir_catalogo((storage.foldername(name))[1]))
);

commit;
