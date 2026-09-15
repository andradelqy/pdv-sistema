-- Repara vendas históricas cujos itens não receberam loja_id na migração inicial.
-- Também preserva o nome do produto no instante da venda para o histórico.
begin;

alter table public.itens_venda add column if not exists produto_nome text;
alter table public.itens_venda add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.pedidos_compra add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.itens_pedido_compra add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- A venda é a fonte de verdade da loja e do criador de cada item de venda.
-- Isso recupera itens antigos que eram ocultos pelo filtro/RLS por loja.
update public.itens_venda item
set loja_id = venda.loja_id,
    user_id = venda.user_id
from public.vendas venda
where item.venda_id = venda.id
  and (item.loja_id is null or item.user_id is null)
  and venda.loja_id is not null;

-- Preenche a fotografia textual do produto para registros já existentes.
update public.itens_venda item
set produto_nome = produto.nome
from public.produtos produto
where item.produto_id = produto.id
  and item.produto_nome is null;

-- O mesmo erro de herança poderia esconder itens de pedidos de compra.
update public.itens_pedido_compra item
set loja_id = pedido.loja_id,
    user_id = pedido.user_id
from public.pedidos_compra pedido
where item.pedido_id = pedido.id
  and (item.loja_id is null or item.user_id is null)
  and pedido.loja_id is not null;

-- Cada venda possui uma linha consolidada por produto. Esta restrição permite
-- reprocessar uma sincronização offline sem duplicar o mesmo item.
with consolidado as (
  select min(id) as manter_id, venda_id, produto_id,
         sum(quantidade) as quantidade, max(preco_unit) as preco_unit
  from public.itens_venda
  group by venda_id, produto_id
  having count(*) > 1
)
update public.itens_venda item
set quantidade = consolidado.quantidade,
    preco_unit = consolidado.preco_unit
from consolidado
where item.id = consolidado.manter_id;

delete from public.itens_venda item
using (
  select id, row_number() over (partition by venda_id, produto_id order by id) as posicao
  from public.itens_venda
) repetido
where item.id = repetido.id and repetido.posicao > 1;

create unique index if not exists itens_venda_venda_produto_uidx
  on public.itens_venda(venda_id, produto_id);

commit;
