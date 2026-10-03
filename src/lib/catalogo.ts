import { supabase } from "./supabase";
import type { Produto } from "./store";

export type CatalogoStatus = "rascunho" | "publicado" | "pausado";
export type ModoEstoqueCatalogo = "oculto" | "status" | "quantidade";
export type IdiomaCatalogo = "pt-BR" | "es" | "en";

export type Catalogo = {
  id: string;
  lojaId: string;
  slug: string;
  nome: string;
  descricao?: string;
  status: CatalogoStatus;
  logoPath?: string;
  bannerPath?: string;
  bannerMobilePath?: string;
  corPrimaria: string;
  corSecundaria: string;
  telefoneWhatsapp?: string;
  mostrarPrecos: boolean;
  modoEstoque: ModoEstoqueCatalogo;
  novosProdutosVisiveis: boolean;
  idiomaPadrao: IdiomaCatalogo;
  idiomasAtivos: IdiomaCatalogo[];
  pedidoMinimo: number;
  taxaEntrega: number;
  regioesEntrega: string[];
  formasPagamento: string[];
  diasFuncionamento: number[];
  horarioAbertura?: string;
  horarioFechamento?: string;
  fusoHorario: string;
  mensagemFechado?: string;
  prazoEntregaMin?: number;
  prazoEntregaMax?: number;
  limiteEstoqueBaixo: number;
  seoTitulo?: string;
  seoDescricao?: string;
  instagramUrl?: string;
  dominioPersonalizado?: string;
  mostrarOfertas: boolean;
  atualizadoEm?: string;
};

export type CatalogoCategoria = {
  id: string;
  catalogoId: string;
  lojaId: string;
  nome: string;
  slug: string;
  descricao?: string;
  nomeEs?: string;
  nomeEn?: string;
  descricaoEs?: string;
  descricaoEn?: string;
  imagemPath?: string;
  visivel: boolean;
  ordem: number;
};

export type CatalogoProdutoConfig = {
  catalogoId: string;
  lojaId: string;
  produtoId: string;
  categoriaId?: string;
  visivel: boolean;
  destaque: boolean;
  ordem: number;
  nomePublico?: string;
  descricaoPublica?: string;
  nomePublicoEs?: string;
  nomePublicoEn?: string;
  descricaoPublicaEs?: string;
  descricaoPublicaEn?: string;
  precoPublico?: number;
  imagemPrincipalPath?: string;
  exibirSemEstoque: boolean;
  imagens?: CatalogoImagem[];
};

export type CatalogoImagem = {
  id: string;
  catalogoId: string;
  lojaId: string;
  produtoId: string;
  storagePath: string;
  textoAlternativo?: string;
  ordem: number;
};

export type ProdutoCatalogoAdmin = {
  produto: Produto;
  config: CatalogoProdutoConfig;
};

export type CatalogoPublicoProduto = {
  id: string;
  nome: string;
  descricao?: string;
  categoriaId?: string;
  categoriaNome?: string;
  preco?: number;
  precoOriginal?: number;
  oferta?: { titulo: string; desconto: string; validadeFim?: string };
  imagemUrl?: string;
  imagensUrls: string[];
  destaque: boolean;
  ordem: number;
  disponibilidade: "disponivel" | "ultimas_unidades" | "indisponivel";
  quantidadeDisponivel?: number;
};

export type CatalogoPublico = {
  loja: {
    nome: string;
    descricao?: string;
    slug: string;
    logoUrl?: string;
    bannerUrl?: string;
    bannerMobileUrl?: string;
    corPrimaria: string;
    corSecundaria: string;
    telefoneWhatsapp?: string;
    mostrarPrecos: boolean;
    modoEstoque: ModoEstoqueCatalogo;
    idiomaPadrao: IdiomaCatalogo;
    idiomasAtivos: IdiomaCatalogo[];
    pedidoMinimo: number;
    taxaEntrega: number;
    regioesEntrega: string[];
    formasPagamento: string[];
    diasFuncionamento: number[];
    horarioAbertura?: string;
    horarioFechamento?: string;
    mensagemFechado?: string;
    prazoEntregaMin?: number;
    prazoEntregaMax?: number;
    aberto: boolean;
    instagramUrl?: string;
    seoTitulo?: string;
    seoDescricao?: string;
  };
  categorias: Array<{
    id: string;
    nome: string;
    descricao?: string;
    ordem: number;
  }>;
  produtos: CatalogoPublicoProduto[];
  idioma: IdiomaCatalogo;
  atualizadoEm: string;
};

