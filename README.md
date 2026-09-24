# Órbita 2.0

Sistema web de gestão para adegas, lojas e pequenos comércios, reunindo PDV,
caixa, estoque, compras inteligentes, clientes, entregas, rastreamento e
relatórios em uma aplicação multiempresa.

O projeto utiliza React, TypeScript, Vite, Zustand e Supabase. Pode ser instalado
como PWA e mantém uma fila local para operações que não puderem ser sincronizadas
imediatamente.

> **Estado do produto:** a versão atual está adequada para pilotos acompanhados.
> Antes de receber clientes em produção, conclua o checklist de
> [`docs/PRODUCAO.md`](docs/PRODUCAO.md), valide todas as migrations no projeto
> Supabase de produção e finalize os dados jurídicos e de suporte.

## Novidades da versão 2.0

- Nova identidade visual Órbita e PWA com manifesto e ícone próprios.
- Modo escuro padronizado com o dashboard.
- Sessão com opção **Lembrar-me**: persistência local quando marcada e sessão
  temporária quando desmarcada.
- Controle multiempresa por `loja_id` e permissões por papel.
- Controle manual de assinatura por loja, com teste, carência, suspensão e
  cancelamento.
- Venda atômica e idempotente no Supabase, evitando confirmações parciais e
  vendas duplicadas em reenvios.
- Estoque mínimo e ponto de pedido calculados automaticamente.
- Composição de estoque para itens derivados, como doses que consomem garrafas.
- Central de compras refeita com orçamento reativo, prioridades, confiança da
  previsão, mínimo de compra e múltiplo de embalagem.
- Pedidos de compra com aprovação, trânsito, recebimento e cancelamento.
- Inventário físico, perdas, quebras, lotes, validade e busca por código de barras.
- Histórico de vendas preservando o nome dos itens vendidos.
- Entregas transacionais com aceite concorrente seguro, prova por PIN/GPS/foto,
  link público de acompanhamento, trilha auditável e rastreamento offline.
- Curva ABC, Matriz QPR e relatório gerencial com gráficos e ações recomendadas.
- CRM básico com tags, observações, fiado e histórico do cliente.
- Central de ofertas com imagens, produtos vinculados, públicos segmentados,
  consentimento de marketing e fila assistida para envio pelo WhatsApp.
- Testes automatizados para compras, estoque composto, assinatura, permissões,
  lucro e indicadores gerenciais.
- Workflow de qualidade com lint, testes e build no GitHub Actions.
- Fila offline e carrinho isolados por loja e usuário no mesmo navegador.
- Recebimento de compras atômico: pedido, estoque, custo, movimentação,
  histórico e auditoria são confirmados juntos.
- Ponto eletrônico com PIN validado por hash no banco, sem expor o PIN ao navegador.
- Captura sanitizada de falhas, Error Boundary e testes E2E em desktop e celular.

## Módulos do sistema

### Dashboard

- Indicadores de faturamento, vendas, ticket médio, lucro e estoque.
- Produtos com maior giro e desempenho por período.
- Alertas operacionais e atalhos para os principais módulos.
- Saúde da aplicação com falhas técnicas sanitizadas visíveis à gestão da loja.
- Gráficos responsivos para desktop e dispositivos móveis.

### PDV

- Busca por nome, SKU ou código de barras.
- Carrinho persistido durante a venda.
- Alteração de quantidade e desconto.
- Dinheiro, PIX, cartão de crédito, cartão de débito e fiado.
- Múltiplas formas de pagamento.
- Primeiro pagamento preenchido automaticamente com o valor final da venda.
- Devolução e impressão de comprovante pelo navegador.
- Atalhos `F2` para finalizar e `F4` para limpar o carrinho.
- Venda bloqueada quando não existe caixa aberto.
- Confirmação transacional no banco: venda, itens, estoque, movimentação,
  caixa e auditoria são processados em conjunto.

