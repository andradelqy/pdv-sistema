-- ARQUIVO DE COMPATIBILIDADE — NÃO É UM RESET DO BANCO.
--
-- A versão antiga deste arquivo derrubava tabelas operacionais antes de
-- recriá-las. Isso não é seguro para homologação nem produção. O schema oficial
-- do Órbita agora é exclusivamente incremental e versionado em:
--
--   supabase/migrations/
--
-- Para um ambiente novo, use `supabase db reset` localmente ou aplique todas as
-- migrations na ordem. Para um banco remoto, valide a lista e execute primeiro
-- em homologação. Este arquivo permanece propositalmente sem comandos DDL para
-- que uma execução acidental não altere nem apague dados.

select 'Use as migrations versionadas em supabase/migrations; nenhuma alteração foi executada.' as orientacao;
