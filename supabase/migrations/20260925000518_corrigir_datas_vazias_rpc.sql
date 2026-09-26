begin;

-- Conserva as implementações transacionais já auditadas e publica wrappers
-- que normalizam payloads antigos da fila offline antes de qualquer cast.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.confirmar_venda_atomica(jsonb, jsonb, text)
  rename to confirmar_venda_atomica_impl_data_v1;
alter function public.confirmar_venda_atomica_impl_data_v1(jsonb, jsonb, text)
  set schema private;

revoke all on function private.confirmar_venda_atomica_impl_data_v1(jsonb, jsonb, text)
  from public, anon;
grant execute on function private.confirmar_venda_atomica_impl_data_v1(jsonb, jsonb, text)
  to authenticated;

create function public.confirmar_venda_atomica(
  p_venda jsonb,
  p_itens jsonb,
  p_caixa_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venda jsonb := coalesce(p_venda, '{}'::jsonb);
begin
  if nullif(btrim(v_venda ->> 'data'), '') is null then
    v_venda := jsonb_set(v_venda, '{data}', to_jsonb(current_date::text), true);
  end if;
  if nullif(btrim(v_venda ->> 'criado_em'), '') is null then
    v_venda := jsonb_set(v_venda, '{criado_em}', to_jsonb(now()::text), true);
  end if;

  return private.confirmar_venda_atomica_impl_data_v1(v_venda, p_itens, p_caixa_id);
end;
$$;

revoke all on function public.confirmar_venda_atomica(jsonb, jsonb, text)
  from public, anon;
grant execute on function public.confirmar_venda_atomica(jsonb, jsonb, text)
  to authenticated;

alter function public.criar_entrega_atomica(jsonb)
  rename to criar_entrega_atomica_impl_data_v1;
alter function public.criar_entrega_atomica_impl_data_v1(jsonb)
  set schema private;

revoke all on function private.criar_entrega_atomica_impl_data_v1(jsonb)
  from public, anon;
grant execute on function private.criar_entrega_atomica_impl_data_v1(jsonb)
  to authenticated;

create function public.criar_entrega_atomica(p_entrega jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entrega jsonb := coalesce(p_entrega, '{}'::jsonb);
begin
  if nullif(btrim(v_entrega ->> 'data'), '') is null then
    v_entrega := jsonb_set(v_entrega, '{data}', to_jsonb(current_date::text), true);
  end if;
  if nullif(btrim(v_entrega ->> 'criado_em'), '') is null then
    v_entrega := jsonb_set(v_entrega, '{criado_em}', to_jsonb(now()::text), true);
  end if;

  return private.criar_entrega_atomica_impl_data_v1(v_entrega);
end;
$$;

revoke all on function public.criar_entrega_atomica(jsonb)
  from public, anon;
grant execute on function public.criar_entrega_atomica(jsonb)
  to authenticated;

comment on function public.confirmar_venda_atomica(jsonb, jsonb, text) is
  'Confirma venda atomicamente e recupera datas vazias de payloads offline legados.';
comment on function public.criar_entrega_atomica(jsonb) is
  'Cria entrega atomicamente e recupera datas vazias de payloads offline legados.';

commit;