### Caixa

- Abertura e fechamento de caixa.
- Entradas por venda e quitação de fiado.
- Suprimentos e sangrias.
- Histórico de caixas fechados.
- Faturamento bruto e lucro calculado por receita menos CMV.

### Produtos e estoque

- Cadastro de SKU, nome, categoria, código de barras, imagem e fornecedor
  opcional.
- Custo, preço de venda, impostos, frete, comissão e margem-alvo.
- Lead time, qualidade, quantidade mínima de compra e múltiplo de embalagem.
- Estoque mínimo e ponto de pedido automáticos; não são informados manualmente.
- Entradas, saídas e contagem física.
- Motivos de ajuste: compra, inventário, perda, quebra, validade, devolução e
  outros.
- Controle de lote, validade, observação, responsável e data de aprovação.
- Pesquisa por produto, SKU e código de barras.

### Composição de estoque

Produtos derivados podem consumir o estoque de outro produto físico. Isso é
útil para doses, porções, kits e fracionamentos.

Exemplo:

1. Cadastre **Garrafa Eternity Melancia** com estoque próprio.
2. Cadastre **Dose Eternity Melancia**.
3. Na edição da dose, pesquise a garrafa em **Composição de estoque**.
4. Informe que uma garrafa rende, por exemplo, `10` doses.

Cada dose vendida consome `1/10` da garrafa. A demanda das doses é convertida em
demanda da garrafa, portanto o sistema de compras recomenda a garrafa física e
não a dose.

### Compras inteligentes

A central de compras cruza:

- Histórico de vendas e demanda diária.
- Estoque disponível.
- Pedidos em rascunho, aprovados ou em trânsito.
- Lead time e variabilidade da demanda.
- Estoque de segurança, ponto de pedido e estoque-alvo.
- Risco de ruptura e dias de cobertura.
- Custo, margem, importância e confiança da previsão.
- Quantidade mínima e múltiplo de embalagem.
- Composição entre produtos derivados e itens físicos.
- Orçamento disponível.

Os itens são separados em:

- **Comprar agora:** risco relevante de ruptura.
- **Planejar reposição:** deve entrar nas próximas compras.
- **Monitorar:** sem necessidade imediata.
- **Corrigir dados:** histórico ou cadastro insuficiente para uma decisão segura.

Modos de uso:

- **Somente analisar:** apresenta as recomendações sem criar pedidos.
- **Controlado:** gera rascunhos para revisão e aprovação.
- **Automático:** cria pedidos internos pendentes apenas para urgências com
  confiança mínima; não envia pedidos a fornecedores externos.

O orçamento recalcula imediatamente quantidades, valor planejado, saldo, estoque
projetado e urgências que ficaram fora do plano. Remover um item redistribui o
saldo entre os demais produtos. O fornecedor é opcional e pedidos sem fornecedor
ficam identificados como **Fornecedor a definir**.

Fluxo dos pedidos:

```text
Rascunho -> Aprovado -> Em trânsito -> Recebido
                    \-> Cancelado
```

Rascunhos e pedidos abertos entram no cálculo para evitar sugestões duplicadas.
Ao receber um pedido, o estoque dos produtos é atualizado e a política de
reposição é recalculada.

> O motor é uma ferramenta de apoio. Nas primeiras semanas de uso, mantenha o
> modo Controlado e revise as recomendações. A confiança depende da qualidade e
> da quantidade de dados registrados para cada produto.

### Clientes e fiado

- Nome, telefone, e-mail, tags e observações.
- Limite de crédito, saldo em aberto e quantidade de compras.
- Venda fiada vinculada ao cliente.
- Quitação parcial ou total com registro no caixa.
- Busca e segmentação básica por tags.
- Identificação de clientes inativos nos indicadores gerenciais.
- Registro explícito da autorização para receber ofertas pelo WhatsApp.

### Central de ofertas e WhatsApp

