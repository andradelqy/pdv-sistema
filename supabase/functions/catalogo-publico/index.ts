import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const responder = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
    },
  });
const slugValido = (value: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
const idiomas = ["pt-BR", "es", "en"] as const;
type Idioma = (typeof idiomas)[number];
const idiomaValido = (value: unknown): value is Idioma =>
  idiomas.includes(value as Idioma);
const eventos = new Set([
  "visita",
  "produto_visualizado",
  "adicionado_carrinho",
  "removido_carrinho",
  "whatsapp",
  "compartilhamento",
  "busca",
]);
const urlImagem = (base: string, path?: string | null) => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}/storage/v1/object/public/catalogos/${path.split("/").map(encodeURIComponent).join("/")}`;
};
const localizar = (
  idioma: Idioma,
  pt?: string | null,
  es?: string | null,
  en?: string | null,
) =>
  (idioma === "es" ? es : idioma === "en" ? en : pt) ||
  pt ||
  es ||
  en ||
  undefined;
async function sha256(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function lojaAberta(catalogo: Record<string, unknown>) {
  const abertura = catalogo.horario_abertura
    ? String(catalogo.horario_abertura).slice(0, 5)
    : "";
  const fechamento = catalogo.horario_fechamento
    ? String(catalogo.horario_fechamento).slice(0, 5)
    : "";
  if (!abertura || !fechamento) return true;
  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: String(catalogo.fuso_horario || "America/Sao_Paulo"),
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const valor = Object.fromEntries(
      partes.map((item) => [item.type, item.value]),
    );
    const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      valor.weekday,
    );
    const dias = (catalogo.dias_funcionamento as number[]) || [
      0, 1, 2, 3, 4, 5, 6,
    ];
    if (!dias.includes(dia)) return false;
    const agora = `${valor.hour}:${valor.minute}`;
    return abertura <= fechamento
      ? agora >= abertura && agora < fechamento
      : agora >= abertura || agora < fechamento;
  } catch {
    return true;
  }
}
function aplicarOferta(preco: number, ofertas: Array<Record<string, unknown>>) {
  let melhor: { preco: number; oferta: Record<string, unknown> } | undefined;
  for (const oferta of ofertas) {
    const valor = Number(oferta.desconto_valor) || 0;
    const tipo = String(oferta.desconto_tipo);
    const calculado =
      tipo === "percentual"
        ? preco * (1 - valor / 100)
        : tipo === "valor"
          ? preco - valor
          : tipo === "preco_fixo"
            ? valor
            : preco;
    const final = Math.max(0, Math.round(calculado * 100) / 100);
    if (final < preco && (!melhor || final < melhor.preco))
      melhor = { preco: final, oferta };
  }
  return melhor;
}

serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(request.method))
    return responder({ error: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret)
    return responder({ error: "Catálogo temporariamente indisponível." }, 503);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const slug = String(body.slug || "")
        .trim()
        .toLowerCase();
      const tipo = String(body.tipo || "");
      const sessao = String(body.sessao || "").slice(0, 100);
      if (!slugValido(slug) || !eventos.has(tipo) || !sessao)
        return responder({ error: "Evento inválido." }, 400);
      const { data: catalogo } = await admin
        .from("catalogos")
        .select("id,loja_id,status")
        .eq("slug", slug)
        .eq("status", "publicado")
        .maybeSingle();
      if (!catalogo) return responder({ recebido: true }, 202);
      const sessaoHash = await sha256(
        `${catalogo.id}:${sessao}:${secret.slice(-12)}`,
      );
      const desde = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin
        .from("catalogo_eventos")
        .select("id", { count: "exact", head: true })
        .eq("catalogo_id", catalogo.id)
        .eq("sessao_hash", sessaoHash)
        .gte("criado_em", desde);
      if ((count || 0) >= 30) return responder({ recebido: true }, 202);
      await admin
        .from("catalogo_eventos")
        .insert({
          catalogo_id: catalogo.id,
          loja_id: catalogo.loja_id,
          tipo,
          produto_id: body.produtoId
            ? String(body.produtoId).slice(0, 120)
            : null,
          sessao_hash: sessaoHash,
          origem: body.origem ? String(body.origem).slice(0, 300) : null,
          idioma: idiomaValido(body.idioma) ? body.idioma : "pt-BR",
        });
      return responder({ recebido: true }, 202);
    }

    const reqUrl = new URL(request.url);
    const slug = reqUrl.searchParams.get("slug")?.trim().toLowerCase() || "";
    if (!slugValido(slug))
      return responder({ error: "Endereço de catálogo inválido." }, 400);
    const { data: catalogo, error: catalogoError } = await admin
      .from("catalogos")
      .select("*")
      .eq("slug", slug)
      .eq("status", "publicado")
      .maybeSingle();
    if (catalogoError) throw catalogoError;
    if (!catalogo)
      return responder(
        { error: "Catálogo não encontrado ou temporariamente pausado." },
        404,
        "public, max-age=15",
      );
    const ativos = ((catalogo.idiomas_ativos || ["pt-BR"]) as Idioma[]).filter(
      idiomaValido,
    );
    const pedidoIdioma = reqUrl.searchParams.get("lang");
    const idioma: Idioma =
      idiomaValido(pedidoIdioma) && ativos.includes(pedidoIdioma)
        ? pedidoIdioma
        : idiomaValido(catalogo.idioma_padrao)
          ? catalogo.idioma_padrao
          : "pt-BR";
    const [
      { data: categorias, error: categoriasError },
      { data: itens, error: itensError },
      ofertasResult,
    ] = await Promise.all([
      admin
        .from("catalogo_categorias")
        .select("*")
        .eq("catalogo_id", catalogo.id)
        .eq("visivel", true)
        .order("ordem")
        .order("nome"),
      admin
        .from("catalogo_produtos")
        .select("*")
        .eq("catalogo_id", catalogo.id)
        .eq("visivel", true)
        .order("ordem"),
      catalogo.mostrar_ofertas
        ? admin
            .from("ofertas")
            .select(
              "id,titulo,imagem_url,produto_ids,desconto_tipo,desconto_valor,validade_inicio,validade_fim",
            )
            .eq("loja_id", catalogo.loja_id)
            .eq("status", "ativa")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (categoriasError) throw categoriasError;
    if (itensError) throw itensError;
    if (ofertasResult.error) throw ofertasResult.error;
    const agora = Date.now();
    const ofertasValidas = (ofertasResult.data || []).filter(
      (oferta) =>
        (!oferta.validade_inicio ||
          new Date(oferta.validade_inicio).getTime() <= agora) &&
        (!oferta.validade_fim ||
          new Date(oferta.validade_fim).getTime() >= agora),
    );
    const categoriaMap = new Map(
      (categorias || []).map((categoria) => [categoria.id, categoria]),
    );
    const ids = [
      ...new Set((itens || []).map((item) => String(item.produto_id))),
    ];
    const produtosResult = ids.length
      ? await admin
          .from("produtos")
          .select(
            "id,nome,descricao,categoria,preco_venda,estoque,imagem,produto_estoque_origem_id,unidades_por_estoque_origem",
          )
          .eq("loja_id", catalogo.loja_id)
          .in("id", ids)
      : { data: [], error: null };
    if (produtosResult.error) throw produtosResult.error;
    const origensIds = [
      ...new Set(
        (produtosResult.data || [])
          .map((produto) => produto.produto_estoque_origem_id)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const origens = origensIds.length
      ? await admin
          .from("produtos")
          .select("id,estoque")
          .eq("loja_id", catalogo.loja_id)
          .in("id", origensIds)
      : { data: [], error: null };
    if (origens.error) throw origens.error;
    const imagens = ids.length
      ? await admin
          .from("catalogo_produto_imagens")
          .select("produto_id,storage_path,ordem")
          .eq("catalogo_id", catalogo.id)
          .in("produto_id", ids)
          .order("ordem")
      : { data: [], error: null };
    if (imagens.error) throw imagens.error;
    const produtoMap = new Map(
      (produtosResult.data || []).map((produto) => [
        String(produto.id),
        produto,
      ]),
    );
    const origemMap = new Map(
      (origens.data || []).map((origem) => [
        String(origem.id),
        Number(origem.estoque),
      ]),
    );
    const imagensMap = new Map<string, string[]>();
    for (const imagem of imagens.data || [])
      imagensMap.set(String(imagem.produto_id), [
        ...(imagensMap.get(String(imagem.produto_id)) || []),
        urlImagem(url, imagem.storage_path)!,
      ]);
    const limiteBaixo = Math.max(0, Number(catalogo.limite_estoque_baixo) || 3);
    const produtosPublicos = (itens || []).flatMap((item) => {
      const produto = produtoMap.get(String(item.produto_id));
      if (!produto) return [];
      const quantidade = produto.produto_estoque_origem_id
        ? Math.floor(
            (origemMap.get(String(produto.produto_estoque_origem_id)) || 0) *
              Math.max(1, Number(produto.unidades_por_estoque_origem) || 1),
          )
        : Math.max(0, Number(produto.estoque) || 0);
      if (quantidade <= 0 && !item.exibir_sem_estoque) return [];
      const categoria = item.categoria_id
        ? categoriaMap.get(item.categoria_id)
        : undefined;
      if (item.categoria_id && !categoria) return [];
      const precoBase = Number(item.preco_publico ?? produto.preco_venda);
      const ofertasProduto = ofertasValidas.filter((oferta) =>
        (oferta.produto_ids || []).map(String).includes(String(produto.id)),
      );
      const promocao = aplicarOferta(precoBase, ofertasProduto);
      const principal = urlImagem(
        url,
        item.imagem_principal_path || produto.imagem,
      );
      const imagensUrls = [
        ...new Set(
          [principal, ...(imagensMap.get(String(produto.id)) || [])].filter(
            Boolean,
          ),
        ),
      ] as string[];
      return [
        {
          id: String(produto.id),
          nome: localizar(
            idioma,
            item.nome_publico || produto.nome,
            item.nome_publico_es,
            item.nome_publico_en,
          ),
          descricao: localizar(
            idioma,
            item.descricao_publica || produto.descricao,
            item.descricao_publica_es,
            item.descricao_publica_en,
          ),
          categoriaId: categoria?.id,
          categoriaNome: categoria
            ? localizar(
                idioma,
                categoria.nome,
                categoria.nome_es,
                categoria.nome_en,
              )
            : undefined,
          preco: catalogo.mostrar_precos
            ? (promocao?.preco ?? precoBase)
            : undefined,
          precoOriginal:
            catalogo.mostrar_precos && promocao ? precoBase : undefined,
          oferta: promocao
            ? {
                titulo: String(promocao.oferta.titulo),
                desconto:
                  promocao.oferta.desconto_tipo === "percentual"
                    ? `${promocao.oferta.desconto_valor}% OFF`
                    : "Oferta",
                validadeFim: promocao.oferta.validade_fim || undefined,
              }
            : undefined,
          imagemUrl: principal,
          imagensUrls,
          destaque: Boolean(item.destaque),
          ordem: Number(item.ordem),
          disponibilidade:
            quantidade <= 0
              ? "indisponivel"
              : quantidade <= limiteBaixo
                ? "ultimas_unidades"
                : "disponivel",
          quantidadeDisponivel:
            catalogo.modo_estoque === "quantidade" ? quantidade : undefined,
        },
      ];
    });
    const categoriasPublicas = (categorias || []).map((categoria) => ({
      id: categoria.id,
      nome: localizar(
        idioma,
        categoria.nome,
        categoria.nome_es,
        categoria.nome_en,
      ),
      descricao: localizar(
        idioma,
        categoria.descricao,
        categoria.descricao_es,
        categoria.descricao_en,
      ),
      ordem: categoria.ordem,
    }));
    return responder(
      {
        loja: {
          nome: catalogo.nome,
          descricao: catalogo.descricao || undefined,
          slug: catalogo.slug,
          logoUrl: urlImagem(url, catalogo.logo_path),
          bannerUrl: urlImagem(url, catalogo.banner_path),
          bannerMobileUrl: urlImagem(url, catalogo.banner_mobile_path),
          corPrimaria: catalogo.cor_primaria,
          corSecundaria: catalogo.cor_secundaria,
          telefoneWhatsapp: catalogo.telefone_whatsapp || undefined,
          mostrarPrecos: catalogo.mostrar_precos,
          modoEstoque: catalogo.modo_estoque,
          idiomaPadrao: catalogo.idioma_padrao,
          idiomasAtivos: ativos,
          pedidoMinimo: Number(catalogo.pedido_minimo || 0),
          taxaEntrega: Number(catalogo.taxa_entrega || 0),
          regioesEntrega: catalogo.regioes_entrega || [],
          formasPagamento: catalogo.formas_pagamento || [],
          diasFuncionamento: catalogo.dias_funcionamento || [],
          horarioAbertura: catalogo.horario_abertura?.slice(0, 5),
          horarioFechamento: catalogo.horario_fechamento?.slice(0, 5),
          mensagemFechado: catalogo.mensagem_fechado || undefined,
          prazoEntregaMin: catalogo.prazo_entrega_min ?? undefined,
          prazoEntregaMax: catalogo.prazo_entrega_max ?? undefined,
          aberto: lojaAberta(catalogo),
          instagramUrl: catalogo.instagram_url || undefined,
          seoTitulo: catalogo.seo_titulo || undefined,
          seoDescricao: catalogo.seo_descricao || undefined,
        },
        categorias: categoriasPublicas,
        produtos: produtosPublicos,
        idioma,
        atualizadoEm: catalogo.atualizado_em,
      },
      200,
      "public, max-age=15, s-maxage=30",
    );
  } catch (error) {
    console.error("catalogo-publico", error);
    return responder(
      { error: "Não foi possível carregar o catálogo agora." },
      500,
    );
  }
});
