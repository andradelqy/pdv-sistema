-- Entregas v2: transações atômicas, prova de entrega, rastreamento público,
-- trilha de eventos e RLS por papel. A migration é incremental e não apaga
-- entregas existentes.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.entregas add column if not exists cliente_id text;
alter table public.entregas add column if not exists caixa_id text;
alter table public.entregas add column if not exists tracking_token uuid default gen_random_uuid();
alter table public.entregas add column if not exists codigo_confirmacao_hash text;
alter table public.entregas add column if not exists comprovante_foto_url text;
alter table public.entregas add column if not exists comprovante_lat numeric;
alter table public.entregas add column if not exists comprovante_lng numeric;
alter table public.entregas add column if not exists comprovante_precisao_m numeric;
alter table public.entregas add column if not exists venda_id text;
alter table public.entregas add column if not exists previsao_entrega_em timestamptz;
alter table public.entregas add column if not exists atualizado_em timestamptz not null default now();

update public.entregas set tracking_token = gen_random_uuid() where tracking_token is null;
update public.entregas
set codigo_confirmacao_hash = extensions.crypt(codigo_confirmacao, extensions.gen_salt('bf'))
where codigo_confirmacao_hash is null and nullif(codigo_confirmacao,'') is not null;
-- A coluna permanece apenas por compatibilidade estrutural. Nenhum PIN pode
-- continuar recuperável pela Data API ou por backups novos.
update public.entregas set codigo_confirmacao = null where codigo_confirmacao is not null;
update public.entregas entrega
set caixa_id = (
  select c.id from public.caixas c
  where c.loja_id=entrega.loja_id and c.aberto_em <= entrega.criado_em
  order by c.aberto_em desc limit 1
)
where entrega.caixa_id is null and exists (
  select 1 from public.caixas c where c.loja_id=entrega.loja_id and c.aberto_em <= entrega.criado_em
);
alter table public.entregas alter column tracking_token set not null;
create unique index if not exists entregas_tracking_token_uidx on public.entregas(tracking_token);
create index if not exists entregas_entregador_status_idx on public.entregas(loja_id, entregador_id, status, criado_em desc);
-- Além da validação da RPC, a restrição parcial fecha a corrida em que o mesmo
-- entregador tenta aceitar dois pedidos diferentes no mesmo instante.
do $$
begin
  if exists (
    select 1 from public.entregas
    where entregador_id is not null and status in ('aceito','em_rota','nao_entregue')
    group by loja_id, entregador_id having count(*) > 1
  ) then
    raise exception 'Existem entregadores com mais de uma entrega ativa. Resolva essas ocorrências antes de aplicar a migration.';
  end if;
end $$;
create unique index if not exists entregas_um_trabalho_ativo_por_entregador_uidx
  on public.entregas(loja_id, entregador_id)
  where entregador_id is not null and status in ('aceito','em_rota','nao_entregue');

alter table public.caixa_entradas add column if not exists origem_entrega_id text;
create unique index if not exists caixa_entradas_origem_entrega_uidx
  on public.caixa_entradas(loja_id, origem_entrega_id)
  where origem_entrega_id is not null;

alter table public.rastreio_pontos add column if not exists cliente_evento_id uuid;
create unique index if not exists rastreio_pontos_cliente_evento_uidx
  on public.rastreio_pontos(cliente_evento_id)
  where cliente_evento_id is not null;