export type ItemCarrinhoCatalogo = {
  produto: Pick<CatalogoPublicoProduto, "id" | "nome" | "preco">;
  quantidade: number;
};

export type MetricasCatalogo = {
  periodoDias: number;
  visitas: number;
  visitantes: number;
  visualizacoesProdutos: number;
  adicoesCarrinho: number;
  cliquesWhatsapp: number;
  compartilhamentos: number;
  conversaoWhatsapp: number;
  produtosMaisVistos: Array<{ produtoId: string; total: number }>;
};

const mapCatalogo = (row: Record<string, unknown>): Catalogo => ({
  id: String(row.id),
  lojaId: String(row.loja_id),
  slug: String(row.slug),
  nome: String(row.nome),
  descricao: row.descricao ? String(row.descricao) : undefined,
  status: row.status as CatalogoStatus,
  logoPath: row.logo_path ? String(row.logo_path) : undefined,
  bannerPath: row.banner_path ? String(row.banner_path) : undefined,
  bannerMobilePath: row.banner_mobile_path
    ? String(row.banner_mobile_path)
    : undefined,
  corPrimaria: String(row.cor_primaria),
  corSecundaria: String(row.cor_secundaria),
  telefoneWhatsapp: row.telefone_whatsapp
    ? String(row.telefone_whatsapp)
    : undefined,
  mostrarPrecos: Boolean(row.mostrar_precos),
  modoEstoque: row.modo_estoque as ModoEstoqueCatalogo,
  novosProdutosVisiveis: Boolean(row.novos_produtos_visiveis),
  idiomaPadrao: (row.idioma_padrao || "pt-BR") as IdiomaCatalogo,
  idiomasAtivos: (row.idiomas_ativos as IdiomaCatalogo[]) || ["pt-BR"],
  pedidoMinimo: Number(row.pedido_minimo || 0),
  taxaEntrega: Number(row.taxa_entrega || 0),
  regioesEntrega: (row.regioes_entrega as string[]) || [],
  formasPagamento: (row.formas_pagamento as string[]) || [],
  diasFuncionamento: (row.dias_funcionamento as number[]) || [
    0, 1, 2, 3, 4, 5, 6,
  ],
  horarioAbertura: row.horario_abertura
    ? String(row.horario_abertura).slice(0, 5)
    : undefined,
  horarioFechamento: row.horario_fechamento
    ? String(row.horario_fechamento).slice(0, 5)
    : undefined,
  fusoHorario: String(row.fuso_horario || "America/Sao_Paulo"),
  mensagemFechado: row.mensagem_fechado
    ? String(row.mensagem_fechado)
    : undefined,
  prazoEntregaMin:
    row.prazo_entrega_min == null ? undefined : Number(row.prazo_entrega_min),
  prazoEntregaMax:
    row.prazo_entrega_max == null ? undefined : Number(row.prazo_entrega_max),
  limiteEstoqueBaixo: Number(row.limite_estoque_baixo ?? 3),
  seoTitulo: row.seo_titulo ? String(row.seo_titulo) : undefined,
  seoDescricao: row.seo_descricao ? String(row.seo_descricao) : undefined,
  instagramUrl: row.instagram_url ? String(row.instagram_url) : undefined,
  dominioPersonalizado: row.dominio_personalizado
    ? String(row.dominio_personalizado)
    : undefined,
  mostrarOfertas: row.mostrar_ofertas !== false,
  atualizadoEm: row.atualizado_em ? String(row.atualizado_em) : undefined,
});

const mapCategoria = (row: Record<string, unknown>): CatalogoCategoria => ({
  id: String(row.id),
  catalogoId: String(row.catalogo_id),
  lojaId: String(row.loja_id),
  nome: String(row.nome),
  slug: String(row.slug),
  descricao: row.descricao ? String(row.descricao) : undefined,
  nomeEs: row.nome_es ? String(row.nome_es) : undefined,
  nomeEn: row.nome_en ? String(row.nome_en) : undefined,
  descricaoEs: row.descricao_es ? String(row.descricao_es) : undefined,
  descricaoEn: row.descricao_en ? String(row.descricao_en) : undefined,
  imagemPath: row.imagem_path ? String(row.imagem_path) : undefined,
  visivel: Boolean(row.visivel),
  ordem: Number(row.ordem),
});

