begin;

-- O sincronizador trata cada produto como um único item dentro do pedido.
-- Bancos criados antes da constraint podem conter repetições; nesse caso,
-- preservamos o registro mais recente e removemos somente as cópias antigas.
with itens_repetidos as (
  select
    id,
    row_number() over (
      partition by pedido_id, produto_id
      order by id desc
    ) as ordem
  from public.itens_pedido_compra
)
delete from public.itens_pedido_compra as item
using itens_repetidos as repetido
where item.id = repetido.id
  and repetido.ordem > 1;

-- Necessário para que ON CONFLICT (pedido_id, produto_id) seja atômico.
create unique index if not exists itens_pedido_compra_pedido_produto_uidx
  on public.itens_pedido_compra (pedido_id, produto_id);

-- Faz a API REST recarregar o catálogo sem depender do tempo de cache.
notify pgrst, 'reload schema';

commit;
