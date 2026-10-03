begin;

-- Três planos comerciais. Valores antigos continuam com acesso equivalente:
-- teste -> Pro; cortesia e rótulos legados -> Empresarial.
update public.assinaturas_lojas
set plano = case
  when lower(btrim(plano)) in ('basico', 'pro', 'empresarial', 'cortesia') then lower(btrim(plano))
  when lower(btrim(plano)) in ('teste', 'trial') then 'pro'
  else 'empresarial'
end;

alter table public.assinaturas_lojas alter column plano set default 'basico';
alter table public.assinaturas_lojas drop constraint if exists assinaturas_lojas_plano_check;
alter table public.assinaturas_lojas add constraint assinaturas_lojas_plano_check
  check (plano in ('basico', 'pro', 'empresarial', 'cortesia'));

comment on column public.assinaturas_lojas.plano is
  'Plano comercial da loja: basico, pro ou empresarial. Cortesia preserva acesso empresarial para uso interno.';

create or replace function private.plano_normalizado(p_plano text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_plano, '')))
    when 'basico' then 'basico'
    when 'pro' then 'pro'
    when 'teste' then 'pro'
    when 'trial' then 'pro'
    else 'empresarial'
  end
$$;

create or replace function private.limite_usuarios_plano(p_loja_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case private.plano_normalizado(coalesce((
    select assinatura.plano
    from public.assinaturas_lojas assinatura
    where assinatura.loja_id = p_loja_id
  ), 'basico'))
    when 'basico' then 2
    when 'pro' then 7
    else 20
  end
$$;

-- Proteção definitiva do limite: vale para painel, Edge Function e chamadas
-- diretas à API. O bloqueio da assinatura durante a contagem serializa dois
-- convites simultâneos da mesma loja.
create or replace function private.validar_plano_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano text;
  v_limite integer;
  v_ativos integer;
begin
  if new.loja_id is null or btrim(new.loja_id) = '' or new.status <> 'ativo' then
    return new;
  end if;

  perform 1 from public.assinaturas_lojas where loja_id = new.loja_id for update;
  select private.plano_normalizado(coalesce(assinatura.plano, 'basico'))
    into v_plano
  from (select 1) base
  left join public.assinaturas_lojas assinatura on assinatura.loja_id = new.loja_id;

  v_limite := case v_plano when 'basico' then 2 when 'pro' then 7 else 20 end;
  if v_plano = 'basico' and new.role not in ('owner', 'atendente') then
    raise exception using errcode = 'P0001',
      message = 'O plano Básico permite somente os papéis owner e atendente';
  end if;

  select count(*)::integer into v_ativos
  from public.perfis perfil
  where perfil.loja_id = new.loja_id
    and perfil.status = 'ativo'
    and perfil.id <> new.id;

  if v_ativos >= v_limite then
    raise exception using errcode = 'P0001',
      message = format('Limite de %s usuários ativos atingido no plano %s', v_limite, v_plano);
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_validar_plano on public.perfis;
create trigger perfis_validar_plano
before insert or update of loja_id, role, status on public.perfis
for each row execute function private.validar_plano_do_perfil();

-- Impede uma troca manual de plano que deixaria a loja em estado inválido.
create or replace function private.validar_troca_de_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano text := private.plano_normalizado(new.plano);
  v_limite integer;
  v_ativos integer;
  v_papeis_incompativeis integer;
begin
  v_limite := case v_plano when 'basico' then 2 when 'pro' then 7 else 20 end;
  select count(*)::integer,
         count(*) filter (where role not in ('owner', 'atendente'))::integer
    into v_ativos, v_papeis_incompativeis
  from public.perfis
  where loja_id = new.loja_id and status = 'ativo';

  if v_ativos > v_limite then
    raise exception using errcode = 'P0001',
      message = format('Desative usuários antes da troca: %s ativos para um limite de %s', v_ativos, v_limite);
  end if;
  if v_plano = 'basico' and v_papeis_incompativeis > 0 then
    raise exception using errcode = 'P0001',
      message = 'Altere ou desative gerentes e entregadores antes de contratar o plano Básico';
  end if;
  return new;
end;
$$;

drop trigger if exists assinaturas_validar_troca_plano on public.assinaturas_lojas;
create trigger assinaturas_validar_troca_plano
before update of plano on public.assinaturas_lojas
for each row when (old.plano is distinct from new.plano)
execute function private.validar_troca_de_plano();

-- Novas lojas experimentam os recursos Pro durante os sete dias já previstos.
create or replace function private.provisionar_assinatura_nova_loja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner' and new.loja_id is not null and btrim(new.loja_id) <> '' then
    insert into public.assinaturas_lojas (
      loja_id, nome_loja, plano, status, periodo_teste_ate
    ) values (
      new.loja_id, new.loja_id, 'pro', 'trial', now() + interval '7 days'
    ) on conflict (loja_id) do nothing;
  end if;
  return new;
end;
$$;

-- Usada somente pelas policies abaixo. O loja_id sempre vem do perfil da
-- sessão; o cliente nunca escolhe qual assinatura consultar.
create or replace function private.recurso_avancado_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.plano_normalizado(assinatura.plano) in ('pro', 'empresarial')
    from public.assinaturas_lojas assinatura
    where assinatura.loja_id = (select private.loja_atual())
  ), false)
