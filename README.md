# PDV Sistema

Sistema web de ponto de venda (PDV) para adega/loja, com controle de caixa, vendas, estoque, clientes, entregas, dashboard financeiro e integração com Supabase.

## Visão geral

O projeto foi desenvolvido com React, TypeScript, Vite e Zustand. Inicialmente os dados eram persistidos no `localStorage` do navegador. A aplicação agora também possui integração com Supabase para salvar as informações principais na nuvem, mantendo o `localStorage` como cache/fallback local.

Principais recursos:

- Login com Supabase Auth
- Dashboard com indicadores de vendas, estoque e lucro líquido
- PDV com carrinho, desconto, múltiplas formas de pagamento e fiado
- Controle de caixa com abertura e fechamento
- Histórico de caixas fechados
- Controle de produtos e estoque
- Movimentações de entrada e saída
- Clientes com limite/saldo de fiado
- Compras inteligentes e reposição de estoque
- Entregas com status e rastreamento
- Backup local em JSON
- Migração manual dos dados do navegador para o Supabase

## Tecnologias

- React
- TypeScript
- Vite
- Zustand
- Supabase
- Tailwind CSS
- Recharts
- Lucide React
- Motion React

## Estrutura principal

```txt
src/
  App.tsx                  # Layout principal, menu, login e botão de migração
  Login.tsx                # Tela de autenticação
  lib/
    store.ts               # Store global Zustand + persistência local + sync Supabase
    supabase.ts            # Cliente Supabase
    sync.ts                # Conversão LS <-> Supabase e funções de sincronização
    dateBR.ts              # Datas em America/Sao_Paulo
    lucro.ts               # Cálculo único de lucro líquido
    toast.tsx              # Sistema de notificações
  pages/
    Dashboard.tsx          # Dashboard financeiro/estoque
    PDV.tsx                # Ponto de venda
    Produtos.tsx           # Cadastro/listagem de produtos
    Movimentacoes.tsx      # Entradas e saídas de estoque
    Compras.tsx            # Compras e reposição
    Clientes.tsx           # Clientes e fiado
    EntregasPDV.tsx        # Entregas
    Analises.tsx           # Caixa, histórico, ABC, backup e alertas
supabase/
  schema.sql               # Schema recomendado para recriar as tabelas no Supabase
```

## Instalação

```bash
npm install
```

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

O arquivo `src/lib/supabase.ts` lê essas variáveis:

```ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
```

## Executando em desenvolvimento

```bash
npm run dev
```

A aplicação será servida pelo Vite. Normalmente o endereço local será exibido no terminal.

## Build e validação

```bash
npm run build
```

Para checagem TypeScript sem gerar build:

```bash
npx tsc -b --noEmit
```

Para lint:

```bash
npm run lint
```

Observação: o projeto pode possuir erros de lint pré-existentes em arquivos de UI ou configuração. A checagem de tipos com `tsc` é a validação principal usada para garantir que a aplicação compila.

## Supabase

O projeto usa Supabase para:

- Autenticação de usuários
- Persistência de produtos
- Persistência de vendas
- Persistência de itens de venda
- Clientes
- Movimentações de estoque
- Caixa
- Entradas de caixa
- Entregas

### Schema

O arquivo `supabase/schema.sql` contém o schema recomendado.

Ele cria/recria:

- `produtos`
- `movimentacoes`
- `clientes`
- `vendas`
- `itens_venda`
- `caixas`
- `caixa_entradas`
- `entregas`

Também ativa RLS e cria políticas para que cada usuário acesse apenas os próprios dados por `user_id`.

Para aplicar:

1. Abra o painel do Supabase.
2. Vá em SQL Editor.
3. Cole o conteúdo de `supabase/schema.sql`.
4. Execute o script.

Atenção: o script recria tabelas e remove estruturas antigas como `vw_curva_abc` e `alertas_compra`. Faça backup se houver dados importantes no Supabase antes de rodar.

## Migração do localStorage para Supabase

Como o sistema originalmente salvava os dados no navegador, a migração é manual.

Após rodar o schema no Supabase:

1. Faça login no sistema.
2. Clique em **Migrar p/ Supabase** no topo da aplicação.
3. Confirme a migração.
4. O sistema lê a chave `adega-pro-store` do `localStorage`.
5. Os dados são enviados para o Supabase.

Dados migrados:

- Produtos
- Movimentações
- Vendas
- Itens de venda
- Clientes
- Caixas
- Entradas de caixa
- Entregas

Depois da migração, novas alterações passam a ser gravadas localmente e também sincronizadas com o Supabase.

## Estratégia de persistência

A aplicação usa uma estratégia híbrida:

- `localStorage`: cache local/fallback offline
- Supabase: base remota principal

Fluxo atual:

