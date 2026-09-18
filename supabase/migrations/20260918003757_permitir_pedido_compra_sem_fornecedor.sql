-- O planejamento de compras não deve depender de fornecedor cadastrado.
-- fornecedor_id continua reservado ao vínculo futuro com a tabela de
-- fornecedores; o nome digitado/importado fica separado e pode ser nulo.
begin;

alter table public.pedidos_compra
  alter column fornecedor_id drop not null;

alter table public.pedidos_compra
  add column if not exists fornecedor_nome text;

comment on column public.pedidos_compra.fornecedor_id is
  'Identificador opcional do fornecedor cadastrado. Nunca recebe textos de placeholder.';
comment on column public.pedidos_compra.fornecedor_nome is
  'Nome opcional usado no planejamento quando ainda não existe fornecedor vinculado.';

commit;
