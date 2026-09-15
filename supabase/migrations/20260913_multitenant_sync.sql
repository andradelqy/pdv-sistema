-- Atualiza instalações existentes para sincronização por loja.
-- Execute pelo Supabase CLI ou pelo SQL Editor antes de publicar esta versão.
begin;

alter table public.perfis add column if not exists loja_id text;
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
alter table public.entregas add column if not exists aceito_em timestamptz;
alter table public.entregas add column if not exists em_rota_em timestamptz;
alter table public.entregas add column if not exists entregue_em timestamptz;
alter table public.entregas add column if not exists cancelado_em timestamptz;
alter table public.entregas add column if not exists cancelado_motivo text;
alter table public.entregas add column if not exists nao_entregue_em timestamptz;
alter table public.entregas add column if not exists nao_entregue_motivo text;
alter table public.entregas add column if not exists recebedor_nome text;
alter table public.entregas add column if not exists codigo_confirmacao text;

-- Última posição conhecida do entregador. A chave por loja impede que dados de
-- uma operação sejam sobrescritos ou expostos para outra.
create table if not exists public.rastreio_entregadores (
  entregador_id uuid not null references auth.users(id) on delete cascade,
  loja_id text not null,
  entregador_nome text not null,
  lat numeric not null,
  lng numeric not null,
  atualizado_em timestamptz not null default now(),
  primary key (entregador_id, loja_id)
);
create index if not exists rastreio_entregadores_loja_atualizado_idx on public.rastreio_entregadores(loja_id, atualizado_em desc);

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
  foreach t in array array['produtos','movimentacoes','clientes','vendas','itens_venda','caixas','caixa_entradas','entregas','pedidos_compra','itens_pedido_compra','rastreio_entregadores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "rw own" on public.%I', t);
    execute format('drop policy if exists "rw loja" on public.%I', t);
    execute format('create policy "rw loja" on public.%I for all using (loja_id in (select loja_id from public.perfis where id = auth.uid())) with check (loja_id in (select loja_id from public.perfis where id = auth.uid()))', t);
  end loop;
end $$;

-- Posição é legível somente por membros da mesma loja, mas cada entregador
-- só pode publicar a própria localização (evita falsificação de rota).
drop policy if exists "rw loja" on public.rastreio_entregadores;
create policy "ler rastreio da loja" on public.rastreio_entregadores for select to authenticated
  using (loja_id in (select loja_id from public.perfis where id = (select auth.uid())));
create policy "publicar propria localizacao" on public.rastreio_entregadores for insert to authenticated
  with check (entregador_id = (select auth.uid()) and loja_id in (select loja_id from public.perfis where id = (select auth.uid())));
create policy "atualizar propria localizacao" on public.rastreio_entregadores for update to authenticated
  using (entregador_id = (select auth.uid()) and loja_id in (select loja_id from public.perfis where id = (select auth.uid())))
  with check (entregador_id = (select auth.uid()) and loja_id in (select loja_id from public.perfis where id = (select auth.uid())));

-- O entregador pode reivindicar um pedido pendente e alterar apenas os que
-- assumiu; owner e gerente mantêm a capacidade de corrigir ocorrências.
drop policy if exists "rw loja" on public.entregas;
create policy "ler entregas da loja" on public.entregas for select to authenticated
  using (loja_id in (select loja_id from public.perfis where id = (select auth.uid())));
create policy "criar entrega da loja" on public.entregas for insert to authenticated
  with check (loja_id in (select loja_id from public.perfis where id = (select auth.uid())));
create policy "atualizar entrega autorizada" on public.entregas for update to authenticated
  using (
    loja_id in (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner', 'gerente')
      or entregador_id = (select auth.uid())::text
      or (status = 'pendente' and (select role from public.perfis where id = (select auth.uid())) = 'entregador')
    )
  )
  with check (
    loja_id in (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner', 'gerente')
      or entregador_id = (select auth.uid())::text
    )
  );

commit;