- Cadastro de ofertas com imagem, descrição, desconto, validade e produtos.
- Contatos provenientes do CRM, com busca por nome, telefone ou tag.
- Seleção de vários destinatários, limitada a clientes com consentimento.
- Editor com variáveis `{nome}`, `{oferta}`, `{descricao}` e `{validade}`.
- Prévia semelhante a uma conversa do WhatsApp antes do envio.
- Modo simples sem API, token, plugin, CNPJ ou configuração da Meta.
- Fila que abre uma conversa por vez com destinatário e mensagem preenchidos.
- Confirmação manual após o envio, com opção de copiar, pular e registrar o progresso.
- Imagem da oferta acrescentada automaticamente como link público na mensagem.
- Histórico separando mensagens confirmadas e contatos pendentes.
- Acesso restrito a `owner` e `gerente`, com isolamento por `loja_id`.

A central utiliza os telefones cadastrados em **Clientes** e não lê a agenda do
WhatsApp. O funcionamento atual e a evolução futura para a API oficial estão documentados em
[`docs/WHATSAPP.md`](docs/WHATSAPP.md).

### Entregas

- Criação do pedido com cliente, telefone, endereço, itens, taxa e pagamento.
- Reserva transacional do estoque no momento da criação, incluindo doses que
  consomem a mesma garrafa.
- Estados `pendente`, `aceito`, `em_rota`, `entregue`, `nao_entregue` e
  `cancelado`.
- Atribuição de entregador.
- Registro de motivo de cancelamento ou tentativa não concluída.
- PIN de quatro dígitos validado no servidor, nome do recebedor, coordenada,
  precisão do GPS e foto configurável.
- Devolução automática da reserva ao estoque quando a entrega é cancelada.
- Geração atômica e idempotente da venda e da entrada no caixa de origem.
- Link público por token opaco, sem expor telefone, itens ou valores.
- Timeline imutável de criação, aceite, rota, ocorrência e conclusão.
- SLA, alertas de atraso, indicadores e desempenho por entregador.
- Origem, velocidade estimada, precisão e exigências configuráveis por loja.

### App do entregador e rastreamento

- Interface restrita a contas com papel `entregador`.
- Visualização das entregas disponíveis e das entregas assumidas pelo usuário.
- Aceite, início da rota, conclusão e ocorrência de não entrega.
- Google Maps, Waze, ligação e WhatsApp em um toque.
- Captura automática da localização somente durante a rota.
- Fila idempotente de pontos GPS para períodos sem internet.
- Posição atual e histórico de pontos separados por `loja_id`.
- Painel gerencial com Realtime e fallback, trajetos separados por entrega,
  filtro de baixa precisão e saltos impossíveis.
- O entregador enxerga apenas sua localização e os pedidos necessários; o
  mapa geral é exclusivo da gestão.

O desenho de segurança e a implantação estão detalhados em
[`docs/ENTREGAS.md`](docs/ENTREGAS.md).

### Relatórios e análises

- Relatório gerencial de receita, CMV, taxas estimadas, sangrias/perdas,
  resultado operacional, margem e contas a receber.
- Desempenho dos entregadores, taxa de sucesso e tempo médio.
- Exportação do resumo gerencial em CSV.
- Histórico de vendas com fotografia textual dos itens vendidos.
- Curva ABC com participação, acumulado, gráfico de Pareto e decisão sugerida.
- Matriz QPR cruzando qualidade, margem e giro.
- Quadrantes **Estrela**, **Potencial**, **Volume** e **Revisar**.
- Alertas de estoque, margem e operação.
- Backup local em JSON e exportações CSV.

> O relatório gerencial não substitui uma DRE contábil ou fiscal.

### Ponto eletrônico

- Seleção de colaborador.
- Registro de eventos de ponto e consulta dos registros da equipe.
- Isolamento dos usuários da mesma loja pelas políticas de acesso.

## Usuários e permissões