create table if not exists public.config_entregas (
  loja_id text primary key,
  nome_loja text,
  endereco_origem text,
  latitude_origem numeric check (latitude_origem between -90 and 90),
  longitude_origem numeric check (longitude_origem between -180 and 180),
  contexto_geocodificacao text not null default 'Brasil',
  velocidade_media_kmh numeric not null default 25 check (velocidade_media_kmh between 5 and 120),
  sla_minutos integer not null default 60 check (sla_minutos between 10 and 1440),
  precisao_maxima_m numeric not null default 150 check (precisao_maxima_m between 10 and 1000),
  exigir_pin boolean not null default true,
  exigir_localizacao boolean not null default true,
  exigir_foto boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.config_entregas(loja_id)
select distinct loja_id from public.perfis where loja_id is not null
on conflict (loja_id) do nothing;

create table if not exists public.entrega_eventos (
  id bigint generated always as identity primary key,
  loja_id text not null,
  entrega_id text not null references public.entregas(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in (
    'criada','aceita','em_rota','entregue','nao_entregue','cancelada',
    'rastreamento_iniciado','rastreamento_interrompido','observacao'
  )),
  status_anterior text,
  status_novo text,
  detalhe jsonb not null default '{}'::jsonb,
  lat numeric check (lat between -90 and 90),
  lng numeric check (lng between -180 and 180),
  precisao_m numeric,
  criado_em timestamptz not null default now()
);
create index if not exists entrega_eventos_entrega_criado_idx
  on public.entrega_eventos(loja_id, entrega_id, criado_em);

create table if not exists public.geocodificacao_cache (
  loja_id text not null,
  endereco_normalizado text not null,
  lat numeric not null check (lat between -90 and 90),
  lng numeric not null check (lng between -180 and 180),
  provedor text not null default 'nominatim',
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, endereco_normalizado)
);

alter table public.config_entregas enable row level security;
alter table public.entrega_eventos enable row level security;
alter table public.geocodificacao_cache enable row level security;

revoke all on public.config_entregas, public.entrega_eventos, public.geocodificacao_cache from anon, authenticated;
revoke all on public.entregas from anon, authenticated;
grant select on public.entregas to authenticated;
grant select, insert, update on public.config_entregas to authenticated;
grant select on public.entrega_eventos to authenticated;
grant select on public.geocodificacao_cache to authenticated;
grant usage, select on sequence public.entrega_eventos_id_seq to authenticated;

create or replace function private.entrega_atribuida_ao_usuario(p_loja text,p_entrega text,p_usuario uuid)
returns boolean language sql security definer stable set search_path='' as $$
  select exists(select 1 from public.entregas where loja_id=p_loja and id=p_entrega and entregador_id=p_usuario::text);
$$;
create or replace function private.entrega_ativa_atribuida_ao_usuario(p_loja text,p_entrega text,p_usuario uuid)
returns boolean language sql security definer stable set search_path='' as $$
  select exists(
    select 1 from public.entregas
    where loja_id=p_loja and id=p_entrega and entregador_id=p_usuario::text
      and status in ('aceito','em_rota','nao_entregue')
  );
$$;
revoke all on function private.entrega_atribuida_ao_usuario(text,text,uuid) from public,anon;
revoke all on function private.entrega_ativa_atribuida_ao_usuario(text,text,uuid) from public,anon;
grant execute on function private.entrega_atribuida_ao_usuario(text,text,uuid) to authenticated;
grant execute on function private.entrega_ativa_atribuida_ao_usuario(text,text,uuid) to authenticated;

drop policy if exists "ler entregas da loja" on public.entregas;
drop policy if exists "criar entrega da loja" on public.entregas;
drop policy if exists "atualizar entrega autorizada" on public.entregas;
drop policy if exists "gestao le entregas" on public.entregas;
create policy "gestao le entregas" on public.entregas for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
  );

drop policy if exists "equipe le configuracao entregas" on public.config_entregas;
drop policy if exists "gestao altera configuracao entregas" on public.config_entregas;
create policy "equipe le configuracao entregas" on public.config_entregas for select to authenticated
  using (loja_id = (select loja_id from public.perfis where id = (select auth.uid())));
create policy "gestao altera configuracao entregas" on public.config_entregas for all to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
  )
  with check (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente')
  );

drop policy if exists "ler eventos autorizados" on public.entrega_eventos;
create policy "ler eventos autorizados" on public.entrega_eventos for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
      or private.entrega_atribuida_ao_usuario(loja_id,entrega_id,(select auth.uid()))
    )
  );

drop policy if exists "gestao usa cache geocodificacao" on public.geocodificacao_cache;
create policy "gestao usa cache geocodificacao" on public.geocodificacao_cache for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
  );