const mapProdutoConfig = (
  row: Record<string, unknown>,
): CatalogoProdutoConfig => ({
  catalogoId: String(row.catalogo_id),
  lojaId: String(row.loja_id),
  produtoId: String(row.produto_id),
  categoriaId: row.categoria_id ? String(row.categoria_id) : undefined,
  visivel: Boolean(row.visivel),
  destaque: Boolean(row.destaque),
  ordem: Number(row.ordem),
  nomePublico: row.nome_publico ? String(row.nome_publico) : undefined,
  descricaoPublica: row.descricao_publica
    ? String(row.descricao_publica)
    : undefined,
  nomePublicoEs: row.nome_publico_es ? String(row.nome_publico_es) : undefined,
  nomePublicoEn: row.nome_publico_en ? String(row.nome_publico_en) : undefined,
  descricaoPublicaEs: row.descricao_publica_es
    ? String(row.descricao_publica_es)
    : undefined,
  descricaoPublicaEn: row.descricao_publica_en
    ? String(row.descricao_publica_en)
    : undefined,
  precoPublico:
    row.preco_publico == null ? undefined : Number(row.preco_publico),
  imagemPrincipalPath: row.imagem_principal_path
    ? String(row.imagem_principal_path)
    : undefined,
  exibirSemEstoque: Boolean(row.exibir_sem_estoque),
});

export function slugDoCatalogo(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function referenciaImagemCatalogoValida(valor?: string) {
  const referencia = valor?.trim();
  if (!referencia) return true;
  if (!referencia.includes("://")) {
    return (
      referencia.length <= 2048 &&
      /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)+$/.test(referencia)
    );
  }
  try {
    const url = new URL(referencia);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      referencia.length <= 2048
    );
  } catch {
    return false;
  }
}

export function montarProdutosParaCatalogo(
  produtos: Produto[],
  lojaId: string,
  catalogoId = "",
  configs: CatalogoProdutoConfig[] = [],
): ProdutoCatalogoAdmin[] {
  const porProduto = new Map(
    configs.map((config) => [config.produtoId, config]),
  );
  return produtos.map((produto, index) => ({
    produto,
    config: porProduto.get(produto.id) || {
      catalogoId,
      lojaId,
      produtoId: produto.id,
      // O estoque aparece automaticamente na gestão, mas a publicação é uma
      // decisão explícita do lojista.
      visivel: false,
      destaque: false,
      ordem: index,
      exibirSemEstoque: false,
    },
  }));
}

export function urlPublicaImagem(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("catalogos").getPublicUrl(path).data.publicUrl;
}

export async function carregarCatalogoAdministrativo(
  lojaId: string,
  produtos: Produto[],
) {
  const { data: catalogoRow, error: catalogoError } = await supabase
    .from("catalogos")
    .select("*")
    .eq("loja_id", lojaId)
    .maybeSingle();
  if (catalogoError) throw new Error(catalogoError.message);
  if (!catalogoRow)
    return {
      catalogo: undefined,
      categorias: [],
      // A configuração da vitrine ainda não existe, mas o estoque já deve ser
      // exibido para que o lojista escolha o que publicar.
      produtos: montarProdutosParaCatalogo(produtos, lojaId),
    };

  const catalogo = mapCatalogo(catalogoRow as Record<string, unknown>);
  const [
    { data: categoriaRows, error: categoriaError },
    { data: configRows, error: configError },
    { data: imagemRows, error: imagemError },
  ] = await Promise.all([
    supabase
      .from("catalogo_categorias")
      .select("*")
      .eq("catalogo_id", catalogo.id)
      .order("ordem")
      .order("nome"),
    supabase
      .from("catalogo_produtos")
      .select("*")
      .eq("catalogo_id", catalogo.id)
      .order("ordem"),
    supabase
      .from("catalogo_produto_imagens")
      .select("*")
      .eq("catalogo_id", catalogo.id)
      .order("ordem"),
  ]);
  if (categoriaError) throw new Error(categoriaError.message);
  if (configError) throw new Error(configError.message);
  if (imagemError) throw new Error(imagemError.message);

  const imagensPorProduto = new Map<string, CatalogoImagem[]>();
  for (const row of imagemRows || []) {
    const produtoId = String(row.produto_id);
    const imagem: CatalogoImagem = {
      id: String(row.id),
      catalogoId: String(row.catalogo_id),
      lojaId: String(row.loja_id),
      produtoId,
      storagePath: String(row.storage_path),
      textoAlternativo: row.texto_alternativo
        ? String(row.texto_alternativo)
        : undefined,
      ordem: Number(row.ordem),
    };
    imagensPorProduto.set(produtoId, [
      ...(imagensPorProduto.get(produtoId) || []),
      imagem,
    ]);
  }
  const configs = (configRows || []).map((row) => {
    const config = mapProdutoConfig(row as Record<string, unknown>);
    return {
      ...config,
      imagens: imagensPorProduto.get(config.produtoId) || [],
    };
  });
  const itens = montarProdutosParaCatalogo(
    produtos,
    lojaId,
    catalogo.id,
    configs,
  );
  return {
    catalogo,
    categorias: (categoriaRows || []).map((row) =>
      mapCategoria(row as Record<string, unknown>),
    ),
    produtos: itens,
  };
}