O Supabase Auth identifica o usuário. A tabela `public.perfis` armazena nome,
papel, status e `loja_id`.

| Papel | Acesso principal |
| --- | --- |
| `owner` | Todos os módulos e gestão da equipe |
| `gerente` | Operação, estoque, compras, relatórios e entregas |
| `atendente` | PDV, pedidos de entrega, histórico e clientes |
| `entregador` | App do entregador; somente pedidos disponíveis e atribuídos a ele |

O menu é filtrado no frontend e as operações também são limitadas por RLS no
banco. O acesso aos dados é por loja, não pelo `user_id` de quem criou o registro.
Assim, os colaboradores de uma mesma loja compartilham os dados permitidos sem
enxergar outras lojas.

## Assinatura manual por loja

A assinatura comercial pertence à loja, e não a cada perfil. Todos os usuários
com o mesmo `loja_id` utilizam o mesmo registro em `assinaturas_lojas`.

Estados suportados:

- `trial`: liberado até `periodo_teste_ate`.
- `active`: liberado; `acesso_ate` vazio representa acesso sem vencimento.
- `past_due`: liberado durante a carência definida em `carencia_ate`.
- `suspended`: bloqueado manualmente.
- `cancelled`: assinatura encerrada.

O cliente pode consultar apenas a assinatura da própria loja e não pode alterá-la
pela API. A alteração é feita pelo operador da plataforma no Supabase. Quando a
assinatura perde a validade, a interface mostra a tela de bloqueio e uma política
restritiva impede acesso às tabelas operacionais.

Veja o procedimento completo em [`docs/ASSINATURAS.md`](docs/ASSINATURAS.md).

## Persistência, sincronização e operação offline

O Supabase é a base remota principal. A store Zustand mantém uma cópia local para
estado da interface e continuidade operacional.

Fluxo simplificado:

```text
Ação na interface
      |
      +--> atualiza Zustand/localStorage
      |
      +--> tenta gravar no Supabase
                |
                +--> sucesso: sincronizado
                \--> falha: entra na fila local e tenta novamente ao reconectar
```

- O topo informa se existem alterações pendentes.
- A fila registra a operação e o último erro.
- O reenvio de uma venda usa o mesmo identificador para não duplicar a operação.
- Ao entrar no sistema, produtos, movimentações, vendas, clientes, caixas,
  entradas, entregas e compras são carregados da loja autenticada.

> O cache local não substitui o backup do banco. Configure backup, restauração,
> alertas e monitoramento no ambiente de produção.

## Arquitetura e tecnologias

- React 19 e React DOM.
- TypeScript.
- Vite.
- Zustand para estado da sessão; somente preferências não sensíveis persistem.
- Supabase Auth, Postgres, Data API, RLS e Realtime.
- Tailwind CSS e componentes Base UI/Radix.
- Recharts para gráficos.
- Leaflet/React Leaflet para mapas.
- Lucide React para ícones.
- Vite PWA para instalação e atualização do aplicativo.
- Vitest, ESLint e GitHub Actions para qualidade.

## Estrutura principal

```text
src/
  App.tsx                       rotas, layout, RBAC e bloqueio de assinatura
  Login.tsx                     autenticação e Lembrar-me
  AppEntregador.tsx             operação do entregador
  PainelMapa.tsx                rastreamento em tempo real
  PontoEletronico.tsx           registros de ponto
  components/
    GerenciarCompras.tsx        ciclo dos pedidos de compra
    PurchasingDashboard.tsx     KPIs da análise de compras
    TutorialCompras.tsx         ajuda contextual de compras
  lib/
    assinatura.ts               validade da assinatura da loja
    analytics.ts                indicadores gerenciais
    dateBR.ts                   datas em America/Sao_Paulo
    lucro.ts                    CMV e lucro
    rbac.ts                     permissões por papel
    store.ts                    estado e regras operacionais
    supabase.ts                 cliente e persistência da sessão
    sync.ts                     leitura, escrita e fila offline
    intelligence/
      engine.ts                 política de estoque e previsão
      forecast.ts               apoio à previsão de demanda
      Importance.ts             fatores de importância
      purchasePlanner.ts        plano e faixas de compra
      purchaseBudget.ts         distribuição do orçamento
  pages/
    Dashboard.tsx
    PDV.tsx
    Produtos.tsx
    Movimentacoes.tsx
    Compras.tsx
    Clientes.tsx
    EntregasPDV.tsx
    Relatorios.tsx
    Analises.tsx
supabase/
  schema.sql                    aviso seguro; o schema vive nas migrations
  migrations/                   evolução incremental do banco
docs/
  ASSINATURAS.md
  PRODUCAO.md
```