-- Entregadores publicam e leem apenas a própria localização. O mapa geral
-- é exclusivo da gestão/atendimento.
drop policy if exists "ler rastreio da loja" on public.rastreio_entregadores;
drop policy if exists "publicar propria localizacao" on public.rastreio_entregadores;
drop policy if exists "atualizar propria localizacao" on public.rastreio_entregadores;
revoke insert, update, delete on public.rastreio_entregadores from authenticated;
grant select on public.rastreio_entregadores to authenticated;
create policy "ler rastreio autorizado" on public.rastreio_entregadores for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
      or entregador_id = (select auth.uid())
    )
  );

drop policy if exists "ler historico da loja" on public.rastreio_pontos;
drop policy if exists "publicar proprio ponto" on public.rastreio_pontos;
revoke insert, update, delete on public.rastreio_pontos from authenticated;
grant select on public.rastreio_pontos to authenticated;
create policy "ler historico autorizado" on public.rastreio_pontos for select to authenticated
  using (
    loja_id = (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
      or entregador_id = (select auth.uid())
    )
  );

-- Acesso ao bucket de comprovantes. O caminho é loja/entrega/arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-comprovantes', 'entregas-comprovantes', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "equipe le comprovantes entrega" on storage.objects;
drop policy if exists "entregador envia comprovante" on storage.objects;
drop policy if exists "entregador remove comprovante pendente" on storage.objects;
create policy "equipe le comprovantes entrega" on storage.objects for select to authenticated
  using (
    bucket_id = 'entregas-comprovantes'
    and (storage.foldername(name))[1] = (select loja_id from public.perfis where id = (select auth.uid()))
    and (
      (select role from public.perfis where id = (select auth.uid())) in ('owner','gerente','atendente')
      or private.entrega_atribuida_ao_usuario((storage.foldername(name))[1],(storage.foldername(name))[2],(select auth.uid()))
    )
  );
create policy "entregador envia comprovante" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'entregas-comprovantes'
    and (storage.foldername(name))[1] = (select loja_id from public.perfis where id = (select auth.uid()))
    and private.entrega_ativa_atribuida_ao_usuario((storage.foldername(name))[1],(storage.foldername(name))[2],(select auth.uid()))
  );
create policy "entregador remove comprovante pendente" on storage.objects for delete to authenticated
  using (
    bucket_id = 'entregas-comprovantes'
    and (storage.foldername(name))[1] = (select loja_id from public.perfis where id = (select auth.uid()))
    and private.entrega_ativa_atribuida_ao_usuario((storage.foldername(name))[1],(storage.foldername(name))[2],(select auth.uid()))
  );

