-- supabase/schema.sql
-- Rode uma vez no SQL Editor do projeto dnkftdgusesxwoweshbq.
-- Apaga tabelas/views legadas (alertas_compra, vw_curva_abc) e cria do zero.
-- Os dados atuais dessas tabelas serão perdidos — se precisar, faça backup antes.

begin;

-- =========================
-- 0. LIMPEZA
-- =========================
drop materialized view if exists public.vw_curva_abc;
drop view if exists public.vw_curva_abc;
drop table if exists public.alertas_compra cascade;
drop table if exists public.itens_venda cascade;
drop table if exists public.vendas cascade;
drop table if exists public.entregas cascade;
drop table if exists public.caixas cascade;
drop table if exists public.caixa_entradas cascade;
drop table if exists public.movimentacoes cascade;
drop table if exists public.clientes cascade;
drop table if exists public.produtos cascade;

-- =========================
-- 1. PRODUTOS
-- =========================
create table public.produtos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  nome text not null,
  barcode text,
  descricao text,
  categoria text,
  fornecedor text,
  lead_time int not null default 3,
  preco_compra numeric(12,2) not null default 0,
  preco_venda numeric(12,2) not null default 0,
  imposto numeric(5,2) not null default 0,
  frete numeric(12,2) not null default 0,
  comissao numeric(5,2) not null default 0,
  preco_competidor numeric(12,2),
  margem_alvo numeric(5,2) not null default 0,
  estoque int not null default 0,
  estoque_min int not null default 0,
  ponto_pedido int not null default 0,
  qualidade int not null default 3,
  imagem text,
  updated_at timestamptz not null default now()
);
create index on public.produtos (user_id);
create index on public.produtos (user_id, sku);

-- =========================
-- 2. MOVIMENTACOES (entrada/saida de estoque)
-- =========================
create table public.movimentacoes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  produto_id text not null,
  tipo text not null check (tipo in ('entrada','saida')),
  quantidade int not null,
  data date not null,
  lote text,
  validade date,
  obs text
);
create index on public.movimentacoes (user_id);
create index on public.movimentacoes (user_id, produto_id);
create index on public.movimentacoes (user_id, data);

-- =========================
-- 3. CLIENTES
-- =========================
create table public.clientes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  limite numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  compras int not null default 0,
  ultima_cobranca date
);
create index on public.clientes (user_id);

-- =========================
-- 4. VENDAS + ITENS
-- =========================
create table public.vendas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  cliente_id text,
  pagamento text not null,
  total numeric(12,2) not null,
  obs text,
  criado_em timestamptz not null default now()
);
create index on public.vendas (user_id);
create index on public.vendas (user_id, data);

create table public.itens_venda (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  venda_id text not null references public.vendas(id) on delete cascade,
  produto_id text not null,
  quantidade int not null,
  preco_unit numeric(12,2) not null
);
create index on public.itens_venda (user_id);
create index on public.itens_venda (venda_id);
create index on public.itens_venda (produto_id);

-- =========================
-- 5. CAIXA
-- =========================
create table public.caixas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  aberto_em timestamptz not null,
  fechado_em timestamptz,
  faturamento_bruto numeric(12,2),
  lucro_liquido numeric(12,2),
  vendas int
);
create index on public.caixas (user_id);

create table public.caixa_entradas (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  caixa_id text,
  tipo text not null check (tipo in ('venda','suprimento','sangria')),
  pagamento text,
  valor numeric(12,2) not null,
  data date not null,
  descricao text
);
create index on public.caixa_entradas (user_id);
create index on public.caixa_entradas (caixa_id);
create index on public.caixa_entradas (user_id, data);

-- =========================
-- 6. ENTREGAS (PDV entregas)
-- =========================
create table public.entregas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_nome text not null,
  telefone text,
  endereco text not null,
  itens jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null,
  taxa_entrega numeric(12,2) not null default 0,
  pagamento text not null,
  status text not null default 'pendente' check (status in ('pendente','em_rota','entregue','cancelado')),
  entregador_id text,
  entregador_nome text,
  data date not null,
  criado_em timestamptz not null default now(),
  obs text
);
create index on public.entregas (user_id);
create index on public.entregas (user_id, status);

-- =========================
-- 7. RLS — cada user só vê os próprios dados
-- =========================
alter table public.produtos        enable row level security;
alter table public.movimentacoes   enable row level security;
alter table public.clientes        enable row level security;
alter table public.vendas          enable row level security;
alter table public.itens_venda     enable row level security;
alter table public.caixas          enable row level security;
alter table public.caixa_entradas  enable row level security;
alter table public.entregas        enable row level security;

create policy "rw own" on public.produtos       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.movimentacoes  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.clientes       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.vendas         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.itens_venda    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.caixas         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.caixa_entradas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rw own" on public.entregas       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
