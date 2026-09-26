begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- O PIN recuperável não fica na tabela pública de entregas. A tabela privada
-- não é exposta pelo Data API e não concede leitura direta a nenhum cliente.
create table if not exists private.entrega_codigos_cliente (
  entrega_id text primary key references public.entregas(id) on delete cascade,
  loja_id text not null,
  codigo text not null check (codigo ~ '^[0-9]{4}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table private.entrega_codigos_cliente enable row level security;
revoke all on table private.entrega_codigos_cliente from public, anon, authenticated;

-- Chamada somente pelo wrapper de criação. A função confere usuário, loja,
-- papel e autoria da entrega antes de gravar o código.
create or replace function private.registrar_codigo_cliente_entrega(
  p_entrega_id text,
  p_codigo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_loja text;
begin
  if p_codigo !~ '^[0-9]{4}$' then
    raise exception 'Código de confirmação inválido';
  end if;

  select e.loja_id
  into v_loja
  from public.entregas e
  join public.perfis p
    on p.id = v_usuario
   and p.loja_id = e.loja_id
   and p.status = 'ativo'
   and p.role in ('owner', 'gerente', 'atendente')
  where e.id = p_entrega_id
    and e.user_id = v_usuario;

  if v_usuario is null or v_loja is null then
    raise exception 'Usuário sem permissão para registrar o código da entrega';
  end if;

  insert into private.entrega_codigos_cliente(entrega_id, loja_id, codigo)
  values (p_entrega_id, v_loja, p_codigo)
  on conflict (entrega_id) do nothing;
end;
$$;

revoke all on function private.registrar_codigo_cliente_entrega(text, text)
  from public, anon;
grant execute on function private.registrar_codigo_cliente_entrega(text, text)
  to authenticated;

-- Mantém a implementação transacional existente e registra o mesmo PIN cuja
-- versão bcrypt foi salva na entrega. Repetições idempotentes não substituem o
-- código original.
create or replace function public.criar_entrega_atomica(p_entrega jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entrega jsonb := coalesce(p_entrega, '{}'::jsonb);
  v_resultado jsonb;
  v_codigo text;
begin
  if nullif(btrim(v_entrega ->> 'data'), '') is null then
    v_entrega := jsonb_set(v_entrega, '{data}', to_jsonb(current_date::text), true);
  end if;
  if nullif(btrim(v_entrega ->> 'criado_em'), '') is null then
    v_entrega := jsonb_set(v_entrega, '{criado_em}', to_jsonb(now()::text), true);
  end if;

  v_resultado := private.criar_entrega_atomica_impl_data_v1(v_entrega);
  v_codigo := nullif(btrim(v_entrega ->> 'codigo_confirmacao'), '');

  if v_codigo is not null
     and coalesce((v_resultado ->> 'duplicada')::boolean, false) = false then
    perform private.registrar_codigo_cliente_entrega(v_resultado ->> 'id', v_codigo);
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.criar_entrega_atomica(jsonb) from public, anon;
grant execute on function public.criar_entrega_atomica(jsonb) to authenticated;

-- Os hashes bcrypt antigos não são reversíveis. Para pedidos ainda em aberto,
-- emite-se uma nova credencial uma única vez e o hash é trocado na mesma
-- transação, garantindo que o código exibido seja exatamente o validado.
do $$
declare
  v_entrega record;
  v_codigo text;
begin
  for v_entrega in
    select e.id, e.loja_id
    from public.entregas e
    left join private.entrega_codigos_cliente c on c.entrega_id = e.id
    where e.status in ('pendente', 'aceito', 'em_rota', 'nao_entregue')
      and c.entrega_id is null
    order by e.id
    for update of e
  loop
    v_codigo := lpad(floor(random() * 10000)::integer::text, 4, '0');
    insert into private.entrega_codigos_cliente(entrega_id, loja_id, codigo)
    values (v_entrega.id, v_entrega.loja_id, v_codigo);

    update public.entregas
    set codigo_confirmacao = null,
        codigo_confirmacao_hash = extensions.crypt(v_codigo, extensions.gen_salt('bf')),
        atualizado_em = now()
    where id = v_entrega.id;
  end loop;
end;
$$;

-- Painel interno: somente gestão ativa da mesma loja pode consultar o PIN.
create or replace function private.obter_codigo_cliente_entrega(p_entrega_id text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_codigo text;
begin
  select c.codigo
  into v_codigo
  from private.entrega_codigos_cliente c
  join public.entregas e
    on e.id = c.entrega_id
   and e.loja_id = c.loja_id
  join public.perfis p
    on p.id = v_usuario
   and p.loja_id = e.loja_id
   and p.status = 'ativo'
   and p.role in ('owner', 'gerente', 'atendente')
  where e.id = p_entrega_id;

  return v_codigo;
end;
$$;

revoke all on function private.obter_codigo_cliente_entrega(text)
  from public, anon;
grant execute on function private.obter_codigo_cliente_entrega(text)
  to authenticated;

create or replace function public.obter_codigo_cliente_entrega(p_entrega_id text)
returns text
language sql
security invoker
stable
set search_path = ''
as $$
  select private.obter_codigo_cliente_entrega(p_entrega_id);
$$;

revoke all on function public.obter_codigo_cliente_entrega(text) from public, anon;
grant execute on function public.obter_codigo_cliente_entrega(text) to authenticated;

-- Link público: o token UUID é a credencial de acesso do cliente. O PIN é
-- revelado apenas enquanto ainda pode ser necessário para o recebimento.
create or replace function private.acompanhar_entrega_publica(p_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',right(e.id,4),'loja',coalesce(cfg.nome_loja,'Órbita'),'status',e.status,
    'codigo_confirmacao',case
      when e.status in ('pendente','aceito','em_rota','nao_entregue') then cod.codigo
    end,
    'criado_em',e.criado_em,'aceito_em',e.aceito_em,'em_rota_em',e.em_rota_em,
    'entregue_em',e.entregue_em,'previsao_entrega_em',e.previsao_entrega_em,
    'entregador',case when e.status='em_rota' then split_part(coalesce(e.entregador_nome,''),' ',1) end,
    'lat',case when e.status='em_rota' then r.lat end,
    'lng',case when e.status='em_rota' then r.lng end,
    'localizacao_atualizada_em',case when e.status='em_rota' then r.atualizado_em end
  ))
  from public.entregas e
  left join public.config_entregas cfg on cfg.loja_id=e.loja_id
  left join public.rastreio_entregadores r on r.loja_id=e.loja_id and r.entregador_id::text=e.entregador_id
  left join private.entrega_codigos_cliente cod on cod.entrega_id=e.id and cod.loja_id=e.loja_id
  where e.tracking_token=p_token;
$$;

revoke all on function private.acompanhar_entrega_publica(uuid) from public;
grant execute on function private.acompanhar_entrega_publica(uuid) to anon, authenticated;

create or replace function public.acompanhar_entrega_publica(p_token uuid)
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select private.acompanhar_entrega_publica(p_token);
$$;

revoke all on function public.acompanhar_entrega_publica(uuid) from public;
grant execute on function public.acompanhar_entrega_publica(uuid) to anon, authenticated;

comment on table private.entrega_codigos_cliente is
  'PIN recuperável da entrega; acesso somente pelas funções controladas de gestão e pelo token público do cliente.';

commit;