## Configuração local

### Requisitos

- Node.js 22 ou compatível.
- npm.
- Projeto Supabase.

### Instalação

```bash
npm install
```

Crie `.env.local` na raiz:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publicavel-ou-anon
VITE_LEGAL_NAME=Razão social ou nome do responsável
VITE_LEGAL_DOCUMENT=CNPJ ou CPF do responsável
VITE_SUPPORT_EMAIL=suporte@seudominio.com.br
VITE_PRIVACY_EMAIL=privacidade@seudominio.com.br
```

Nunca coloque `service_role`, secret key ou senha do banco em variáveis `VITE_*`.
Tudo que começa com `VITE_` é enviado ao navegador.

Inicie o projeto:

```bash
npm run dev
```

## Banco de dados e migrations

### Banco novo e vazio

Aplique todas as migrations em ordem cronológica. `supabase/schema.sql` não
altera o banco e existe apenas para impedir a execução acidental do antigo
bootstrap destrutivo.

### Banco existente

Faça backup, valide primeiro em homologação e aplique somente as migrations
ainda pendentes.

| Migration | Finalidade |
| --- | --- |
| `20260913_multitenant_sync.sql` | `loja_id`, compartilhamento por loja, compras, rastreio e composição |
| `20260915_confiabilidade_operacional.sql` | auditoria e confirmação atômica da venda |
| `20260915_reparar_itens_venda.sql` | recupera vínculos históricos de itens quando possível |
| `20260915_restringir_entregador.sql` | limita o entregador aos recursos de entrega |
| `20260915_tracking_realtime.sql` | pontos de GPS e políticas de rastreamento |
| `20260916_producao_estoque_compras_crm.sql` | inventário, preços, CRM, helpers privados e policies de perfis |
| `20260916212101_controle_manual_assinaturas.sql` | assinatura manual e bloqueio restritivo por loja |
| `20260918005738_corrigir_auditoria_venda_atomica.sql` | corrige permissões da auditoria transacional |
| `20260918010403_suportar_devolucao_atomica.sql` | devolução idempotente no fluxo de venda |
| `20260918013910_garantir_item_unico_pedido_compra.sql` | chave de conflito segura dos itens de compra |
| `20260921023856_central_ofertas_whatsapp.sql` | ofertas, consentimento e campanhas assistidas |
| `20260921200635_whatsapp_embedded_signup_autonomo.sql` | estruturas futuras da integração profissional |
| `20260923182718_production_hardening.sql` | índices, grants, telemetria, PIN seguro e recebimento atômico |
| `20260923211311_corrigir_advisors_seguranca_performance.sql` | corrige os avisos dos Advisors, consolida policies, remove índices duplicados e isola RPCs privilegiadas |
| `20260924183909_entregas_rastreabilidade_producao.sql` | operações atômicas, RLS por papel, prova de entrega, timeline e rastreamento público |

Após aplicar:

1. Confirme que todas as tabelas públicas possuem RLS adequado.
2. Revise os `GRANT` necessários para a Data API.
3. Execute Security Advisor e Performance Advisor.
4. Teste um usuário de cada papel em pelo menos duas lojas.
5. Teste backup e restauração antes de cadastrar clientes pagantes.

O Supabase passou a exigir exposição explícita de novas tabelas em projetos
recentes. RLS e `GRANT` são camadas diferentes e ambas precisam estar corretas.

## Cadastro de lojas e colaboradores

Uma conta do Supabase Auth deve possuir uma linha correspondente em `perfis`.
O `loja_id` determina a qual empresa ela pertence e `role` determina o que ela
pode fazer.

Para um colaborador de uma loja existente:

1. Crie ou convide a conta no Supabase Auth.
2. Confirme a criação do perfil.
3. Use o mesmo `loja_id` da empresa.
4. Defina `role` como `owner`, `gerente`, `atendente` ou `entregador`.

Para uma nova loja, o primeiro perfil `owner` provisiona automaticamente uma
assinatura de teste de 7 dias depois da migration de hardening. Confirme a linha
em `assinaturas_lojas`; não crie uma assinatura para cada funcionário.

## Scripts e validação

```bash
npm run dev              # ambiente de desenvolvimento
npm run build            # typecheck e build de produção
npm run preview          # visualiza o build localmente
npm run lint             # análise estática
npm test -- --run        # testes automatizados
npm run test:e2e         # Playwright: desktop e celular
npx tsc -b --pretty false
```

A suíte atual possui testes para:

- Cálculo de lucro.
- Permissões por papel.
- Estoque composto de doses e garrafas.
- Indicadores gerenciais.
- Validade da assinatura.
- Planejamento de compras.
- Alocação e redistribuição do orçamento.
- Separação de trajetos, rejeição de GPS inválido, atraso e comprovante de entrega.

O workflow `.github/workflows/quality.yml` executa instalação limpa, lint,
testes unitários, build, testes E2E e publica os artefatos de diagnóstico e o
bundle em pushes para `main` e pull requests.

## Publicação

Antes de publicar:

- Use projetos Supabase separados para desenvolvimento/homologação e produção.
- Aplique migrations primeiro em homologação.
- Configure domínio HTTPS e URLs permitidas no Supabase Auth.
- Configure SMTP próprio para convites e recuperação de conta.
- Habilite backups compatíveis com o risco da operação.
- Configure monitoramento de erros e disponibilidade.
- Preencha razão social, contato, suporte e encarregado nos Termos e na Política
  de Privacidade.
- Execute os testes de aceite descritos em [`docs/PRODUCAO.md`](docs/PRODUCAO.md).
- Publique somente o artefato gerado por `npm run build`.

Consulte também o
[checklist oficial de produção do Supabase](https://supabase.com/docs/guides/deployment/going-into-prod).

## Limitações conhecidas

- O controle de assinatura ainda é manual e não possui gateway de pagamento.
- O modo automático de compras cria pedidos internos; não envia ordens ao
  fornecedor.
- A recomendação de compras depende de estoque inicial, custos, lead time e
  vendas registrados corretamente.
- O backup em JSON é uma exportação do aplicativo e não substitui backup e
  recuperação do banco.
- O relatório gerencial não é escrituração contábil nem fiscal.
- Os testes E2E públicos já cobrem login, documentos e responsividade. Ainda é
  necessário executar concorrência, restauração, offline prolongado e isolamento
  entre lojas contra o ambiente de homologação com usuários reais.
- Termos e Política usam variáveis de ambiente; preencha os dados reais do
  operador antes da comercialização e obtenha revisão jurídica.

## Documentação complementar

- [`docs/ASSINATURAS.md`](docs/ASSINATURAS.md): operação manual das assinaturas.
- [`docs/PRODUCAO.md`](docs/PRODUCAO.md): checklist técnico antes de clientes
  pagantes.
- [`docs/ENTREGAS.md`](docs/ENTREGAS.md): implantação, segurança e testes do
  fluxo de entregas.
