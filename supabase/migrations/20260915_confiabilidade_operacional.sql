-- Etapa de confiabilidade operacional.
-- Execute APENAS depois das migrations anteriores, no SQL Editor do Supabase.
-- Esta migration não apaga dados existentes.

begin;

-- Trilha imutável das ações relevantes. Não armazene senha, token, nem dados
-- de cartão no payload.
create table if not exists public.auditoria_operacional (
  id bigint generated always as identity primary key,
  loja_id text not null,
  usuario_id uuid not null references auth.users(id) on delete restrict,
  acao text not null,
  entidade text not null,
  entidade_id text,
  payload jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_operacional_loja_criado_idx
  on public.auditoria_operacional (loja_id, criado_em desc);
create index if not exists auditoria_operacional_entidade_idx
  on public.auditoria_operacional (loja_id, entidade, entidade_id);

alter table public.auditoria_operacional enable row level security;
drop policy if exists "ler auditoria da gestao" on public.auditoria_operacional;
create policy "ler auditoria da gestao" on public.auditoria_operacional
  for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (select role from public.perfis where id = (select auth.uid())) in ('owner', 'gerente')
  );

-- Confirma uma venda, baixa estoque, grava os itens, a movimentação e a
-- entrada de caixa em uma única transação. O id da venda é a chave de
-- idempotência: reenviar a mesma venda após queda de internet não duplica nada.
create or replace function public.confirmar_venda_atomica(
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
  v_usuario uuid := auth.uid();
  v_loja text;
  v_role text;
  v_venda_id text := p_venda ->> 'id';
  v_total numeric := coalesce((p_venda ->> 'total')::numeric, 0);
  v_pagamento text := coalesce(p_venda ->> 'pagamento', '');
  v_linhas integer;
  v_linha record;
begin
  select loja_id, role into v_loja, v_role
  from public.perfis where id = v_usuario;

  if v_loja is null or v_role not in ('owner', 'gerente', 'atendente') then
    raise exception 'Usuário sem permissão para registrar venda';
  end if;
  if v_venda_id is null or length(trim(v_venda_id)) = 0 or v_total <= 0 or v_pagamento = '' then
    raise exception 'Dados da venda inválidos';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter pelo menos um item';
  end if;

  -- Um reenvio da fila offline não cria nova venda, baixa estoque ou caixa.
  if exists (select 1 from public.vendas where id = v_venda_id and loja_id = v_loja) then
    return jsonb_build_object('ok', true, 'duplicada', true, 'venda_id', v_venda_id);
  end if;

  if not exists (
    select 1 from public.caixas
    where id = p_caixa_id and loja_id = v_loja and fechado_em is null
  ) then
    raise exception 'Não existe caixa aberto para confirmar esta venda';
  end if;

  create temporary table if not exists pg_temp.consumo_venda (
    produto_id text primary key,
    quantidade numeric not null
  ) on commit drop;
  truncate pg_temp.consumo_venda;

  insert into pg_temp.consumo_venda (produto_id, quantidade)
  select coalesce(produto.produto_estoque_origem_id, item.produto_id),
         sum(item.quantidade / greatest(coalesce(produto.unidades_por_estoque_origem, 1), 1))
  from jsonb_to_recordset(p_itens) as item(
    produto_id text, quantidade numeric, preco_unit numeric, produto_nome text
  )
  join public.produtos produto on produto.id = item.produto_id and produto.loja_id = v_loja
  where item.quantidade > 0 and item.preco_unit >= 0
  group by coalesce(produto.produto_estoque_origem_id, item.produto_id);

  select count(*) into v_linhas from pg_temp.consumo_venda;
  if v_linhas = 0 or exists (
    select 1
    from jsonb_to_recordset(p_itens) as item(produto_id text, quantidade numeric, preco_unit numeric, produto_nome text)
    left join public.produtos produto on produto.id = item.produto_id and produto.loja_id = v_loja
    where produto.id is null or item.quantidade <= 0 or item.preco_unit < 0
  ) then
    raise exception 'Há item inválido ou inexistente na venda';
  end if;

  if exists (
    select 1 from pg_temp.consumo_venda consumo
    join public.produtos produto on produto.id = consumo.produto_id and produto.loja_id = v_loja
    where produto.estoque < consumo.quantidade
  ) then
    raise exception 'Estoque insuficiente para confirmar esta venda';
  end if;

  insert into public.vendas (id, user_id, loja_id, data, cliente_id, pagamento, total, obs, criado_em)
  values (
    v_venda_id, v_usuario, v_loja, coalesce((p_venda ->> 'data')::date, current_date),
    nullif(p_venda ->> 'cliente_id', ''), v_pagamento, v_total,
    nullif(p_venda ->> 'obs', ''), coalesce((p_venda ->> 'criado_em')::timestamptz, now())
  );

  insert into public.itens_venda (user_id, loja_id, venda_id, produto_id, produto_nome, quantidade, preco_unit)
  select v_usuario, v_loja, v_venda_id, item.produto_id, nullif(item.produto_nome, ''), item.quantidade, item.preco_unit
  from jsonb_to_recordset(p_itens) as item(
    produto_id text, quantidade numeric, preco_unit numeric, produto_nome text
  );

  update public.produtos produto
  set estoque = produto.estoque - consumo.quantidade,
      updated_at = now()
  from pg_temp.consumo_venda consumo
  where produto.id = consumo.produto_id and produto.loja_id = v_loja;

  for v_linha in
    select produto_id, quantidade from pg_temp.consumo_venda order by produto_id
  loop
    insert into public.movimentacoes (id, user_id, loja_id, produto_id, tipo, quantidade, data, obs)
    values (
      'mov_' || v_venda_id || '_' || replace(v_linha.produto_id, ' ', '_'),
      v_usuario, v_loja, v_linha.produto_id, 'saida', v_linha.quantidade,
      coalesce((p_venda ->> 'data')::date, current_date), 'Venda ' || v_pagamento
    );
  end loop;

  if v_pagamento = 'fiado' then
    update public.clientes
    set saldo = saldo + v_total, compras = compras + 1
    where id = nullif(p_venda ->> 'cliente_id', '') and loja_id = v_loja;
    if not found then
      raise exception 'Cliente de fiado não encontrado';
    end if;
  else
    insert into public.caixa_entradas (user_id, loja_id, caixa_id, tipo, pagamento, valor, data, descricao)
    values (
      v_usuario, v_loja, p_caixa_id, 'venda', v_pagamento, v_total,
      coalesce((p_venda ->> 'data')::date, current_date), 'Venda ' || v_pagamento
    );
  end if;

  insert into public.auditoria_operacional (loja_id, usuario_id, acao, entidade, entidade_id, payload)
  values (v_loja, v_usuario, 'confirmou', 'venda', v_venda_id,
    jsonb_build_object('total', v_total, 'pagamento', v_pagamento, 'itens', v_linhas));

  return jsonb_build_object('ok', true, 'duplicada', false, 'venda_id', v_venda_id);
end;
$$;

revoke all on function public.confirmar_venda_atomica(jsonb, jsonb, text) from public, anon;
grant execute on function public.confirmar_venda_atomica(jsonb, jsonb, text) to authenticated;

commit;
