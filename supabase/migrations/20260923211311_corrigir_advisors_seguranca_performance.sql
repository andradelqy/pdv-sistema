begin;

-- Corrige os avisos exportados dos Security e Performance Advisors em
-- 2026-09-23. A migration preserva o comportamento do app e reduz a
-- superfície exposta pela Data API.

-- Somente papéis administrativos podem criar objetos nos schemas usados por
-- funções com privilégios elevados. Isso torna o search_path fixo seguro.
revoke create on schema public from public, anon, authenticated;

-- Uma única policy permissiva por ação evita avaliar duas expressões SELECT
-- para cada linha de perfis, sem alterar quem pode ver cada perfil.
drop policy if exists "ler proprio perfil" on public.perfis;
drop policy if exists "gestao le equipe" on public.perfis;
drop policy if exists "ler perfil autorizado" on public.perfis;
create policy "ler perfil autorizado"
on public.perfis for select to authenticated
using (
  id = (select auth.uid())
  or (
    loja_id = (select private.loja_atual())
    and (select private.papel_atual()) in ('owner', 'gerente')
  )
);

-- O ponto é gravado exclusivamente pela RPC, que valida loja, papel,
-- assinatura, localização e PIN. A policy antiga WITH CHECK (true) não é
-- necessária e permitia inserções irrestritas caso um GRANT fosse reaberto.
drop policy if exists "Permitir registro de ponto" on public.ponto_eletronico;
revoke insert, update, delete on public.ponto_eletronico from authenticated;

-- Consolida as duas policies permissivas de leitura do ponto. A policy
-- restritiva "assinatura ativa da loja" continua sendo aplicada em conjunto.
drop policy if exists "Permitir leitura de ponto" on public.ponto_eletronico;
drop policy if exists "gestao consulta ponto da loja" on public.ponto_eletronico;
create policy "gestao consulta ponto da loja"
on public.ponto_eletronico for select to authenticated
using (
  loja_id = (select private.loja_atual())
  and (select private.papel_atual()) in ('owner', 'gerente')
);

-- Remove apenas os índices redundantes criados pelo hardening. Os índices
-- equivalentes terminados em _id_idx permanecem ativos.
drop index if exists public.caixa_entradas_caixa_idx;
drop index if exists public.itens_venda_produto_idx;
drop index if exists public.itens_venda_venda_idx;

-- Funções legadas: fixa o search_path e remove execução direta. Elas não são
-- chamadas pelo frontend atual; triggers/cron continuam funcionando pelo OID
-- e pelo papel proprietário.
do $$
begin
  if to_regprocedure('public.registrar_venda(jsonb)') is not null then
    execute 'alter function public.registrar_venda(jsonb) set search_path = pg_catalog, public, extensions';
    execute 'revoke execute on function public.registrar_venda(jsonb) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() set search_path = pg_catalog, public, extensions';
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.checar_estoque_baixo()') is not null then
    execute 'alter function public.checar_estoque_baixo() set search_path = pg_catalog, public, extensions';
    execute 'revoke execute on function public.checar_estoque_baixo() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.refresh_curva_abc()') is not null then
    execute 'alter function public.refresh_curva_abc() set search_path = pg_catalog, public, extensions';
    execute 'revoke execute on function public.refresh_curva_abc() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.ajustar_fator_correcao(text,text,numeric)') is not null then
    execute 'alter function public.ajustar_fator_correcao(text, text, numeric) set search_path = pg_catalog, public, extensions';
    execute 'revoke execute on function public.ajustar_fator_correcao(text, text, numeric) from public, anon, authenticated';
  end if;
end
$$;

-- As três RPCs abaixo precisam elevar privilégios para executar uma operação
-- atômica, mas a implementação privilegiada não deve ficar em um schema
-- exposto. Movemos a implementação para private e mantemos em public apenas
-- wrappers SECURITY INVOKER compatíveis com o frontend.
do $$
begin
  if to_regprocedure('private.receber_pedido_compra_atomico(uuid)') is null
     and to_regprocedure('public.receber_pedido_compra_atomico(uuid)') is not null then
    alter function public.receber_pedido_compra_atomico(uuid) set schema private;
  end if;

  if to_regprocedure('private.registrar_ponto(uuid,text,text,numeric,numeric)') is null
     and to_regprocedure('public.registrar_ponto(uuid,text,text,numeric,numeric)') is not null then
    alter function public.registrar_ponto(uuid, text, text, numeric, numeric) set schema private;
  end if;

  if to_regprocedure('private.definir_pin_ponto(uuid,text)') is null
     and to_regprocedure('public.definir_pin_ponto(uuid,text)') is not null then
    alter function public.definir_pin_ponto(uuid, text) set schema private;
  end if;
end
$$;

revoke all on function private.receber_pedido_compra_atomico(uuid)
  from public, anon, authenticated;
grant execute on function private.receber_pedido_compra_atomico(uuid)
  to authenticated, service_role;

revoke all on function private.registrar_ponto(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function private.registrar_ponto(uuid, text, text, numeric, numeric)
  to authenticated, service_role;

revoke all on function private.definir_pin_ponto(uuid, text)
  from public, anon, authenticated;
grant execute on function private.definir_pin_ponto(uuid, text)
  to authenticated, service_role;

create or replace function public.receber_pedido_compra_atomico(p_pedido_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.receber_pedido_compra_atomico(p_pedido_id)
$$;

create or replace function public.registrar_ponto(
  p_funcionario_id uuid,
  p_pin text,
  p_tipo text,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.registrar_ponto(
    p_funcionario_id, p_pin, p_tipo, p_latitude, p_longitude
  )
$$;

create or replace function public.definir_pin_ponto(
  p_funcionario_id uuid,
  p_novo_pin text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.definir_pin_ponto(p_funcionario_id, p_novo_pin)
$$;

revoke all on function public.receber_pedido_compra_atomico(uuid)
  from public, anon;
grant execute on function public.receber_pedido_compra_atomico(uuid)
  to authenticated, service_role;

revoke all on function public.registrar_ponto(uuid, text, text, numeric, numeric)
  from public, anon;
grant execute on function public.registrar_ponto(uuid, text, text, numeric, numeric)
  to authenticated, service_role;

revoke all on function public.definir_pin_ponto(uuid, text)
  from public, anon;
grant execute on function public.definir_pin_ponto(uuid, text)
  to authenticated, service_role;

commit;
