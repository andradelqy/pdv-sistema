-- Atualiza instalações existentes para sincronização por loja.
-- Execute pelo Supabase CLI ou pelo SQL Editor antes de publicar esta versão.
begin;

alter table public.produtos add column if not exists loja_id text;
alter table public.movimentacoes add column if not exists loja_id text;
alter table public.clientes add column if not exists loja_id text;
alter table public.vendas add column if not exists loja_id text;
alter table public.itens_venda add column if not exists loja_id text;
alter table public.caixas add column if not exists loja_id text;
alter table public.caixa_entradas add column if not exists loja_id text;
alter table public.entregas add column if not exists loja_id text;

-- Associa dados existentes à loja do proprietário. Sem este backfill, registros
-- antigos com loja_id nulo não aparecem nas consultas por loja do aplicativo.
update public.produtos destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.movimentacoes destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.clientes destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.vendas destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.itens_venda destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.caixas destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.caixa_entradas destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;
update public.entregas destino set loja_id = perfil.loja_id from public.perfis perfil where destino.loja_id is null and destino.user_id = perfil.id;

alter table public.produtos add column if not exists automatic_quality_score numeric;
alter table public.produtos add column if not exists automatic_quality_level integer;
alter table public.produtos add column if not exists confidence_score numeric;
alter table public.produtos add column if not exists produto_estoque_origem_id text references public.produtos(id);
alter table public.produtos add column if not exists unidades_por_estoque_origem numeric;
alter table public.produtos alter column estoque type numeric using estoque::numeric;
alter table public.movimentacoes alter column quantidade type numeric using quantidade::numeric;
alter table public.entregas add column if not exists lat numeric;
alter table public.entregas add column if not exists lng numeric;

create table if not exists public.pedidos_compra (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  loja_id text not null,
  fornecedor_id text not null,
  status text not null check (status in ('draft','pending','in_transit','received','cancelled')),
  data_pedido date not null,
  recebido_em timestamptz
);
create table if not exists public.itens_pedido_compra (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  loja_id text not null,
  pedido_id text not null references public.pedidos_compra(id) on delete cascade,
  produto_id text not null,
  quantidade_solicitada integer not null check (quantidade_solicitada > 0),
  preco_unit_custo numeric(12,2) not null default 0,
  unique (pedido_id, produto_id)
);

create index if not exists produtos_loja_id_idx on public.produtos(loja_id);
create index if not exists movimentacoes_loja_id_idx on public.movimentacoes(loja_id);
create index if not exists clientes_loja_id_idx on public.clientes(loja_id);
create index if not exists vendas_loja_id_idx on public.vendas(loja_id);
create index if not exists itens_venda_loja_id_idx on public.itens_venda(loja_id);
create index if not exists caixas_loja_id_idx on public.caixas(loja_id);
create index if not exists caixa_entradas_loja_id_idx on public.caixa_entradas(loja_id);
create index if not exists entregas_loja_id_idx on public.entregas(loja_id);
create index if not exists pedidos_compra_loja_id_idx on public.pedidos_compra(loja_id);
create index if not exists itens_pedido_compra_loja_id_idx on public.itens_pedido_compra(loja_id);

-- Cada membro autenticado acessa os registros da loja vinculada ao seu perfil.
-- Remova a política antiga que amarrava os dados ao criador do registro.
do $$
declare t text;
begin
  foreach t in array array['produtos','movimentacoes','clientes','vendas','itens_venda','caixas','caixa_entradas','entregas','pedidos_compra','itens_pedido_compra'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "rw own" on public.%I', t);
    execute format('drop policy if exists "rw loja" on public.%I', t);
    execute format('create policy "rw loja" on public.%I for all using (loja_id in (select loja_id from public.perfis where id = auth.uid())) with check (loja_id in (select loja_id from public.perfis where id = auth.uid()))', t);
  end loop;
end $$;

commit;
