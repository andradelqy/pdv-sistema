# Catálogo Virtual

O Catálogo Virtual transforma o cadastro interno de produtos do Órbita em uma
vitrine pública por loja. O estoque continua sendo a fonte oficial: o catálogo
não duplica produtos e guarda somente as decisões de apresentação, como
visibilidade, categoria, destaque, descrição, preço e imagem públicos.

## Fluxo do lojista

1. Acesse **Marketing > Catálogo Virtual** com uma conta `owner` ou `gerente`
   em uma loja Pro ou Empresarial.
2. Na aba **Aparência**, informe nome, endereço público, WhatsApp, cores e a
   forma de exibir estoque. Salve a configuração.
3. Em **Categorias**, crie e ordene as seções da vitrine.
4. Em **Produtos**, ative somente os itens que devem aparecer. É possível
   selecionar vários produtos, personalizar a apresentação, marcar destaques e
   usar uma imagem por URL ou enviada diretamente do computador.
5. Em **Aparência e loja**, configure idiomas, pedido mínimo, entrega, meios de
   pagamento, horário, SEO e banners para computador e celular.
6. Clique em **Publicar catálogo** e use o link ou QR Code para compartilhar.

O endereço público segue o formato `/catalogo/nome-da-loja`. A página não exige
login e oferece busca, filtros, ofertas, carrinho persistente e um pedido único
com quantidades e total estimado enviado pelo WhatsApp.

## Idiomas

O lojista escolhe o idioma padrão e pode ativar **Português (Brasil)**,
**Español** e **English**. Categorias e produtos aceitam nomes traduzidos. Se
uma tradução estiver vazia, a vitrine usa o texto em português como fallback.
O cliente troca o idioma pelo seletor no topo; o idioma também pode ser aberto
diretamente com `?lang=pt-BR`, `?lang=es` ou `?lang=en`.

## Recursos comerciais e experiência do cliente

- Carrinho salvo no navegador, controle de quantidade, subtotal, taxa de
  entrega, pedido mínimo e envio consolidado pelo WhatsApp.
- Integração com ofertas ativas: o catálogo escolhe o melhor desconto válido e
  exibe preço original e promocional.
- Horários e dias de funcionamento, mensagem de loja fechada, prazo estimado,
  regiões de entrega e formas de pagamento.
- Galeria de imagens por produto, banner específico para celular, link direto
  do produto e compartilhamento nativo ou por cópia do link.
- Estoque revalidado periodicamente e novamente antes de abrir o WhatsApp.
- Título e descrição para buscadores, Instagram e campo de domínio
  personalizado. O domínio só entra no ar depois de configurar DNS e o host.

## Indicadores

A aba **Desempenho** mostra os últimos 30 dias: visitas, visitantes, produtos
visualizados, adições ao carrinho, cliques no WhatsApp, compartilhamentos,
conversão e ranking de produtos. Eventos públicos usam um identificador de
sessão anonimizado, limite de requisições e não bloqueiam a compra se o serviço
de métricas estiver indisponível.

## Estoque e composição

- Produtos comuns usam o estoque atual do próprio cadastro.
- Doses e outros itens derivados usam o produto físico definido em
  **Composição de estoque**. A disponibilidade é calculada pela quantidade da
  garrafa multiplicada pelo rendimento configurado.
- Por padrão, produtos sem estoque não aparecem. O lojista pode permitir sua
  exibição individualmente.
- O catálogo pode ocultar o estoque, mostrar apenas a situação ou informar a
  quantidade disponível.
- Produtos cadastrados depois aparecem automaticamente na gestão, porém ficam
  ocultos até serem ativados. A opção **Publicar produtos novos** altera esse
  comportamento de forma consciente.

## Segurança e multiempresa

- As tabelas usam RLS e chaves compostas para impedir vínculos entre lojas.
- Apenas `owner` e `gerente` da própria loja, com assinatura e plano compatíveis,
  podem administrar catálogo e imagens.
- A página pública lê uma Edge Function sem sessão. A função devolve uma DTO
  limitada e nunca expõe custo, fornecedor, margem, dados de compra ou usuários.
- As imagens aceitam JPG, PNG ou WebP de até 5 MB e ficam no bucket público
  `catalogos`; as operações de escrita continuam protegidas por RLS.

## Instalação no Supabase

Execute as migrations em ordem, incluindo:

```text
20261001031741_planos_comerciais_funcionais.sql
20261003000413_catalogo_virtual_showcase.sql
20261003012000_catalogo_comercial_multilingue.sql
```

Depois publique a função:

```bash
npx supabase functions deploy catalogo-publico --project-ref SEU_PROJECT_REF --use-api
```

O `verify_jwt` dessa função é intencionalmente desativado porque a vitrine é
pública. A função usa a chave de serviço somente no servidor e retorna apenas os
campos comerciais permitidos.
