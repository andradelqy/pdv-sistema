# Backup e restauração do Órbita

O JSON exportado pelo aplicativo é uma portabilidade operacional e não substitui
o backup do banco. Para produção, habilite backups do Supabase compatíveis com o
RPO/RTO contratado e realize um ensaio de restauração em projeto separado.

## Ensaio obrigatório

1. Crie ou selecione um projeto Supabase exclusivo de homologação.
2. Restaure nele um backup recente da produção, sem alterar o projeto principal.
3. Use credenciais e domínio próprios de homologação.
4. Execute todas as migrations posteriores ao ponto restaurado.
5. Rode `supabase/checks/ecosystem_contract.sql` no banco restaurado.
6. Confirme que todas as linhas retornam `status = ok`.
7. Faça login com contas de teste owner, gerente, atendente e entregador.
8. Execute o roteiro de aceite de `docs/PRODUCAO.md`.
9. Registre data, duração, ponto restaurado, responsável e resultado.
10. Destrua ou anonimize os dados restaurados ao encerrar o ensaio.

## Critério de aprovação

- Restauração termina dentro do RTO definido comercialmente.
- Nenhuma tabela, RPC, policy, item de venda ou composição fica ausente.
- Venda, compra, entrega, catálogo e relatórios permanecem conciliados.
- Não existem dados de uma loja visíveis para outra.

Nunca faça o primeiro teste de restauração sobre o banco de produção.
