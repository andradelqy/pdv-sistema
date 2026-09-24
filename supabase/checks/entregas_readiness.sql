-- Auditoria somente leitura do módulo de entregas. Execute no SQL Editor
-- depois da migration 20260924183909. Os blocos 1 a 7 devem retornar zero linhas.

-- 1. Tabelas de entregas sem RLS.
select table_name
from information_schema.tables tabela
where tabela.table_schema = 'public'
  and tabela.table_name in (
    'entregas','config_entregas','entrega_eventos','geocodificacao_cache',
    'rastreio_entregadores','rastreio_pontos'
  )
  and not exists (
    select 1 from pg_class classe
    join pg_namespace schema on schema.oid = classe.relnamespace
    where schema.nspname = tabela.table_schema
      and classe.relname = tabela.table_name
      and classe.relrowsecurity
  );

-- 2. Tabelas que deveriam estar no Realtime, mas não estão na publicação.
select esperado.tabela
from unnest(array['entregas','rastreio_entregadores','rastreio_pontos']) esperado(tabela)
where not exists (
  select 1 from pg_publication_tables publicado
  where publicado.pubname = 'supabase_realtime'
    and publicado.schemaname = 'public'
    and publicado.tablename = esperado.tabela
);

-- 3. PIN em texto puro (inclusive legado).
select id, loja_id
from public.entregas
where codigo_confirmacao is not null;

-- 4. Tokens públicos ausentes ou repetidos.
select tracking_token, count(*)
from public.entregas
group by tracking_token
having tracking_token is null or count(*) > 1;

-- 5. Escrita direta nas tabelas operacionais. Toda mutação deve passar pelas RPCs.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('entregas','rastreio_entregadores','rastreio_pontos','geocodificacao_cache','entrega_eventos')
  and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');

-- 6. Um entregador não pode possuir mais de uma entrega ativa.
select loja_id, entregador_id, count(*) as entregas_ativas
from public.entregas
where entregador_id is not null and status in ('aceito','em_rota','nao_entregue')
group by loja_id, entregador_id
having count(*) > 1;

-- 7. Bucket de comprovantes ausente ou público.
select esperado.id, bucket.public
from (values ('entregas-comprovantes')) esperado(id)
left join storage.buckets bucket on bucket.id = esperado.id
where bucket.id is null or bucket.public;

-- 8. Resumo para o registro da release.
select
  now() as auditado_em,
  count(*) as entregas,
  count(*) filter (where status = 'pendente') as pendentes,
  count(*) filter (where status = 'em_rota') as em_rota,
  count(*) filter (where status = 'entregue') as entregues,
  count(*) filter (where status = 'nao_entregue') as nao_entregues,
  count(*) filter (where status = 'cancelado') as canceladas
from public.entregas;
