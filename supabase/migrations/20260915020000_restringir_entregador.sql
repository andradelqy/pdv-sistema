-- Entregadores usam somente as tabelas do fluxo de entrega.
-- Entregas e rastreio possuem políticas específicas na migração anterior.
begin;

do $$
declare tabela text;
begin
  foreach tabela in array array[
    'produtos', 'movimentacoes', 'clientes', 'vendas', 'itens_venda',
    'caixas', 'caixa_entradas', 'pedidos_compra', 'itens_pedido_compra'
  ] loop
    execute format('drop policy if exists "rw loja" on public.%I', tabela);
    execute format('drop policy if exists "rw equipe da loja" on public.%I', tabela);
    execute format(
      'create policy "rw equipe da loja" on public.%I for all to authenticated
       using (
         loja_id in (select loja_id from public.perfis where id = (select auth.uid()))
         and coalesce((select role from public.perfis where id = (select auth.uid())), '''') <> ''entregador''
       )
       with check (
         loja_id in (select loja_id from public.perfis where id = (select auth.uid()))
         and coalesce((select role from public.perfis where id = (select auth.uid())), '''') <> ''entregador''
       )',
      tabela
    );
  end loop;
end $$;

commit;
