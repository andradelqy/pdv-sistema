-- Vendas usam valores positivos; devoluções usam pagamento = 'devolucao',
-- total/preços negativos e devolvem a composição ao estoque de origem.
begin;

create or replace function private.registrar_auditoria_venda(
  p_loja_id text,
  p_venda_id text,
  p_total numeric,
  p_pagamento text,
  p_itens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_loja text;
  v_role text;
  v_devolucao boolean := p_pagamento = 'devolucao';
begin
  if v_usuario is null then
    raise exception 'Usuário não autenticado';
  end if;

  select perfil.loja_id, perfil.role
  into v_loja, v_role
  from public.perfis perfil
  where perfil.id = v_usuario;

  if v_loja is null
     or v_loja is distinct from p_loja_id
     or v_role not in ('owner', 'gerente', 'atendente') then
    raise exception 'Usuário sem permissão para registrar auditoria da venda';
  end if;

  if p_venda_id is null or length(trim(p_venda_id)) = 0 or p_itens <= 0
     or (v_devolucao and p_total >= 0)
     or (not v_devolucao and p_total <= 0) then
    raise exception 'Dados inválidos para auditoria da venda';
  end if;

  insert into public.auditoria_operacional
    (loja_id, usuario_id, acao, entidade, entidade_id, payload)
  values
    (v_loja, v_usuario, case when v_devolucao then 'devolveu' else 'confirmou' end,
     'venda', p_venda_id,
     jsonb_build_object('total', p_total, 'pagamento', p_pagamento, 'itens', p_itens));
end;
$$;

revoke all on function private.registrar_auditoria_venda(text, text, numeric, text, integer)
  from public, anon;
grant execute on function private.registrar_auditoria_venda(text, text, numeric, text, integer)
  to authenticated;

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
  v_devolucao boolean := v_pagamento = 'devolucao';
  v_linhas integer;
  v_linha record;
begin
  select loja_id, role into v_loja, v_role
  from public.perfis where id = v_usuario;

  if v_loja is null or v_role not in ('owner', 'gerente', 'atendente') then
    raise exception 'Usuário sem permissão para registrar venda';
  end if;
  if v_venda_id is null or length(trim(v_venda_id)) = 0 then
    raise exception 'Venda sem identificador';
  end if;
  if v_pagamento = '' then
    raise exception 'Venda sem forma de pagamento';
  end if;
  if v_devolucao and v_total >= 0 then
    raise exception 'Devolução precisa ter total negativo';
  end if;
  if not v_devolucao and v_total <= 0 then
    raise exception 'Venda precisa ter total positivo';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter pelo menos um item';
  end if;

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
  where item.quantidade > 0
    and ((v_devolucao and item.preco_unit <= 0) or (not v_devolucao and item.preco_unit >= 0))
  group by coalesce(produto.produto_estoque_origem_id, item.produto_id);

  select count(*) into v_linhas from pg_temp.consumo_venda;
  if v_linhas = 0 or exists (
    select 1
    from jsonb_to_recordset(p_itens) as item(produto_id text, quantidade numeric, preco_unit numeric, produto_nome text)
    left join public.produtos produto on produto.id = item.produto_id and produto.loja_id = v_loja
    where produto.id is null
       or item.quantidade <= 0
       or (v_devolucao and item.preco_unit > 0)
       or (not v_devolucao and item.preco_unit < 0)
  ) then
    raise exception 'Há item inválido ou inexistente na venda';
  end if;

  if not v_devolucao and exists (
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
  set estoque = case
        when v_devolucao then produto.estoque + consumo.quantidade
        else produto.estoque - consumo.quantidade
      end,
      updated_at = now()
  from pg_temp.consumo_venda consumo
  where produto.id = consumo.produto_id and produto.loja_id = v_loja;

  for v_linha in
    select produto_id, quantidade from pg_temp.consumo_venda order by produto_id
  loop
    insert into public.movimentacoes
      (id, user_id, loja_id, produto_id, tipo, quantidade, data, motivo, obs)
    values (
      'mov_' || v_venda_id || '_' || replace(v_linha.produto_id, ' ', '_'),
      v_usuario, v_loja, v_linha.produto_id,
      case when v_devolucao then 'entrada' else 'saida' end,
      v_linha.quantidade,
      coalesce((p_venda ->> 'data')::date, current_date),
      case when v_devolucao then 'devolucao' else 'venda' end,
      case when v_devolucao then 'Devolução' else 'Venda ' || v_pagamento end
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
      coalesce((p_venda ->> 'data')::date, current_date),
      case when v_devolucao then 'Devolução' else 'Venda ' || v_pagamento end
    );
  end if;

  perform private.registrar_auditoria_venda(
    v_loja, v_venda_id, v_total, v_pagamento, v_linhas
  );

  return jsonb_build_object(
    'ok', true,
    'duplicada', false,
    'devolucao', v_devolucao,
    'venda_id', v_venda_id
  );
end;
$$;

revoke all on function public.confirmar_venda_atomica(jsonb, jsonb, text)
  from public, anon;
grant execute on function public.confirmar_venda_atomica(jsonb, jsonb, text)
  to authenticated;

commit;