-- Cria e reserva uma entrega em uma transação. O estoque é consolidado
-- pelo produto físico de origem, portanto doses consomem a garrafa vinculada.
create or replace function public.criar_entrega_atomica(p_entrega jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_loja text;
  v_role text;
  v_id text := nullif(trim(p_entrega ->> 'id'), '');
  v_itens jsonb := p_entrega -> 'itens';
  v_pin text := nullif(trim(p_entrega ->> 'codigo_confirmacao'), '');
  v_token uuid := coalesce(nullif(p_entrega ->> 'tracking_token', '')::uuid, gen_random_uuid());
  v_sla integer := 60;
  v_item record;
  v_row public.entregas%rowtype;
begin
  select loja_id, role into v_loja, v_role from public.perfis where id = v_usuario;
  if v_usuario is null or v_loja is null or v_role not in ('owner','gerente','atendente') then
    raise exception 'Usuário sem permissão para criar entregas';
  end if;
  if v_id is null or jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 then
    raise exception 'Entrega sem identificador ou itens';
  end if;
  if coalesce((p_entrega ->> 'total')::numeric, 0) <= 0
     or nullif(trim(p_entrega ->> 'cliente_nome'), '') is null
     or nullif(trim(p_entrega ->> 'endereco'), '') is null then
    raise exception 'Dados da entrega inválidos';
  end if;
  if exists (select 1 from public.entregas where id = v_id and loja_id = v_loja) then
    select * into v_row from public.entregas where id = v_id and loja_id = v_loja;
    return to_jsonb(v_row) || jsonb_build_object('duplicada', true);
  end if;

  insert into public.config_entregas(loja_id) values (v_loja)
  on conflict (loja_id) do nothing;
  select coalesce((select sla_minutos from public.config_entregas where loja_id = v_loja), 60) into v_sla;

  create temporary table if not exists pg_temp.consumo_entrega (
    produto_id text primary key,
    quantidade numeric not null
  ) on commit drop;
  truncate pg_temp.consumo_entrega;

  insert into pg_temp.consumo_entrega(produto_id, quantidade)
  select coalesce(produto.produto_estoque_origem_id, item.produto_id),
         sum(item.quantidade / greatest(coalesce(produto.unidades_por_estoque_origem, 1), 1))
  from jsonb_to_recordset(v_itens) as item(produto_id text, quantidade numeric, preco_unit numeric, produto_nome text)
  join public.produtos produto on produto.id = item.produto_id and produto.loja_id = v_loja
  where item.quantidade > 0 and item.preco_unit >= 0
  group by coalesce(produto.produto_estoque_origem_id, item.produto_id);

  if (select count(*) from pg_temp.consumo_entrega) = 0 then
    raise exception 'Nenhum item válido na entrega';
  end if;

  -- Bloqueia todas as origens antes de conferir/decrementar, evitando venda
  -- concorrente do mesmo saldo.
  perform 1
  from public.produtos produto
  join pg_temp.consumo_entrega consumo on consumo.produto_id = produto.id
  where produto.loja_id = v_loja
  order by produto.id
  for update of produto;

  if exists (
    select 1 from pg_temp.consumo_entrega consumo
    left join public.produtos produto on produto.id = consumo.produto_id and produto.loja_id = v_loja
    where produto.id is null or produto.estoque < consumo.quantidade
  ) then
    raise exception 'Estoque insuficiente para criar esta entrega';
  end if;

  insert into public.entregas (
    id,user_id,loja_id,cliente_id,cliente_nome,telefone,endereco,itens,total,taxa_entrega,
    pagamento,status,data,criado_em,obs,lat,lng,caixa_id,tracking_token,
    codigo_confirmacao,codigo_confirmacao_hash,previsao_entrega_em,atualizado_em
  ) values (
    v_id,v_usuario,v_loja,nullif(p_entrega ->> 'cliente_id',''),p_entrega ->> 'cliente_nome',
    nullif(p_entrega ->> 'telefone',''),p_entrega ->> 'endereco',v_itens,
    (p_entrega ->> 'total')::numeric,coalesce((p_entrega ->> 'taxa_entrega')::numeric,0),
    p_entrega ->> 'pagamento','pendente',coalesce(nullif(btrim(p_entrega ->> 'data'),'')::date,current_date),
    coalesce(nullif(btrim(p_entrega ->> 'criado_em'),'')::timestamptz,now()),nullif(p_entrega ->> 'obs',''),
    nullif(p_entrega ->> 'lat','')::numeric,nullif(p_entrega ->> 'lng','')::numeric,
    nullif(p_entrega ->> 'caixa_id',''),v_token,null,
    case when v_pin is null then null else extensions.crypt(v_pin, extensions.gen_salt('bf')) end,
    now() + make_interval(mins => v_sla),now()
  ) returning * into v_row;

  update public.produtos produto
  set estoque = produto.estoque - consumo.quantidade, updated_at = now()
  from pg_temp.consumo_entrega consumo
  where produto.id = consumo.produto_id and produto.loja_id = v_loja;

  for v_item in select * from pg_temp.consumo_entrega order by produto_id loop
    insert into public.movimentacoes(id,user_id,loja_id,produto_id,tipo,quantidade,data,obs,motivo)
    values (
      'mov_ent_' || substr(md5(v_id || ':' || v_item.produto_id),1,24),v_usuario,v_loja,
      v_item.produto_id,'saida',v_item.quantidade,current_date,
      'Reserva da entrega #' || right(v_id,4),'venda'
    ) on conflict (id) do nothing;
  end loop;

  insert into public.entrega_eventos(loja_id,entrega_id,usuario_id,tipo,status_novo,detalhe)
  values (v_loja,v_id,v_usuario,'criada','pendente',jsonb_build_object('itens',jsonb_array_length(v_itens),'total',(p_entrega ->> 'total')::numeric));
  insert into public.auditoria_operacional(loja_id,usuario_id,acao,entidade,entidade_id,payload)
  values (v_loja,v_usuario,'criou','entrega',v_id,jsonb_build_object('total',(p_entrega ->> 'total')::numeric));

  return to_jsonb(v_row);
end;
$$;

-- A única porta para mudança de status. Valida papel, responsável,
-- transição, PIN, prova, caixa e idempotência sob bloqueio de linha.
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

  -- Owner e gerente podem assumir pessoalmente uma entrega. Depois disso,
  -- seguem exatamente o fluxo e as provas exigidas de um entregador.
  if v_role = 'entregador' or (
    v_role in ('owner','gerente')
    and p_novo_status in ('aceito','em_rota','entregue','nao_entregue')
    and (p_novo_status = 'aceito' or v_entrega.entregador_id = v_usuario::text)
  ) then
    if p_novo_status = 'aceito' then
      if v_entrega.status <> 'pendente' or v_entrega.entregador_id is not null then
        raise exception 'Esta entrega já foi aceita por outro entregador';
      end if;
      if exists (
        select 1 from public.entregas
        where loja_id=v_loja and entregador_id=v_usuario::text
          and status in ('aceito','em_rota','nao_entregue') and id<>v_entrega.id
      ) then raise exception 'Conclua ou resolva sua entrega atual antes de aceitar outra'; end if;
      v_entrega.entregador_id := v_usuario::text;
      v_entrega.entregador_nome := v_nome;
    elsif v_entrega.entregador_id is distinct from v_usuario::text then
      raise exception 'Entrega atribuída a outro entregador';
    end if;
    if not (
      (v_entrega.status = 'pendente' and p_novo_status = 'aceito') or
      (v_entrega.status = 'aceito' and p_novo_status = 'em_rota') or
      (v_entrega.status = 'em_rota' and p_novo_status in ('entregue','nao_entregue')) or
      (v_entrega.status = 'nao_entregue' and p_novo_status = 'em_rota')
    ) then raise exception 'Transição não permitida para o entregador'; end if;
  elsif v_role in ('owner','gerente','atendente') then
    if not (
      (p_novo_status = 'cancelado' and v_entrega.status in ('pendente','aceito','nao_entregue')) or
      (p_novo_status = 'pendente' and v_entrega.status = 'nao_entregue') or
      (p_novo_status = 'em_rota' and v_entrega.status = 'aceito')
    ) then raise exception 'A gestão não pode concluir a entrega sem a prova do entregador'; end if;
  else
    raise exception 'Papel sem acesso ao fluxo de entregas';
  end if;

  if p_novo_status in ('cancelado','nao_entregue') and v_motivo is null then
    raise exception 'Informe o motivo da ocorrência';
  end if;

  if p_novo_status = 'entregue' then
    if v_recebedor is null then raise exception 'Informe quem recebeu o pedido'; end if;
    -- Entregas antigas podem não ter PIN; a exceção vale apenas para esse
    -- legado. Toda nova entrega nasce com hash e exige validação.
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
    -- Uma ocorrência reaberta volta à fila geral. Manter o entregador anterior
    -- deixaria o pedido invisível para os demais entregadores.
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

-- Lista sanitizada para o entregador: pedidos pendentes têm dados mínimos;
-- pedidos assumidos trazem os dados operacionais completos, nunca o PIN/hash.
create or replace function public.listar_entregas_entregador()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare v_usuario uuid := auth.uid(); v_loja text; v_role text; v_resultado jsonb;
begin
  select loja_id,role into v_loja,v_role from public.perfis where id = v_usuario;
  if v_role <> 'entregador' or v_loja is null then raise exception 'Acesso exclusivo do entregador'; end if;
  select coalesce(jsonb_agg(item order by item ->> 'criado_em' desc),'[]'::jsonb) into v_resultado
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',e.id,'cliente_nome',e.cliente_nome,'endereco',e.endereco,'status',e.status,
      'taxa_entrega',e.taxa_entrega,'criado_em',e.criado_em,'previsao_entrega_em',e.previsao_entrega_em,
      'entregador_id',e.entregador_id,'entregador_nome',e.entregador_nome,
      'telefone',case when e.entregador_id = v_usuario::text then e.telefone end,
      'itens',case when e.entregador_id = v_usuario::text then e.itens end,
      'total',case when e.entregador_id = v_usuario::text then e.total end,
      'pagamento',case when e.entregador_id = v_usuario::text then e.pagamento end,
      'obs',case when e.entregador_id = v_usuario::text then e.obs end,
      'lat',e.lat,'lng',e.lng,'aceito_em',e.aceito_em,'em_rota_em',e.em_rota_em,
      'nao_entregue_em',e.nao_entregue_em,'nao_entregue_motivo',e.nao_entregue_motivo
    )) item
    from public.entregas e
    where e.loja_id = v_loja and (
      (e.status = 'pendente' and e.entregador_id is null)
      or (e.entregador_id = v_usuario::text and e.status in ('aceito','em_rota','nao_entregue'))
    )
  ) dados;
  return v_resultado;
