# Checklist de produção do Órbita

## Banco e segurança

- Aplicar todas as migrations de `supabase/migrations` em homologação e depois em produção.
- Executar Security Advisor e Performance Advisor sem alertas críticos.
- Testar owner, gerente, atendente e entregador em duas lojas diferentes.
- Confirmar que nenhuma chave `service_role` está presente no frontend.
- Fazer um teste de restauração do backup antes de cadastrar clientes pagantes.

## Supabase

- Usar projeto separado para produção e variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do ambiente correto.
- Configurar SMTP próprio, domínio de redirecionamento e templates de autenticação.
- Ativar backups/PITR conforme o plano contratado e alertas de uso/indisponibilidade.
- Verificar em API Settings se as tabelas usadas pelo frontend estão expostas à Data API.

## Publicação

- Todo pull request precisa passar pelo workflow `Qualidade`.
- Publicar somente o artefato gerado por `npm run build`.
- Configurar domínio HTTPS, endereço de suporte e monitoramento de erros/disponibilidade.
- Validar instalação e atualização do PWA em Android, iOS e desktop.

## Teste de aceite

1. Venda simultânea em dois caixas sem estoque negativo.
2. Venda offline reenviada uma única vez após reconexão.
3. Compra sugerida, aprovada, em trânsito e recebida atualizando estoque.
4. Dose vinculada consumindo a garrafa e gerando reposição da garrafa.
5. Entregador acessando somente entregas e rastreamento da própria loja.
6. Relatórios conciliados com vendas, caixa e recebíveis.