export async function salvarCatalogo(
  catalogo: Omit<Catalogo, "id"> & { id?: string },
) {
  const payload = {
    ...(catalogo.id ? { id: catalogo.id } : {}),
    loja_id: catalogo.lojaId,
    slug: slugDoCatalogo(catalogo.slug),
    nome: catalogo.nome.trim(),
    descricao: catalogo.descricao?.trim() || null,
    status: catalogo.status,
    logo_path: catalogo.logoPath || null,
    banner_path: catalogo.bannerPath || null,
    banner_mobile_path: catalogo.bannerMobilePath || null,
    cor_primaria: catalogo.corPrimaria,
    cor_secundaria: catalogo.corSecundaria,
    telefone_whatsapp: catalogo.telefoneWhatsapp?.replace(/\D/g, "") || null,
    mostrar_precos: catalogo.mostrarPrecos,
    modo_estoque: catalogo.modoEstoque,
    novos_produtos_visiveis: catalogo.novosProdutosVisiveis,
    idioma_padrao: catalogo.idiomaPadrao,
    idiomas_ativos: catalogo.idiomasAtivos,
    pedido_minimo: catalogo.pedidoMinimo,
    taxa_entrega: catalogo.taxaEntrega,
    regioes_entrega: catalogo.regioesEntrega,
    formas_pagamento: catalogo.formasPagamento,
    dias_funcionamento: catalogo.diasFuncionamento,
    horario_abertura: catalogo.horarioAbertura || null,
    horario_fechamento: catalogo.horarioFechamento || null,
    fuso_horario: catalogo.fusoHorario,
    mensagem_fechado: catalogo.mensagemFechado?.trim() || null,
    prazo_entrega_min: catalogo.prazoEntregaMin ?? null,
    prazo_entrega_max: catalogo.prazoEntregaMax ?? null,
    limite_estoque_baixo: catalogo.limiteEstoqueBaixo,
    seo_titulo: catalogo.seoTitulo?.trim() || null,
    seo_descricao: catalogo.seoDescricao?.trim() || null,
    instagram_url: catalogo.instagramUrl?.trim() || null,
    dominio_personalizado:
      catalogo.dominioPersonalizado?.trim().toLowerCase() || null,
    mostrar_ofertas: catalogo.mostrarOfertas,
  };
  const { data, error } = await supabase
    .from("catalogos")
    .upsert(payload, { onConflict: "loja_id" })
    .select("*")
    .single();
  if (error)
    throw new Error(
      error.code === "23505"
        ? "Este endereço público já está sendo usado por outra loja."
        : error.message,
    );
  return mapCatalogo(data as Record<string, unknown>);
}

export async function salvarCategoria(
  categoria: Omit<CatalogoCategoria, "id"> & { id?: string },
) {
  const payload = {
    ...(categoria.id ? { id: categoria.id } : {}),
    catalogo_id: categoria.catalogoId,
    loja_id: categoria.lojaId,
    nome: categoria.nome.trim(),
    slug: slugDoCatalogo(categoria.slug || categoria.nome),
    descricao: categoria.descricao?.trim() || null,
    nome_es: categoria.nomeEs?.trim() || null,
    nome_en: categoria.nomeEn?.trim() || null,
    descricao_es: categoria.descricaoEs?.trim() || null,
    descricao_en: categoria.descricaoEn?.trim() || null,
    imagem_path: categoria.imagemPath || null,
    visivel: categoria.visivel,
    ordem: categoria.ordem,
  };
  const { data, error } = await supabase
    .from("catalogo_categorias")
    .upsert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapCategoria(data as Record<string, unknown>);
}

