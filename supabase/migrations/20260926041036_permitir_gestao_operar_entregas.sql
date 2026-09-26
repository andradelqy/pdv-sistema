begin;

-- Owner e gerente podem assumir pessoalmente uma entrega. Ao fazer isso,
-- ficam sujeitos às mesmas transições e provas exigidas do entregador.
create or replace function public.transicionar_entrega_atomica(
  p_entrega_id text,
  p_novo_status text,
  p_detalhes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_loja text;
  v_role text;
  v_nome text;
  v_entrega public.entregas%rowtype;
  v_config public.config_entregas%rowtype;
  v_agora timestamptz := now();
  v_pin text := nullif(trim(p_detalhes ->> 'codigo_confirmacao'), '');
  v_recebedor text := nullif(trim(p_detalhes ->> 'recebedor_nome'), '');
  v_motivo text := nullif(trim(p_detalhes ->> 'motivo'), '');
  v_lat numeric := nullif(p_detalhes ->> 'lat','')::numeric;
  v_lng numeric := nullif(p_detalhes ->> 'lng','')::numeric;
  v_precisao numeric := nullif(p_detalhes ->> 'precisao_m','')::numeric;
  v_foto text := nullif(p_detalhes ->> 'comprovante_foto_url','');
  v_venda_id text;
  v_status_anterior text;
  v_item record;
begin
  select loja_id, role, coalesce(nome,email,'Entregador') into v_loja,v_role,v_nome
  from public.perfis where id = v_usuario;
  if v_usuario is null or v_loja is null then raise exception 'Usuário não autenticado'; end if;

  select * into v_entrega from public.entregas
  where id = p_entrega_id and loja_id = v_loja for update;
  if not found then raise exception 'Entrega não encontrada'; end if;
  v_status_anterior := v_entrega.status;
  select * into v_config from public.config_entregas where loja_id = v_loja;

  if p_novo_status = v_entrega.status then return to_jsonb(v_entrega) || jsonb_build_object('idempotente',true); end if;
  if p_novo_status not in ('aceito','em_rota','entregue','nao_entregue','cancelado','pendente') then
    raise exception 'Status de entrega inválido';
  end if;

  if v_role = 'entregador' or (
    v_role in ('owner','gerente')
    and p_novo_status in ('aceito','em_rota','entregue','nao_entregue')
    and (p_novo_status = 'aceito' or v_entrega.entregador_id = v_usuario::text)
  ) then
    if p_novo_status = 'aceito' then
      if v_entrega.status <> 'pendente' or v_entrega.entregador_id is not null then
        raise exception 'Esta entrega já foi aceita por outro responsável';
      end if;
      if exists (
        select 1 from public.entregas
        where loja_id=v_loja and entregador_id=v_usuario::text
          and status in ('aceito','em_rota','nao_entregue') and id<>v_entrega.id
      ) then raise exception 'Conclua ou resolva sua entrega atual antes de aceitar outra'; end if;
      v_entrega.entregador_id := v_usuario::text;
      v_entrega.entregador_nome := v_nome;
    elsif v_entrega.entregador_id is distinct from v_usuario::text then
      raise exception 'Entrega atribuída a outro responsável';
    end if;
    if not (
      (v_entrega.status = 'pendente' and p_novo_status = 'aceito') or
      (v_entrega.status = 'aceito' and p_novo_status = 'em_rota') or
      (v_entrega.status = 'em_rota' and p_novo_status in ('entregue','nao_entregue')) or
      (v_entrega.status = 'nao_entregue' and p_novo_status = 'em_rota')
    ) then raise exception 'Transição não permitida para o responsável pela entrega'; end if;
  elsif v_role in ('owner','gerente','atendente') then
    if not (
      (p_novo_status = 'cancelado' and v_entrega.status in ('pendente','aceito','nao_entregue')) or
      (p_novo_status = 'pendente' and v_entrega.status = 'nao_entregue') or
      (p_novo_status = 'em_rota' and v_entrega.status = 'aceito')
    ) then raise exception 'A gestão não pode concluir uma entrega atribuída a outra pessoa'; end if;
  else
    raise exception 'Papel sem acesso ao fluxo de entregas';
  end if;

  if p_novo_status in ('cancelado','nao_entregue') and v_motivo is null then
    raise exception 'Informe o motivo da ocorrência';
  end if;

  if p_novo_status = 'entregue' then
    if v_recebedor is null then raise exception 'Informe quem recebeu o pedido'; end if;
    if coalesce(v_config.exigir_pin,true) and v_entrega.codigo_confirmacao_hash is not null and (
      v_pin is null or extensions.crypt(v_pin, v_entrega.codigo_confirmacao_hash) <> v_entrega.codigo_confirmacao_hash
    ) then raise exception 'Código de confirmação inválido'; end if;
    if coalesce(v_config.exigir_localizacao,true) and (v_lat is null or v_lng is null) then
      raise exception 'Ative o GPS para confirmar a entrega';
    end if;
    if v_precisao is not null and v_precisao > coalesce(v_config.precisao_maxima_m,150) then
      raise exception 'Sinal de GPS impreciso; aguarde melhorar e tente novamente';
    end if;
    if coalesce(v_config.exigir_foto,false) and v_foto is null then
      raise exception 'A loja exige uma foto do comprovante';
    end if;

    v_venda_id := 'entrega_' || md5(v_entrega.id);
    if v_entrega.pagamento <> 'fiado' and v_entrega.caixa_id is null then
      raise exception 'Esta entrega não possui caixa de origem para liquidação';
    end if;

    insert into public.vendas(id,user_id,loja_id,data,cliente_id,pagamento,total,obs,criado_em)
    values (v_venda_id,v_usuario,v_loja,current_date,v_entrega.cliente_id,v_entrega.pagamento,
      v_entrega.total,'Entrega concluída (' || v_entrega.cliente_nome || ') - ' || v_entrega.endereco,v_agora)
    on conflict (id) do nothing;

    insert into public.itens_venda(user_id,loja_id,venda_id,produto_id,produto_nome,quantidade,preco_unit)
    select v_usuario,v_loja,v_venda_id,item.produto_id,nullif(item.produto_nome,''),item.quantidade,item.preco_unit
    from jsonb_to_recordset(v_entrega.itens) as item(produto_id text,quantidade numeric,preco_unit numeric,produto_nome text)
    on conflict (venda_id,produto_id) do nothing;

    if v_entrega.pagamento = 'fiado' then
      update public.clientes set saldo = saldo + v_entrega.total, compras = compras + 1
      where id = v_entrega.cliente_id and loja_id = v_loja;
      if not found then raise exception 'Cliente de fiado não encontrado'; end if;
    else
      insert into public.caixa_entradas(user_id,loja_id,caixa_id,tipo,pagamento,valor,data,descricao,origem_entrega_id)
      values (v_usuario,v_loja,v_entrega.caixa_id,'venda',v_entrega.pagamento,v_entrega.total,current_date,
        'Entrega #' || right(v_entrega.id,4) || ' - ' || v_entrega.cliente_nome,v_entrega.id)
      on conflict (loja_id,origem_entrega_id) where origem_entrega_id is not null do nothing;
    end if;
  end if;

  if p_novo_status = 'cancelado' then
    create temporary table if not exists pg_temp.devolucao_entrega(produto_id text primary key,quantidade numeric not null) on commit drop;
    truncate pg_temp.devolucao_entrega;
    insert into pg_temp.devolucao_entrega(produto_id,quantidade)
    select coalesce(produto.produto_estoque_origem_id,item.produto_id),
      sum(item.quantidade / greatest(coalesce(produto.unidades_por_estoque_origem,1),1))
    from jsonb_to_recordset(v_entrega.itens) as item(produto_id text,quantidade numeric)
    join public.produtos produto on produto.id = item.produto_id and produto.loja_id = v_loja
    group by coalesce(produto.produto_estoque_origem_id,item.produto_id);
    update public.produtos produto set estoque = produto.estoque + devolucao.quantidade, updated_at = now()
    from pg_temp.devolucao_entrega devolucao
    where produto.id = devolucao.produto_id and produto.loja_id = v_loja;
    for v_item in select * from pg_temp.devolucao_entrega loop
      insert into public.movimentacoes(id,user_id,loja_id,produto_id,tipo,quantidade,data,obs,motivo)
      values ('mov_can_' || substr(md5(v_entrega.id || ':' || v_item.produto_id),1,24),v_usuario,v_loja,
        v_item.produto_id,'entrada',v_item.quantidade,current_date,
        'Cancelamento da entrega #' || right(v_entrega.id,4) || ': ' || v_motivo,'devolucao')
      on conflict (id) do nothing;
    end loop;
  end if;

  update public.entregas set
    status = p_novo_status,
    entregador_id = case when p_novo_status = 'pendente' then null else v_entrega.entregador_id end,
    entregador_nome = case when p_novo_status = 'pendente' then null else v_entrega.entregador_nome end,
    aceito_em = case when p_novo_status = 'aceito' then v_agora else aceito_em end,
    em_rota_em = case when p_novo_status = 'em_rota' then v_agora else em_rota_em end,
    entregue_em = case when p_novo_status = 'entregue' then v_agora else entregue_em end,
    cancelado_em = case when p_novo_status = 'cancelado' then v_agora else cancelado_em end,
    cancelado_motivo = case when p_novo_status = 'cancelado' then v_motivo else cancelado_motivo end,
    nao_entregue_em = case when p_novo_status = 'nao_entregue' then v_agora else nao_entregue_em end,
    nao_entregue_motivo = case when p_novo_status = 'nao_entregue' then v_motivo when p_novo_status in ('em_rota','pendente') then null else nao_entregue_motivo end,
    recebedor_nome = case when p_novo_status = 'entregue' then v_recebedor else recebedor_nome end,
    comprovante_foto_url = case when p_novo_status = 'entregue' then v_foto else comprovante_foto_url end,
    comprovante_lat = case when p_novo_status = 'entregue' then v_lat else comprovante_lat end,
    comprovante_lng = case when p_novo_status = 'entregue' then v_lng else comprovante_lng end,
    comprovante_precisao_m = case when p_novo_status = 'entregue' then v_precisao else comprovante_precisao_m end,
    venda_id = case when p_novo_status = 'entregue' then v_venda_id else venda_id end,
    atualizado_em = v_agora
  where id = v_entrega.id
  returning * into v_entrega;

  insert into public.entrega_eventos(loja_id,entrega_id,usuario_id,tipo,status_anterior,status_novo,detalhe,lat,lng,precisao_m)
  values (v_loja,v_entrega.id,v_usuario,
    case p_novo_status when 'aceito' then 'aceita' when 'cancelado' then 'cancelada' when 'pendente' then 'observacao' else p_novo_status end,
    v_status_anterior,p_novo_status,
    jsonb_strip_nulls(jsonb_build_object('motivo',v_motivo,'recebedor',v_recebedor,'foto',v_foto)),v_lat,v_lng,v_precisao);
  insert into public.auditoria_operacional(loja_id,usuario_id,acao,entidade,entidade_id,payload)
  values (v_loja,v_usuario,'alterou_status','entrega',v_entrega.id,jsonb_build_object('status',p_novo_status));

  return to_jsonb(v_entrega);
end;
$$;

-- GPS também é permitido para owner/gerente somente quando a entrega está
-- atribuída ao próprio usuário e efetivamente em rota.
create or replace function public.publicar_localizacao_entrega(
  p_entrega_id text,p_lat numeric,p_lng numeric,p_precisao_m numeric,p_cliente_evento_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_usuario uuid := auth.uid(); v_loja text; v_nome text; v_limite numeric := 250;
begin
  select loja_id,coalesce(nome,email,'Responsável') into v_loja,v_nome from public.perfis
  where id = v_usuario and role in ('entregador','owner','gerente');
  if v_loja is null then raise exception 'Perfil sem permissão para rastrear entregas'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Coordenadas inválidas'; end if;
  select coalesce(precisao_maxima_m,250) into v_limite from public.config_entregas where loja_id = v_loja;
  if p_precisao_m is not null and p_precisao_m > greatest(v_limite,250) then raise exception 'Posição descartada por baixa precisão'; end if;
  if not exists (select 1 from public.entregas where id=p_entrega_id and loja_id=v_loja and entregador_id=v_usuario::text and status='em_rota') then
    raise exception 'Não há entrega em rota atribuída a este usuário';
  end if;
  insert into public.rastreio_entregadores(entregador_id,loja_id,entregador_nome,lat,lng,atualizado_em)
  values(v_usuario,v_loja,v_nome,p_lat,p_lng,now())
  on conflict(entregador_id,loja_id) do update set entregador_nome=excluded.entregador_nome,lat=excluded.lat,lng=excluded.lng,atualizado_em=excluded.atualizado_em;
  insert into public.rastreio_pontos(entregador_id,loja_id,entrega_id,lat,lng,precisao_m,cliente_evento_id)
  values(v_usuario,v_loja,p_entrega_id,p_lat,p_lng,p_precisao_m,p_cliente_evento_id)
  on conflict(cliente_evento_id) where cliente_evento_id is not null do nothing;
end;
$$;

revoke all on function public.transicionar_entrega_atomica(text,text,jsonb) from public,anon;
revoke all on function public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.transicionar_entrega_atomica(text,text,jsonb) to authenticated;
grant execute on function public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid) to authenticated;

commit;
