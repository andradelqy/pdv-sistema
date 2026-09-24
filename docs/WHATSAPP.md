# Central de ofertas e WhatsApp

O Órbita utiliza atualmente o **Modo simples**. Ele não exige API, aplicativo
na Meta, CNPJ, token, plugin ou mensalidade de provedor. O próprio operador usa
o WhatsApp comum ou Business instalado no celular ou acessível pelo navegador.

## Como funciona

1. Cadastre o telefone do cliente e registre o consentimento para ofertas.
2. Crie uma oferta com título, descrição, validade, produtos e imagem.
3. Em **Montar campanha**, selecione até 50 contatos autorizados.
4. Escreva a mensagem usando `{nome}`, `{oferta}`, `{descricao}` e `{validade}`.
5. Clique em **Preparar mensagens**.
6. Para cada contato, clique em **Abrir no WhatsApp**.
7. Envie a mensagem no WhatsApp, volte ao Órbita e clique em
   **Já enviei, continuar**.

O navegador não permite disparar dezenas de conversas automaticamente de forma
confiável. Por isso, o Órbita apresenta uma fila individual. Esse desenho evita
pop-ups bloqueados e impede que o histórico registre mensagens que o operador
não chegou a enviar.

## Imagens e histórico

Links `wa.me` preenchem texto, mas não anexam arquivos automaticamente. Quando a
oferta possui imagem, o Órbita acrescenta a URL pública ao fim da mensagem. O
WhatsApp pode gerar uma prévia desse link.

No histórico:

- **Confirmadas** são mensagens que o operador declarou ter enviado.
- **Pendentes** são contatos pulados ou não processados.
- Campanhas parciais podem ser retomadas pelo botão **Continuar** no histórico.
- Entrega e leitura não são conhecidas no Modo simples.
- A campanha fica `Concluída` quando todos foram confirmados e `Parcial` quando
  ainda existem pendentes.

## Segurança e consentimento

- Apenas `owner` e `gerente` acessam a central.
- Campanhas e destinatários continuam isolados por `loja_id` no Supabase.
- Clientes sem consentimento ou com opt-out não podem ser selecionados.
- Nenhuma sessão, senha ou chave do WhatsApp é armazenada.
- O envio depende sempre de uma ação explícita do operador.

## Banco necessário

O Modo simples utiliza a estrutura da Central de Ofertas para guardar ofertas,
campanhas e destinatários:

```text
supabase/migrations/20260921023856_central_ofertas_whatsapp.sql
```

A migration e as Edge Functions de Embedded Signup foram preservadas no
repositório para uma futura ativação do **Modo profissional**, mas não são
necessárias para usar o Modo simples.

## Evolução futura

Quando houver estrutura empresarial e volume que justifique a API oficial,
será possível ativar o modo profissional já iniciado no projeto. Ele permitirá
envio server-side e atualização automática de entrega/leitura. Até lá, o Modo
simples é o fluxo ativo apresentado aos usuários.