export async function removerCategoria(id: string) {
  const { error } = await supabase
    .from("catalogo_categorias")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function salvarProdutoCatalogo(config: CatalogoProdutoConfig) {
  if (!referenciaImagemCatalogoValida(config.imagemPrincipalPath)) {
    throw new Error(
      "Informe uma URL de imagem válida começando com http:// ou https://.",
    );
  }
  const { error } = await supabase.from("catalogo_produtos").upsert(
    {
      catalogo_id: config.catalogoId,
      loja_id: config.lojaId,
      produto_id: config.produtoId,
      categoria_id: config.categoriaId || null,
      visivel: config.visivel,
      destaque: config.destaque,
      ordem: config.ordem,
      nome_publico: config.nomePublico?.trim() || null,
      descricao_publica: config.descricaoPublica?.trim() || null,
      nome_publico_es: config.nomePublicoEs?.trim() || null,
      nome_publico_en: config.nomePublicoEn?.trim() || null,
      descricao_publica_es: config.descricaoPublicaEs?.trim() || null,
      descricao_publica_en: config.descricaoPublicaEn?.trim() || null,
      preco_publico: config.precoPublico ?? null,
      imagem_principal_path: config.imagemPrincipalPath || null,
      exibir_sem_estoque: config.exibirSemEstoque,
    },
    { onConflict: "catalogo_id,produto_id" },
  );
  if (error) throw new Error(error.message);
}

export async function alterarVisibilidadeEmLote(
  configs: CatalogoProdutoConfig[],
  visivel: boolean,
) {
  const { error } = await supabase.from("catalogo_produtos").upsert(
    configs.map((config) => ({
      catalogo_id: config.catalogoId,
      loja_id: config.lojaId,
      produto_id: config.produtoId,
      categoria_id: config.categoriaId || null,
      visivel,
      destaque: config.destaque,
      ordem: config.ordem,
      nome_publico: config.nomePublico || null,
      descricao_publica: config.descricaoPublica || null,
      nome_publico_es: config.nomePublicoEs || null,
      nome_publico_en: config.nomePublicoEn || null,
      descricao_publica_es: config.descricaoPublicaEs || null,
      descricao_publica_en: config.descricaoPublicaEn || null,
      preco_publico: config.precoPublico ?? null,
      imagem_principal_path: config.imagemPrincipalPath || null,
      exibir_sem_estoque: config.exibirSemEstoque,
    })),
    { onConflict: "catalogo_id,produto_id" },
  );
  if (error) throw new Error(error.message);
}

export async function uploadImagemCatalogo(
  arquivo: File,
  lojaId: string,
  pasta: string,
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type))
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (arquivo.size > 5 * 1024 * 1024)
    throw new Error("A imagem deve ter no máximo 5 MB.");
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${lojaId}/${pasta}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage
    .from("catalogos")
    .upload(path, arquivo, { cacheControl: "3600" });
  if (error) throw new Error(error.message);
  return path;
}