1. A store Zustand continua persistindo no `localStorage`.
2. As ações principais disparam uma sincronização em background com Supabase.
3. Ao carregar o app logado, ele tenta buscar dados do Supabase.
4. Se o Supabase tiver dados, eles hidratam a store local.
5. Se o Supabase estiver vazio ou offline, o app continua usando o `localStorage`.

Arquivos envolvidos:

- `src/lib/store.ts`
- `src/lib/sync.ts`
- `src/App.tsx`

## Datas e virada do dia

O sistema usa horário de Brasília para datas de negócio.

O problema original era o uso de:

```ts
new Date().toISOString().split('T')[0]
```

Esse código usa UTC. Como Brasília normalmente está em UTC-3, o dia virava às 21h no Brasil.

Agora o projeto usa `src/lib/dateBR.ts`, com `America/Sao_Paulo`, para garantir que o dia vire apenas às 00:00 no horário de Brasília.

Funções principais:

- `hojeBRT()`
- `isoParaDataBRT()`
- `cortarDataBRT()`
- `horaBRT()`

A função `hoje()` exportada por `store.ts` também usa `hojeBRT()`.

## Lucro líquido

O cálculo de lucro líquido foi unificado em `src/lib/lucro.ts`.

Fórmula adotada:

```txt
Lucro líquido = Receita das vendas - CMV
```

Onde:

```txt
CMV = soma dos itens vendidos * preço de compra do produto
```

Essa fórmula é usada para alinhar:

- Dashboard
- Fechamento de caixa
- Relatórios que precisarem do mesmo número

Antes, o dashboard calculava lucro usando compras/entradas de estoque do período, enquanto o caixa usava custo dos itens vendidos. Isso gerava valores diferentes.

## Caixa

O caixa deve estar aberto para realizar vendas pelo PDV.

Ao abrir caixa:

- É criado um registro local em `caixaAberto`.
- O caixa é sincronizado com Supabase.

Ao fechar caixa:

- O sistema calcula faturamento bruto.
- Calcula lucro líquido usando a fórmula única de CMV.
- Salva o caixa fechado no histórico.
- Sincroniza o fechamento com Supabase.

## PDV

O PDV permite:

- Buscar produtos
- Adicionar itens ao carrinho
- Alterar quantidade
- Aplicar desconto fixo
- Usar múltiplas formas de pagamento
- Registrar fiado vinculado a cliente
- Registrar devolução
- Emitir cupom via impressão do navegador

Atalhos:

- `F2`: finalizar venda
- `F4`: limpar carrinho

O carrinho ainda é salvo em `localStorage` separado na chave `carrinho`, para evitar perda durante uma venda em andamento.

## Produtos e estoque

Cada produto possui informações como:

- SKU
- Nome
- Código de barras
- Categoria
- Fornecedor
- Lead time
- Preço de compra
- Preço de venda
- Imposto
- Frete
- Comissão
- Margem alvo
- Estoque atual
- Estoque mínimo
- Ponto de pedido
- Qualidade
- Imagem

Movimentações de estoque atualizam o saldo do produto e são sincronizadas com Supabase.

## Clientes e fiado

Clientes possuem:

- Nome
- Telefone
- Limite
- Saldo
- Quantidade de compras
- Última cobrança

Vendas fiado aumentam o saldo do cliente. Quitações reduzem o saldo e registram entrada no caixa.

## Entregas

As entregas possuem status:

- `pendente`
- `em_rota`
- `entregue`
- `cancelado`

Ao marcar uma entrega como entregue, o sistema pode gerar venda e entrada de caixa conforme a forma de pagamento.

## Backup local

Na página de Backup, é possível baixar um JSON com dados locais.

Esse backup é útil antes de:

- Rodar scripts no Supabase
- Fazer migração
- Testar mudanças grandes
- Limpar dados locais

## Cuidados importantes

- Rode `supabase/schema.sql` antes de clicar em **Migrar p/ Supabase**.
- Faça backup antes de recriar tabelas no Supabase.
- Não comite `.env.local` com chaves reais.
- O botão de migração usa os dados do navegador atual; se houver dados em outro navegador/computador, migre a partir dele também.
- Se o Supabase estiver offline, o sistema tenta continuar pelo `localStorage`.

## Comandos úteis

```bash
npm install
npm run dev
npm run build
npm run lint
npx tsc -b --noEmit
```

## Estado atual da integração

Implementado:

- Cliente Supabase via `.env.local`
- Schema SQL recomendado
- Migração manual LS → Supabase
- Escrita em Supabase em background nas ações principais
- Leitura inicial do Supabase com fallback para `localStorage`
- Data em horário de Brasília
- Lucro líquido unificado por CMV

Pontos que podem ser melhorados futuramente:

- Fila offline robusta para sincronizar automaticamente alterações feitas sem internet
- Tela de status de sincronização
- Controle de conflitos entre dispositivos
- Auditoria de operações financeiras
- Relatórios avançados diretamente por queries SQL/views
- Separação de permissões por perfil/funcionário
