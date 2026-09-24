# Entregas, prova e rastreamento

O fluxo de entregas do Órbita usa o banco como fonte de verdade. A interface
não confirma aceite, cancelamento ou conclusão antes do Supabase responder.

## Implantação

1. Aplique `supabase/migrations/20260924183909_entregas_rastreabilidade_producao.sql`.
2. Publique a função `geocodificar-entrega`:

   ```bash
   npx supabase functions deploy geocodificar-entrega
   ```

3. Configure o secret de contato do geocodificador:

   ```bash
   npx supabase secrets set GEOCODING_CONTACT=suporte@seudominio.com.br
   ```

4. Em **Entregas > Configurar**, informe o endereço de saída e localize-o.
5. Defina SLA, precisão máxima e se PIN, GPS e foto são obrigatórios.
6. Execute `supabase/checks/entregas_readiness.sql` no SQL Editor. Os sete
   primeiros blocos devem retornar zero linhas.

O geocodificador roda no servidor, usa cache por loja e não envia o endereço
repetidamente ao provedor. Para volume comercial alto, troque o provedor na Edge
Function por um serviço contratado e mantenha o mesmo contrato de resposta.

## Garantias do fluxo

- `criar_entrega_atomica`: bloqueia os produtos, valida o saldo físico,
  consolida composições e grava entrega, reserva, movimentação e auditoria.
- `transicionar_entrega_atomica`: bloqueia a entrega, valida papel, atribuição
  e transição. Conclusão grava venda, itens e caixa na mesma transação.
- `publicar_localizacao_entrega`: aceita apenas o entregador atribuído e uma
  entrega em rota; grava posição atual e ponto histórico juntos.
- O `cliente_evento_id` torna o reenvio offline do GPS idempotente.
- O PIN não é armazenado em texto puro. O entregador recebe somente os dados
  sanitizados pela função `listar_entregas_entregador`.
- A página `/acompanhar/:token` revela apenas status, previsão, primeiro nome do
  entregador e posição durante a rota.

## Teste de aceite obrigatório

1. Crie uma entrega contendo duas doses ligadas à mesma garrafa e confira a
   reserva física consolidada.
2. Abra a mesma entrega em dois celulares de entregadores e aceite ao mesmo
   tempo. Somente um deve receber a atribuição.
3. Inicie a rota, desligue a internet, percorra alguns metros e reconecte. Os
   pontos pendentes devem desaparecer da fila sem duplicar a rota.
4. Tente concluir com PIN errado, GPS impreciso e sem foto quando obrigatória.
   Cada tentativa deve ser recusada.
5. Conclua corretamente e confira entrega, venda, itens, caixa e timeline.
6. Cancele uma segunda entrega e confira a devolução exata do estoque.
7. Entre como entregador e confirme que o mapa geral, financeiro e dados de
   outros entregadores não estão acessíveis.
8. Abra o link público em janela anônima e confirme que telefone, itens, total e
   endereço do cliente não aparecem.

## Limite de plataforma

O navegador fornece GPS enquanto a aplicação está ativa e autorizada. O Órbita
detecta interrupção, mostra o estado do sinal e reenvia pontos que falharam, mas
um PWA web não oferece a mesma garantia de rastreamento em segundo plano de um
aplicativo Android/iOS nativo. Para operações que exigem rastreamento contínuo
com a tela bloqueada, use um aplicativo nativo como etapa futura.
