# Controle manual de assinaturas

O acesso comercial do Órbita é controlado por **loja**, na tabela
`public.assinaturas_lojas`. As funções dos usuários continuam na coluna
`public.perfis.role` e não devem ser usadas para cobrança.

## Estados

- `trial`: acesso liberado até `periodo_teste_ate`.
- `active`: acesso liberado; `acesso_ate` vazio significa sem vencimento.
- `past_due`: pagamento pendente, mas liberado até `carencia_ate`.
- `suspended`: acesso bloqueado manualmente.
- `cancelled`: assinatura encerrada e acesso bloqueado.

## Planos e limites

| `plano` | Preço | Usuários ativos | Papéis e recursos |
| --- | ---: | ---: | --- |
| `basico` | R$ 69,00/mês | 2 | owner/atendente; operação essencial de PDV, caixa e estoque |
| `pro` | R$ 129,00/mês | 7 | todos os papéis e módulos; anual de R$ 1.238,40 |
| `empresarial` | R$ 199,90/mês | 20 | todos os recursos e atendimento empresarial contratado |
| `cortesia` | interno | 20 | acesso técnico equivalente ao Empresarial |

O banco rejeita convites acima do limite e rejeita a troca para um plano menor
enquanto existirem usuários ou papéis incompatíveis. Para fazer downgrade,
desative primeiro os excedentes e, no Básico, troque/desative gerentes e
entregadores. Os dados de módulos avançados são preservados, mas deixam de ficar
disponíveis enquanto a loja estiver no Básico.

## Operação no Supabase

Abra **Table Editor > assinaturas_lojas**. Cada loja deve ter exatamente uma
linha, usando o mesmo `loja_id` existente em `perfis` e nas tabelas operacionais.

### Liberar uma loja

Defina `plano` como `basico`, `pro` ou `empresarial` e `status = active`. Para acesso por prazo, informe `acesso_ate`; para
acesso sem vencimento, deixe `acesso_ate` vazio.

### Conceder teste

Defina `status = trial` e preencha `periodo_teste_ate` com a data final.

### Dar carência

Defina `status = past_due` e preencha `carencia_ate`. Depois dessa data o acesso
é bloqueado automaticamente.

### Suspender ou cancelar

Defina `status = suspended` ou `cancelled`. Use `mensagem_bloqueio` para explicar
ao cliente o motivo e a forma de regularização.

A alteração é aplicada no banco imediatamente. No aplicativo aberto, a tela de
bloqueio aparece ao voltar o foco para a janela ou em até um minuto.

## Nova loja

Depois da migration `20260923182718_production_hardening.sql`, criar ou alterar
um perfil para `role = owner` com um novo `loja_id` provisiona automaticamente
uma única assinatura Pro `trial` de 7 dias para a loja. Colaboradores posteriores
reutilizam a mesma assinatura. Revise no Table Editor o nome comercial, plano e
prazo antes de entregar o acesso ao cliente.

Instalações que ainda não aplicaram essa migration precisam criar manualmente a
linha em `assinaturas_lojas`; sem ela, o sistema falha de forma segura.

## Segurança

Usuários autenticados podem apenas ler a assinatura da própria loja. Eles não
podem liberar, renovar ou editar a assinatura pela API. A gestão manual deve ser
feita pelo operador da plataforma no painel do Supabase.

## Edge Function de convites

Depois de aplicar a migration de planos, publique a função versionada no projeto:

```bash
npx supabase functions deploy convite-usuario
```

Ela aceita apenas uma sessão válida de `owner`, confere a assinatura e a
quantidade de usuários, convida a conta e vincula o perfil à loja. Se o perfil
não puder ser gravado, o usuário recém-convidado é removido para não deixar uma
conta órfã.
