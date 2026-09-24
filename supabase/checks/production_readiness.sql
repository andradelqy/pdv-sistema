-- Auditoria somente leitura. Execute no SQL Editor depois das migrations.
-- Cada bloco saudável deve retornar zero linhas, exceto o resumo final.

-- 1. Tabelas públicas sem RLS.
select schemaname, tablename
from pg_tables
where schemaname = 'public' and not rowsecurity
order by tablename;

-- 2. Visitantes anônimos com acesso a tabelas da aplicação.
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
order by table_name, privilege_type;

-- 3. SECURITY DEFINER no schema exposto public. As funções listadas precisam
-- ter autenticação interna, search_path vazio e EXECUTE revogado de PUBLIC.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('public', p.oid, 'execute') as public_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 4. Perfis sem loja ou com papel inválido.
select id, email, role, loja_id
from public.perfis
where loja_id is null or btrim(loja_id) = ''
   or role not in ('owner', 'gerente', 'atendente', 'entregador');

-- 5. Loja com perfil, mas sem assinatura única.
select perfil.loja_id, count(distinct assinatura.loja_id) as assinaturas
from public.perfis perfil
left join public.assinaturas_lojas assinatura on assinatura.loja_id = perfil.loja_id
where perfil.loja_id is not null
group by perfil.loja_id
having count(distinct assinatura.loja_id) <> 1;

-- 6. Tabelas com loja_id sem política restritiva de assinatura. Credenciais e
-- telemetria são exceções intencionais.
select coluna.table_name
from information_schema.columns coluna
where coluna.table_schema = 'public'
  and coluna.column_name = 'loja_id'
  and coluna.table_name not in ('perfis', 'assinaturas_lojas', 'whatsapp_credenciais', 'erros_aplicacao')
  and not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = coluna.table_name
      and policy.policyname = 'assinatura ativa da loja'
  )
order by coluna.table_name;

-- 7. Resumo útil para registrar no checklist da release.
select
  current_database() as banco,
  now() as auditado_em,
  (select count(*) from public.perfis) as perfis,
  (select count(*) from public.assinaturas_lojas) as lojas,
  (select count(*) from public.produtos) as produtos,
  (select count(*) from public.vendas) as vendas,
  (select count(*) from public.erros_aplicacao where criado_em >= now() - interval '24 hours') as erros_24h;

