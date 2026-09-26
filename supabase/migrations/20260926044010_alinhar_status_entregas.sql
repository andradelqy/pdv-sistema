begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A função transicionar_entrega_atomica usa estes seis estados. A tabela
-- ainda conservava uma constraint anterior que não aceitava "aceito" nem
-- "nao_entregue", fazendo a transação inteira falhar ao assumir um pedido.
do $$
declare
  v_status_desconhecidos text;
begin
  select string_agg(status, ', ' order by status)
  into v_status_desconhecidos
  from (
    select distinct status
    from public.entregas
    where status is null
       or status not in ('pendente', 'aceito', 'em_rota', 'entregue', 'nao_entregue', 'cancelado')
  ) existentes;

  if v_status_desconhecidos is not null then
    raise exception 'Existem status de entrega não reconhecidos: %', v_status_desconhecidos;
  end if;
end;
$$;

alter table public.entregas
  drop constraint if exists entregas_status_check;

alter table public.entregas
  add constraint entregas_status_check
  check (status in ('pendente', 'aceito', 'em_rota', 'entregue', 'nao_entregue', 'cancelado'))
  not valid;

alter table public.entregas
  validate constraint entregas_status_check;

commit;