export async function salvarImagemProdutoCatalogo(
  imagem: Omit<CatalogoImagem, "id"> & { id?: string },
) {
  if (!referenciaImagemCatalogoValida(imagem.storagePath)) {
    throw new Error("Informe uma URL de imagem válida.");
  }
  const { data, error } = await supabase
    .from("catalogo_produto_imagens")
    .upsert({
      ...(imagem.id ? { id: imagem.id } : {}),
      catalogo_id: imagem.catalogoId,
      loja_id: imagem.lojaId,
      produto_id: imagem.produtoId,
      storage_path: imagem.storagePath.trim(),
      texto_alternativo: imagem.textoAlternativo?.trim() || null,
      ordem: imagem.ordem,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: String(data.id),
    catalogoId: String(data.catalogo_id),
    lojaId: String(data.loja_id),
    produtoId: String(data.produto_id),
    storagePath: String(data.storage_path),
    textoAlternativo: data.texto_alternativo
      ? String(data.texto_alternativo)
      : undefined,
    ordem: Number(data.ordem),
  } satisfies CatalogoImagem;
}

export async function removerImagemProdutoCatalogo(id: string) {
  const { error } = await supabase
    .from("catalogo_produto_imagens")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function carregarMetricasCatalogo(catalogoId: string, dias = 30) {
  const { data, error } = await supabase.rpc("metricas_catalogo", {
    p_catalogo_id: catalogoId,
    p_dias: dias,
  });
  if (error) throw new Error(error.message);
  return data as MetricasCatalogo;
}

export async function carregarCatalogoPublico(
  slug: string,
  idioma?: IdiomaCatalogo,
): Promise<CatalogoPublico> {
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(
    /\/$/,
    "",
  );
  const apikey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  const response = await fetch(
    `${base}/functions/v1/catalogo-publico?slug=${encodeURIComponent(slugDoCatalogo(slug))}${idioma ? `&lang=${encodeURIComponent(idioma)}` : ""}`,
    {
      headers: { apikey },
    },
  );
  const data = (await response.json().catch(() => ({}))) as CatalogoPublico & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || "Não foi possível carregar este catálogo.");
  return data;
}

type EventoCatalogo =
  | "visita"
  | "produto_visualizado"
  | "adicionado_carrinho"
  | "removido_carrinho"
  | "whatsapp"
  | "compartilhamento"
  | "busca";

function sessaoPublicaCatalogo() {
  const chave = "orbita_catalogo_sessao";
  try {
    const atual = sessionStorage.getItem(chave);
    if (atual) return atual;
    const novo = crypto.randomUUID();
    sessionStorage.setItem(chave, novo);
    return novo;
  } catch {
    return crypto.randomUUID();
  }
}

export async function registrarEventoCatalogo(
  slug: string,
  tipo: EventoCatalogo,
  idioma: IdiomaCatalogo,
  produtoId?: string,
) {
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(
    /\/$/,
    "",
  );
  const apikey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  try {
    await fetch(`${base}/functions/v1/catalogo-publico`, {
      method: "POST",
      keepalive: true,
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: slugDoCatalogo(slug),
        tipo,
        idioma,
        produtoId,
        sessao: sessaoPublicaCatalogo(),
        origem: document.referrer.slice(0, 300) || undefined,
      }),
    });
  } catch {
    // Métricas nunca podem impedir a compra ou a navegação do cliente.
  }
}

export function linkWhatsAppCatalogo(
  telefone: string | undefined,
  produto: CatalogoPublicoProduto,
  loja: string,
) {
  const numero = telefone?.replace(/\D/g, "");
  if (!numero) return undefined;
  const mensagem = encodeURIComponent(
    `Olá! Vi “${produto.nome}” no catálogo da ${loja} e gostaria de fazer um pedido.`,
  );
  return `https://wa.me/${numero}?text=${mensagem}`;
}

export function linkPedidoWhatsAppCatalogo(
  telefone: string | undefined,
  loja: string,
  itens: ItemCarrinhoCatalogo[],
  taxaEntrega = 0,
  idioma: IdiomaCatalogo = "pt-BR",
) {
  const numero = telefone?.replace(/\D/g, "");
  if (!numero || !itens.length) return undefined;
  const textos = {
    "pt-BR": {
      inicio: `Olá! Quero fazer um pedido na ${loja}:`,
      total: "Total estimado",
      entrega: "Entrega",
    },
    es: {
      inicio: `¡Hola! Quiero hacer un pedido en ${loja}:`,
      total: "Total estimado",
      entrega: "Envío",
    },
    en: {
      inicio: `Hello! I'd like to order from ${loja}:`,
      total: "Estimated total",
      entrega: "Delivery",
    },
  }[idioma];
  const subtotal = itens.reduce(
    (total, item) => total + (item.produto.preco || 0) * item.quantidade,
    0,
  );
  const linhas = itens.map(
    (item) =>
      `• ${item.quantidade}x ${item.produto.nome}${item.produto.preco == null ? "" : ` — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.produto.preco * item.quantidade)}`}`,
  );
  if (taxaEntrega > 0)
    linhas.push(
      `${textos.entrega}: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(taxaEntrega)}`,
    );
  linhas.push(
    `${textos.total}: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subtotal + taxaEntrega)}`,
  );
  return `https://wa.me/${numero}?text=${encodeURIComponent([textos.inicio, "", ...linhas].join("\n"))}`;
}