$$;

revoke all on function private.plano_normalizado(text),
  private.limite_usuarios_plano(text), private.validar_plano_do_perfil(),
  private.validar_troca_de_plano(), private.provisionar_assinatura_nova_loja(),
  private.recurso_avancado_liberado()
from public, anon, authenticated;
grant execute on function private.recurso_avancado_liberado() to authenticated;

-- Defesa no banco para módulos Pro/Empresarial. Policies existentes de loja,
-- papel e assinatura continuam valendo em conjunto (AS RESTRICTIVE).
do $$
declare
  v_tabela text;
  v_tabelas text[] := array[
    'ajustes_previsao', 'campanha_destinatarios', 'campanhas_whatsapp',
    'clientes', 'config_agente', 'config_entregas', 'config_pesos_importancia',
    'entrega_eventos', 'entregas', 'fatores_sazonalidade', 'fornecedores',
    'historico_precos_compra', 'itens_pedido_compra', 'log_compras_simuladas',
    'log_decisoes_compra', 'ofertas', 'pedidos_compra', 'ponto_eletronico',
    'rastreio_entregadores', 'rastreio_pontos', 'rotas_entregas',
    'whatsapp_configuracoes'
  ];
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass('public.' || v_tabela) is not null then
      execute format('alter table public.%I enable row level security', v_tabela);
      execute format('drop policy if exists "recurso avancado do plano" on public.%I', v_tabela);
      execute format(
        'create policy "recurso avancado do plano" on public.%I as restrictive for all to authenticated
         using ((select private.recurso_avancado_liberado()))
         with check ((select private.recurso_avancado_liberado()))',
        v_tabela
      );
    end if;
  end loop;
end
$$;

-- Security-definer RPCs ignoram RLS por definição. Este trigger mantém a
-- regra comercial também quando a gravação passa por uma operação atômica.
create or replace function private.exigir_recurso_avancado_em_mutacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.recurso_avancado_liberado() then
    raise exception using errcode = 'P0001',
      message = 'Este recurso está disponível a partir do plano Pro';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.exigir_recurso_avancado_em_mutacao()
  from public, anon, authenticated;

do $$
declare
  v_tabela text;
  v_tabelas text[] := array[
    'ajustes_previsao', 'campanha_destinatarios', 'campanhas_whatsapp',
    'clientes', 'config_agente', 'config_entregas', 'config_pesos_importancia',
    'entrega_eventos', 'entregas', 'fatores_sazonalidade', 'fornecedores',
    'historico_precos_compra', 'itens_pedido_compra', 'log_compras_simuladas',
    'log_decisoes_compra', 'ofertas', 'pedidos_compra', 'ponto_eletronico',
    'rastreio_entregadores', 'rastreio_pontos', 'rotas_entregas',
    'whatsapp_configuracoes'
  ];
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass('public.' || v_tabela) is not null then
      execute format('drop trigger if exists plano_exigir_recurso_avancado on public.%I', v_tabela);
      execute format(
        'create trigger plano_exigir_recurso_avancado before insert or update or delete on public.%I
         for each row execute function private.exigir_recurso_avancado_em_mutacao()',
        v_tabela
      );
    end if;
  end loop;
end
$$;

-- No Básico, composições antigas são preservadas para uma futura reativação,
-- mas não é possível criar nem alterar o vínculo dose/garrafa.
create or replace function private.validar_composicao_no_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano text;
begin
  select private.plano_normalizado(coalesce(assinatura.plano, 'basico'))
    into v_plano
  from (select 1) base
  left join public.assinaturas_lojas assinatura on assinatura.loja_id = new.loja_id;

  if v_plano = 'basico' and new.produto_estoque_origem_id is not null and (
    tg_op = 'INSERT'
    or old.produto_estoque_origem_id is distinct from new.produto_estoque_origem_id
    or old.unidades_por_estoque_origem is distinct from new.unidades_por_estoque_origem
  ) then
    raise exception using errcode = 'P0001',
      message = 'Composição de estoque está disponível a partir do plano Pro';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_composicao_no_plano() from public, anon, authenticated;
drop trigger if exists produtos_validar_composicao_plano on public.produtos;
create trigger produtos_validar_composicao_plano
before insert or update of produto_estoque_origem_id, unidades_por_estoque_origem on public.produtos
for each row execute function private.validar_composicao_no_plano();

commit;
