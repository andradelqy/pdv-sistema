-- Auditoria somente leitura do contrato entre os módulos do Órbita.
-- Pode ser executada em produção ou em um clone restaurado.

with verificacoes as (
  select 'tabelas_publicas_sem_rls' as verificacao, count(*)::bigint as total
  from pg_tables where schemaname = 'public' and not rowsecurity
  union all
  select 'grants_anon_em_tabelas', count(*)::bigint
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
  union all
  select 'perfis_invalidos', count(*)::bigint from public.perfis
  where loja_id is null or btrim(loja_id) = ''
     or role not in ('owner','gerente','atendente','entregador')
  union all
  select 'lojas_sem_assinatura', count(*)::bigint
  from (select distinct loja_id from public.perfis where loja_id is not null) loja
  left join public.assinaturas_lojas assinatura using (loja_id)
  where assinatura.loja_id is null
  union all
  select 'produtos_com_estoque_negativo', count(*)::bigint from public.produtos
  where estoque < 0
  union all
  select 'composicoes_sem_origem', count(*)::bigint from public.produtos derivado
  left join public.produtos origem
    on origem.id = derivado.produto_estoque_origem_id
   and origem.loja_id = derivado.loja_id
  where derivado.produto_estoque_origem_id is not null and origem.id is null
  union all
  select 'itens_venda_orfaos', count(*)::bigint from public.itens_venda item
  left join public.vendas venda on venda.id = item.venda_id
  where venda.id is null
  union all
  select 'itens_compra_orfaos', count(*)::bigint from public.itens_pedido_compra item
  left join public.pedidos_compra pedido on pedido.id = item.pedido_id
  where pedido.id is null
  union all
  select 'itens_compra_duplicados', count(*)::bigint from (
    select pedido_id, produto_id from public.itens_pedido_compra
    group by pedido_id, produto_id having count(*) > 1
  ) duplicado
  union all
  select 'entregas_com_status_invalido', count(*)::bigint from public.entregas
  where status not in ('pendente','aceito','em_rota','entregue','cancelado','nao_entregue')
), contratos as (
  select 'rpc_venda_atomica' as verificacao,
    (to_regprocedure('public.confirmar_venda_atomica(jsonb,jsonb,text)') is not null)::int::bigint as total
  union all select 'rpc_entrega_atomica',
    (to_regprocedure('public.criar_entrega_atomica(jsonb)') is not null)::int::bigint
  union all select 'rpc_recebimento_compra',
    (to_regprocedure('public.receber_pedido_compra_atomico(uuid)') is not null)::int::bigint
  union all select 'rpc_transicao_entrega_invoker', coalesce((
    select (not prosecdef)::int::bigint from pg_proc
    where oid = to_regprocedure('public.transicionar_entrega_atomica(text,text,jsonb)')
  ), 0)
  union all select 'rpc_lista_entregador_invoker', coalesce((
    select (not prosecdef)::int::bigint from pg_proc
    where oid = to_regprocedure('public.listar_entregas_entregador()')
  ), 0)
  union all select 'rpc_localizacao_invoker', coalesce((
    select (not prosecdef)::int::bigint from pg_proc
    where oid = to_regprocedure('public.publicar_localizacao_entrega(text,numeric,numeric,numeric,uuid)')
  ), 0)
  union all select 'realtime_entregas', exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entregas'
  )::int::bigint
  union all select 'realtime_rastreio', exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rastreio_entregadores'
  )::int::bigint
)
select 'integridade' as grupo, verificacao,
  case when total = 0 then 'ok' else 'falha' end as status, total
from verificacoes
union all
select 'contrato', verificacao,
  case when total = 1 then 'ok' else 'falha' end, total
from contratos
order by grupo, verificacao;