end;
$$;

-- Posição atual e histórico são gravados juntos e de forma idempotente.
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
  select loja_id,coalesce(nome,email,'Entregador') into v_loja,v_nome from public.perfis
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

-- Consulta pública por token opaco; não revela telefone, itens, valor ou
-- localização quando a entrega não está em rota.
create or replace function public.acompanhar_entrega_publica(p_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',right(e.id,4),'loja',coalesce(c.nome_loja,'Órbita'),'status',e.status,
    'criado_em',e.criado_em,'aceito_em',e.aceito_em,'em_rota_em',e.em_rota_em,
    'entregue_em',e.entregue_em,'previsao_entrega_em',e.previsao_entrega_em,
    'entregador',case when e.status='em_rota' then split_part(coalesce(e.entregador_nome,''),' ',1) end,
    'lat',case when e.status='em_rota' then r.lat end,
    'lng',case when e.status='em_rota' then r.lng end,
    'localizacao_atualizada_em',case when e.status='em_rota' then r.atualizado_em end
  ))
  from public.entregas e
  left join public.config_entregas c on c.loja_id=e.loja_id
  left join public.rastreio_entregadores r on r.loja_id=e.loja_id and r.entregador_id::text=e.entregador_id
  where e.tracking_token=p_token;
$$;

revoke all on function public.criar_entrega_atomica(jsonb) from public,anon;
revoke all on function public.transicionar_entrega_atomica(text,text,jsonb) from public,anon;
revoke all on function public.listar_entregas_entregador() from public,anon;
revoke all on function public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid) from public,anon;
revoke all on function public.acompanhar_entrega_publica(uuid) from public;
grant execute on function public.criar_entrega_atomica(jsonb) to authenticated;
grant execute on function public.transicionar_entrega_atomica(text,text,jsonb) to authenticated;
grant execute on function public.listar_entregas_entregador() to authenticated;
grant execute on function public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid) to authenticated;
grant execute on function public.acompanhar_entrega_publica(uuid) to anon,authenticated;

-- Realtime é habilitado explicitamente para as três fontes usadas pelo mapa.
do $$
declare v_tabela text;
begin
  foreach v_tabela in array array['entregas','rastreio_entregadores','rastreio_pontos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=v_tabela
    ) then execute format('alter publication supabase_realtime add table public.%I',v_tabela); end if;
  end loop;
end $$;

commit;
