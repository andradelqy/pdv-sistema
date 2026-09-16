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

## Operação no Supabase

Abra **Table Editor > assinaturas_lojas**. Cada loja deve ter exatamente uma
linha, usando o mesmo `loja_id` existente em `perfis` e nas tabelas operacionais.

### Liberar uma loja

Defina `status = active`. Para acesso por prazo, informe `acesso_ate`; para
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

Depois de criar os perfis e definir o `loja_id`, crie uma linha em
`assinaturas_lojas`. Sem essa linha, o sistema falha de forma segura e não libera
os dados da loja.

## Segurança

Usuários autenticados podem apenas ler a assinatura da própria loja. Eles não
podem liberar, renovar ou editar a assinatura pela API. A gestão manual deve ser
feita pelo operador da plataforma no painel do Supabase.
