# Checklist de produção do Órbita

## Banco e segurança

- Aplicar todas as migrations de `supabase/migrations` em homologação e depois em produção.
- Aplicar `20260923182718_production_hardening.sql` e, por último,
  `20260923211311_corrigir_advisors_seguranca_performance.sql`; validar as RPCs
  `receber_pedido_compra_atomico`, `registrar_ponto` e `definir_pin_ponto`.
- Aplicar `20260924183909_entregas_rastreabilidade_producao.sql`, implantar a
  função `geocodificar-entrega` e definir o segredo `GEOCODING_CONTACT`.
- Executar Security Advisor, Performance Advisor e Health Advisor sem alertas críticos.
- No plano Pro, ativar em Auth Settings a proteção contra senhas vazadas. No
  plano Free, manter senha mínima forte e registrar essa limitação operacional.
- Testar owner, gerente, atendente e entregador em duas lojas diferentes.
- Confirmar que nenhuma chave `service_role` está presente no frontend.
- Fazer um teste de restauração do backup antes de cadastrar clientes pagantes.

## Supabase

- Usar projeto separado para produção e variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do ambiente correto.
- Configurar SMTP próprio, domínio de redirecionamento e templates de autenticação.
- Ativar backups/PITR conforme o plano contratado e alertas de uso/indisponibilidade.
- Verificar em API Settings se as tabelas usadas pelo frontend estão expostas à Data API.
- Confirmar privilégios explícitos de `authenticated`; `anon` não deve acessar
  tabelas operacionais.
- Executar `supabase/checks/production_readiness.sql`: os seis primeiros blocos
  devem ficar vazios, exceto a revisão intencional das funções privilegiadas.

## Publicação

- Todo pull request precisa passar pelo workflow `Qualidade`.
- Publicar somente o artefato gerado por `npm run build`.
- Configurar domínio HTTPS, endereço de suporte e monitoramento de erros/disponibilidade.
- Validar instalação e atualização do PWA em Android, iOS e desktop.
- Preencher `VITE_LEGAL_NAME`, `VITE_LEGAL_DOCUMENT`, `VITE_SUPPORT_EMAIL` e
  `VITE_PRIVACY_EMAIL` no ambiente de produção.
- Executar `npm run test:e2e`; o workflow também executa os cenários em Chromium.

## Teste de aceite

1. Venda simultânea em dois caixas sem estoque negativo.
2. Venda offline reenviada uma única vez após reconexão.
3. Compra sugerida, aprovada, em trânsito e recebida atualizando estoque.
4. Dose vinculada consumindo a garrafa e gerando reposição da garrafa.
5. Entregador acessando somente entregas e rastreamento da própria loja.
6. Relatórios conciliados com vendas, caixa e recebíveis.
7. PIN do ponto não aparece em nenhuma resposta da Data API.
8. Fila offline e carrinho não migram entre usuários/lojas no mesmo navegador.
9. Erro proposital aparece em `erros_aplicacao` somente para owner/gerente da loja.
10. Duas entregas simultâneas não deixam o mesmo entregador aceitar ambas.
11. Aceite, saída, tentativa sem sucesso, reabertura e cancelamento preservam o histórico.
12. Conclusão sem PIN/GPS/foto é bloqueada conforme a configuração da loja.
13. O link público não expõe telefone, endereço, produtos, pagamento nem valor.
14. Pontos GPS duplicados e saltos fisicamente impossíveis não poluem a rota.

## Dependências externas que não podem ser automatizadas pelo código

- Domínio, DNS, HTTPS, caixa postal de suporte e SMTP.
- Plano de backup/PITR e teste real de restauração do projeto Supabase.
- Dados e revisão jurídica do operador.
- Credenciais, contrato e homologação de integração fiscal, TEF ou gateway.
- Aprovação da Meta caso o modo profissional do WhatsApp seja ativado. As Edge
  Functions profissionais permanecem desativadas em `supabase/config.toml`.
