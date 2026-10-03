import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  Loader2,
  MessageCircle,
  Minus,
  PackageOpen,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  carregarCatalogoPublico,
  linkPedidoWhatsAppCatalogo,
  registrarEventoCatalogo,
  type CatalogoPublico as CatalogoTipo,
  type CatalogoPublicoProduto as Produto,
  type IdiomaCatalogo as Idioma,
} from "../lib/catalogo";

type Carrinho = Record<string, number>;
const opcoesIdioma: Array<{ id: Idioma; nome: string }> = [
  { id: "pt-BR", nome: "Português (Brasil)" },
  { id: "es", nome: "Español" },
  { id: "en", nome: "English" },
];
const textos = {
  "pt-BR": {
    catalogo: "Catálogo virtual",
    buscar: "Buscar produtos…",
    todos: "Todos",
    destaques: "Destaques",
    produtos: "Todos os produtos",
    itens: "item(ns)",
    vazio: "Nenhum produto encontrado",
    limpar: "Limpar filtros",
    disponivel: "Disponível",
    ultimas: "Últimas unidades",
    indisponivel: "Indisponível",
    adicionar: "Adicionar",
    verCarrinho: "Ver carrinho",
    carrinho: "Seu pedido",
    carrinhoVazio: "Seu carrinho está vazio.",
    subtotal: "Subtotal",
    entrega: "Entrega",
    total: "Total estimado",
    minimo: "Pedido mínimo",
    faltam: "Faltam",
    enviar: "Enviar pedido pelo WhatsApp",
    fechar: "Continuar comprando",
    aberto: "Aberto agora",
    fechado: "Fechado agora",
    prazo: "Prazo estimado",
    minutos: "min",
    pagamento: "Pagamento",
    regioes: "Regiões de entrega",
    compartilhar: "Compartilhar",
    copiado: "Link copiado",
    voltar: "Voltar ao catálogo",
  },
  es: {
    catalogo: "Catálogo virtual",
    buscar: "Buscar productos…",
    todos: "Todos",
    destaques: "Destacados",
    produtos: "Todos los productos",
    itens: "producto(s)",
    vazio: "No se encontraron productos",
    limpar: "Limpiar filtros",
    disponivel: "Disponible",
    ultimas: "Últimas unidades",
    indisponivel: "Agotado",
    adicionar: "Agregar",
    verCarrinho: "Ver carrito",
    carrinho: "Tu pedido",
    carrinhoVazio: "Tu carrito está vacío.",
    subtotal: "Subtotal",
    entrega: "Envío",
    total: "Total estimado",
    minimo: "Pedido mínimo",
    faltam: "Faltan",
    enviar: "Enviar pedido por WhatsApp",
    fechar: "Seguir comprando",
    aberto: "Abierto ahora",
    fechado: "Cerrado ahora",
    prazo: "Tiempo estimado",
    minutos: "min",
    pagamento: "Formas de pago",
    regioes: "Zonas de entrega",
    compartilhar: "Compartir",
    copiado: "Enlace copiado",
    voltar: "Volver al catálogo",
  },
  en: {
    catalogo: "Online catalog",
    buscar: "Search products…",
    todos: "All",
    destaques: "Featured",
    produtos: "All products",
    itens: "item(s)",
    vazio: "No products found",
    limpar: "Clear filters",
    disponivel: "Available",
    ultimas: "Low stock",
    indisponivel: "Out of stock",
    adicionar: "Add",
    verCarrinho: "View cart",
    carrinho: "Your order",
    carrinhoVazio: "Your cart is empty.",
    subtotal: "Subtotal",
    entrega: "Delivery",
    total: "Estimated total",
    minimo: "Minimum order",
    faltam: "Add",
    enviar: "Send order via WhatsApp",
    fechar: "Continue shopping",
    aberto: "Open now",
    fechado: "Closed now",
    prazo: "Estimated time",
    minutos: "min",
    pagamento: "Payment methods",
    regioes: "Delivery areas",
    compartilhar: "Share",
    copiado: "Link copied",
    voltar: "Back to catalog",
  },
};
const moeda = (valor: number, idioma: Idioma) =>
  valor.toLocaleString(idioma, { style: "currency", currency: "BRL" });

function Card({
  produto,
  catalogo,
  idioma,
  quantidade,
  abrir,
  adicionar,
}: {
  produto: Produto;
  catalogo: CatalogoTipo;
  idioma: Idioma;
  quantidade: number;
  abrir: () => void;
  adicionar: () => void;
}) {
  const t = textos[idioma];
  const status =
    produto.disponibilidade === "indisponivel"
      ? t.indisponivel
      : produto.disponibilidade === "ultimas_unidades"
        ? t.ultimas
        : t.disponivel;
  return (
    <article className="group flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <button onClick={abrir} className="min-w-0 flex-1 text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {produto.imagemUrl ? (
            <img
              src={produto.imagemUrl}
              alt={produto.nome}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-300">
              <ShoppingBag size={42} />
            </div>
          )}
          {produto.oferta && (
            <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white shadow">
              {produto.oferta.desconto}
            </span>
          )}
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">
            {produto.categoriaNome || t.todos}
          </p>
          <h3 className="mt-1 line-clamp-2 min-h-12 font-bold">
            {produto.nome}
          </h3>
          {produto.descricao && (
            <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
              {produto.descricao}
            </p>
          )}
          <div className="mt-3">
            {produto.precoOriginal != null && (
              <span className="mr-2 text-xs text-slate-400 line-through">
                {moeda(produto.precoOriginal, idioma)}
              </span>
            )}
            {produto.preco != null && (
              <span
                className="text-xl font-black"
                style={{ color: catalogo.loja.corPrimaria }}
              >
                {moeda(produto.preco, idioma)}
              </span>
            )}
            <p
              className={`mt-1 text-xs font-semibold ${produto.disponibilidade === "indisponivel" ? "text-rose-600" : produto.disponibilidade === "ultimas_unidades" ? "text-amber-600" : "text-emerald-600"}`}
            >
              {status}
              {produto.quantidadeDisponivel != null
                ? ` · ${produto.quantidadeDisponivel}`
                : ""}
            </p>
          </div>
        </div>
      </button>
      <div className="flex w-14 flex-col items-center justify-end gap-1 border-l border-slate-100 p-2">
        {quantidade > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-slate-100 px-1 text-xs font-black">
            {quantidade}
          </span>
        )}
        <button
          aria-label={`${t.adicionar} ${produto.nome}`}
          disabled={produto.disponibilidade === "indisponivel"}
          onClick={adicionar}
          className="grid h-10 w-10 place-items-center rounded-xl text-white disabled:bg-slate-300"
          style={
            produto.disponibilidade !== "indisponivel"
              ? { backgroundColor: catalogo.loja.corPrimaria }
              : undefined
          }
        >
          <Plus size={19} />
        </button>
      </div>
    </article>
  );
}

export function CatalogoPublico() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const inicial = params.get("lang") as Idioma | null;
  const [idioma, setIdioma] = useState<Idioma>(
    inicial && textos[inicial] ? inicial : "pt-BR",
  );
  const [catalogo, setCatalogo] = useState<CatalogoTipo>();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [produtoAberto, setProdutoAberto] = useState<Produto>();
  const [imagemAtiva, setImagemAtiva] = useState(0);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [carrinho, setCarrinho] = useState<Carrinho>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`orbita-carrinho-${slug}`) || "{}",
      );
    } catch {
      return {};
    }
  });

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCarregando(true);
        setErro("");
      }
      try {
      const data = await carregarCatalogoPublico(slug, idioma);
      setCatalogo(data);
      if (data.idioma !== idioma) setIdioma(data.idioma);
        setCarrinho((atual) =>
          Object.fromEntries(
            Object.entries(atual).filter(
              ([id, qtd]) =>
                data.produtos.some(
                  (item) =>
                    item.id === id && item.disponibilidade !== "indisponivel",
                ) && qtd > 0,
            ),
          ),
        );
        if (!silencioso) void registrarEventoCatalogo(slug, "visita", idioma);
      } catch (error) {
        if (!silencioso)
          setErro(
            error instanceof Error ? error.message : "Catálogo indisponível.",
          );
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [idioma, slug],
  );
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    const timer = window.setInterval(
      () => document.visibilityState === "visible" && void carregar(true),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [carregar]);
  useEffect(() => {
    localStorage.setItem(`orbita-carrinho-${slug}`, JSON.stringify(carrinho));
  }, [carrinho, slug]);
  useEffect(() => {
    if (!catalogo) return;
    document.title =
      catalogo.loja.seoTitulo || `${catalogo.loja.nome} — Catálogo`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      document.head.appendChild(meta);
    }
    meta.setAttribute("name", "description");
    meta.setAttribute(
      "content",
      catalogo.loja.seoDescricao ||
        catalogo.loja.descricao ||
        `Catálogo de ${catalogo.loja.nome}`,
    );
  }, [catalogo]);
  useEffect(() => {
    if (!busca.trim()) return;
    const timer = window.setTimeout(
      () => void registrarEventoCatalogo(slug, "busca", idioma),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [busca, idioma, slug]);

  const t = textos[idioma];
  const produtos = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase(idioma);
    return (catalogo?.produtos || []).filter(
      (produto) =>
        (!categoriaId || produto.categoriaId === categoriaId) &&
        (!termo ||
          `${produto.nome} ${produto.descricao || ""} ${produto.categoriaNome || ""}`
            .toLocaleLowerCase(idioma)
            .includes(termo)),
    );
  }, [busca, categoriaId, catalogo, idioma]);
  const destaques = produtos.filter((produto) => produto.destaque);
  const itens = useMemo(
    () =>
      Object.entries(carrinho).flatMap(([id, quantidade]) => {
        const produto = catalogo?.produtos.find((item) => item.id === id);
        return produto ? [{ produto, quantidade }] : [];
      }),
    [carrinho, catalogo],
  );
  const quantidadeTotal = itens.reduce(
    (total, item) => total + item.quantidade,
    0,
  );
  const subtotal = itens.reduce(
    (total, item) => total + (item.produto.preco || 0) * item.quantidade,
    0,
  );
  const taxa = catalogo?.loja.taxaEntrega || 0;
  const total = subtotal + taxa;
  const faltaMinimo = Math.max(
    0,
    (catalogo?.loja.pedidoMinimo || 0) - subtotal,
  );

  function mudarQuantidade(produto: Produto, delta: number) {
    setCarrinho((atual) => {
      const quantidade = Math.max(
        0,
        Math.min(
          produto.quantidadeDisponivel ?? 999,
          (atual[produto.id] || 0) + delta,
        ),
      );
      const novo = { ...atual };
      if (quantidade) novo[produto.id] = quantidade;
      else delete novo[produto.id];
      return novo;
    });
    void registrarEventoCatalogo(
      slug,
      delta > 0 ? "adicionado_carrinho" : "removido_carrinho",
      idioma,
      produto.id,
    );
  }
  function abrirProduto(produto: Produto) {
    setProdutoAberto(produto);
    setImagemAtiva(0);
    const proximo = new URLSearchParams(params);
    proximo.set("produto", produto.id);
    setParams(proximo, { replace: true });
    void registrarEventoCatalogo(
      slug,
      "produto_visualizado",
      idioma,
      produto.id,
    );
  }
  function fecharProduto() {
    setProdutoAberto(undefined);
    const proximo = new URLSearchParams(params);
    proximo.delete("produto");
    setParams(proximo, { replace: true });
  }
  async function compartilhar(produto?: Produto) {
    const url = new URL(window.location.href);
    if (produto) url.searchParams.set("produto", produto.id);
    else url.searchParams.delete("produto");
    try {
      if (navigator.share)
        await navigator.share({
          title: produto?.nome || catalogo?.loja.nome,
          url: url.toString(),
        });
      else {
        await navigator.clipboard.writeText(url.toString());
        setMensagem(t.copiado);
        window.setTimeout(() => setMensagem(""), 2200);
      }
      void registrarEventoCatalogo(
        slug,
        "compartilhamento",
        idioma,
        produto?.id,
      );
    } catch {
      /* cancelado */
    }
  }
  async function enviarPedido() {
    if (!catalogo || faltaMinimo || !itens.length) return;
    await carregar(true);
    const link = linkPedidoWhatsAppCatalogo(
      catalogo.loja.telefoneWhatsapp,
      catalogo.loja.nome,
      itens,
      taxa,
      idioma,
    );
    if (link) {
      void registrarEventoCatalogo(slug, "whatsapp", idioma);
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }
  function trocarIdioma(novo: Idioma) {
    setIdioma(novo);
    const proximo = new URLSearchParams(params);
    proximo.set("lang", novo);
    setParams(proximo, { replace: true });
  }
  useEffect(() => {
    if (!catalogo || produtoAberto) return;
    const produto = catalogo.produtos.find(
      (item) => item.id === params.get("produto"),
    );
    if (produto) {
      setProdutoAberto(produto);
      void registrarEventoCatalogo(
        slug,
        "produto_visualizado",
        idioma,
        produto.id,
      );
    }
  }, [catalogo, idioma, params, produtoAberto, slug]);

  if (carregando)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Loader2 className="animate-spin text-cyan-600" size={34} />
      </div>
    );
  if (erro || !catalogo)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <PackageOpen className="mx-auto text-slate-400" size={42} />
          <h1 className="mt-4 text-xl font-bold">Catálogo indisponível</h1>
          <p className="mt-2 text-sm text-slate-500">
            {erro || "Esta vitrine não foi encontrada."}
          </p>
        </div>
      </div>
    );

  return (
    <div
      className="min-h-screen bg-slate-50 pb-24 text-slate-900"
      style={
        { "--catalog-primary": catalogo.loja.corPrimaria } as CSSProperties
      }
    >
      <header
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(135deg, ${catalogo.loja.corSecundaria}, ${catalogo.loja.corPrimaria})`,
        }}
      >
        <picture>
          {catalogo.loja.bannerMobileUrl && (
            <source
              media="(max-width: 639px)"
              srcSet={catalogo.loja.bannerMobileUrl}
            />
          )}
          {catalogo.loja.bannerUrl && (
            <img
              src={catalogo.loja.bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
          )}
        </picture>
        <div className="relative mx-auto max-w-7xl px-5 py-7 md:py-11">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => void compartilhar()}
              className="rounded-full bg-white/15 p-2.5 backdrop-blur"
              aria-label={t.compartilhar}
            >
              <Share2 size={17} />
            </button>
            {catalogo.loja.idiomasAtivos.length > 1 && (
              <label className="flex items-center gap-2 rounded-full bg-white/15 px-3 backdrop-blur">
                <Globe2 size={15} />
                <select
                  aria-label="Idioma"
                  value={idioma}
                  onChange={(event) =>
                    trocarIdioma(event.target.value as Idioma)
                  }
                  className="bg-transparent py-2 text-xs font-bold text-white outline-none"
                >
                  {opcoesIdioma
                    .filter((item) =>
                      catalogo.loja.idiomasAtivos.includes(item.id),
                    )
                    .map((item) => (
                      <option
                        className="text-slate-900"
                        key={item.id}
                        value={item.id}
                      >
                        {item.nome}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-2 flex items-center gap-4">
            {catalogo.loja.logoUrl ? (
              <img
                src={catalogo.loja.logoUrl}
                alt={`Logo ${catalogo.loja.nome}`}
                className="h-20 w-20 rounded-2xl border-2 border-white/50 bg-white object-cover shadow-lg md:h-24 md:w-24"
              />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-2xl bg-white/15">
                <Store size={38} />
              </span>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-white/70">
                {t.catalogo}
              </p>
              <h1 className="mt-1 text-3xl font-black md:text-4xl">
                {catalogo.loja.nome}
              </h1>
              {catalogo.loja.descricao && (
                <p className="mt-2 max-w-2xl text-sm text-white/85">
                  {catalogo.loja.descricao}
                </p>
              )}
              <span
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${catalogo.loja.aberto ? "bg-emerald-400/20" : "bg-rose-400/20"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${catalogo.loja.aberto ? "bg-emerald-300" : "bg-rose-300"}`}
                />
                {catalogo.loja.aberto ? t.aberto : t.fechado}
              </span>
            </div>
          </div>
        </div>
      </header>
      {!catalogo.loja.aberto && catalogo.loja.mensagemFechado && (
        <div className="border-b border-amber-200 bg-amber-50 p-3 text-center text-sm font-semibold text-amber-900">
          {catalogo.loja.mensagemFechado}
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-9">
        <div className="mb-6 grid gap-3 text-sm sm:grid-cols-3">
          {(catalogo.loja.prazoEntregaMin != null ||
            catalogo.loja.prazoEntregaMax != null) && (
            <div className="rounded-xl border bg-white p-3">
              <strong>{t.prazo}</strong>
              <p className="text-slate-500">
                {catalogo.loja.prazoEntregaMin || 0}–
                {catalogo.loja.prazoEntregaMax || catalogo.loja.prazoEntregaMin}{" "}
                {t.minutos}
              </p>
            </div>
          )}
          {catalogo.loja.formasPagamento.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <strong>{t.pagamento}</strong>
              <p className="capitalize text-slate-500">
                {catalogo.loja.formasPagamento.join(" · ")}
              </p>
            </div>
          )}
          {catalogo.loja.regioesEntrega.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <strong>{t.regioes}</strong>
              <p className="line-clamp-1 text-slate-500">
                {catalogo.loja.regioesEntrega.join(" · ")}
              </p>
            </div>
          )}
        </div>
        <div className="sticky top-0 z-20 -mx-4 border-b bg-slate-50/95 px-4 pb-4 pt-2 backdrop-blur md:static md:mx-0 md:border-0 md:p-0">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder={t.buscar}
              className="w-full rounded-2xl border bg-white py-3.5 pl-11 pr-4 text-sm shadow-sm outline-none"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setCategoriaId("")}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${!categoriaId ? "text-white" : "bg-white text-slate-600"}`}
              style={
                !categoriaId
                  ? { backgroundColor: catalogo.loja.corPrimaria }
                  : undefined
              }
            >
              {t.todos}
            </button>
            {catalogo.categorias.map((categoria) => (
              <button
                key={categoria.id}
                onClick={() => setCategoriaId(categoria.id)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold ${categoriaId === categoria.id ? "text-white" : "bg-white text-slate-600"}`}
                style={
                  categoriaId === categoria.id
                    ? { backgroundColor: catalogo.loja.corPrimaria }
                    : undefined
                }
              >
                {categoria.nome}
              </button>
            ))}
          </div>
        </div>
        {!busca && !categoriaId && destaques.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-black">{t.destaques}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {destaques.slice(0, 4).map((produto) => (
                <Card
                  key={`d-${produto.id}`}
                  produto={produto}
                  catalogo={catalogo}
                  idioma={idioma}
                  quantidade={carrinho[produto.id] || 0}
                  abrir={() => abrirProduto(produto)}
                  adicionar={() => mudarQuantidade(produto, 1)}
                />
              ))}
            </div>
          </section>
        )}
        <section className="mt-9">
          <h2 className="text-xl font-black">
            {categoriaId
              ? catalogo.categorias.find((item) => item.id === categoriaId)
                  ?.nome
              : t.produtos}
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            {produtos.length} {t.itens}
          </p>
          {produtos.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {produtos.map((produto) => (
                <Card
                  key={produto.id}
                  produto={produto}
                  catalogo={catalogo}
                  idioma={idioma}
                  quantidade={carrinho[produto.id] || 0}
                  abrir={() => abrirProduto(produto)}
                  adicionar={() => mudarQuantidade(produto, 1)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-white py-16 text-center">
              <PackageOpen className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold">{t.vazio}</p>
              <button
                onClick={() => {
                  setBusca("");
                  setCategoriaId("");
                }}
                className="mt-3 text-sm font-bold"
                style={{ color: catalogo.loja.corPrimaria }}
              >
                {t.limpar}
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="mt-10 border-t bg-white py-7 text-center text-xs text-slate-400">
        {catalogo.loja.nome} · Tecnologia Órbita{" "}
        {catalogo.loja.instagramUrl && (
          <a
            href={catalogo.loja.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex"
          >
            <ExternalLink size={15} />
          </a>
        )}
      </footer>
      {quantidadeTotal > 0 && (
        <button
          onClick={() => setCarrinhoAberto(true)}
          className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full px-5 py-3.5 font-bold text-white shadow-2xl"
          style={{ backgroundColor: catalogo.loja.corPrimaria }}
        >
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white/20 px-1 text-xs">
            {quantidadeTotal}
          </span>
          <ShoppingCart size={19} />
          {t.verCarrinho}
          <span>{moeda(total, idioma)}</span>
        </button>
      )}
      {produtoAberto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4"
          onClick={fecharProduto}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video bg-slate-100">
              {produtoAberto.imagensUrls[imagemAtiva] ? (
                <img
                  src={produtoAberto.imagensUrls[imagemAtiva]}
                  alt={produtoAberto.nome}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <ShoppingBag size={54} />
                </div>
              )}
              <button
                onClick={fecharProduto}
                className="absolute right-4 top-4 rounded-full bg-white p-2 shadow"
              >
                <X size={19} />
              </button>
              {produtoAberto.imagensUrls.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImagemAtiva(
                        (v) =>
                          (v - 1 + produtoAberto.imagensUrls.length) %
                          produtoAberto.imagensUrls.length,
                      )
                    }
                    className="absolute left-3 top-1/2 rounded-full bg-white p-2"
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    onClick={() =>
                      setImagemAtiva(
                        (v) => (v + 1) % produtoAberto.imagensUrls.length,
                      )
                    }
                    className="absolute right-3 top-1/2 rounded-full bg-white p-2"
                  >
                    <ChevronRight />
                  </button>
                </>
              )}
            </div>
            <div className="p-6">
              <div className="flex justify-between gap-3">
                <h2 className="text-2xl font-black">{produtoAberto.nome}</h2>
                <button
                  onClick={() => void compartilhar(produtoAberto)}
                  className="rounded-full border p-2"
                >
                  <Share2 size={18} />
                </button>
              </div>
              {produtoAberto.descricao && (
                <p className="mt-3 text-slate-600">{produtoAberto.descricao}</p>
              )}
              <div className="mt-5">
                {produtoAberto.precoOriginal != null && (
                  <span className="mr-2 line-through text-slate-400">
                    {moeda(produtoAberto.precoOriginal, idioma)}
                  </span>
                )}
                {produtoAberto.preco != null && (
                  <strong
                    className="text-3xl"
                    style={{ color: catalogo.loja.corPrimaria }}
                  >
                    {moeda(produtoAberto.preco, idioma)}
                  </strong>
                )}
              </div>
              <button
                disabled={produtoAberto.disponibilidade === "indisponivel"}
                onClick={() => mudarQuantidade(produtoAberto, 1)}
                className="mt-6 flex w-full justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:bg-slate-300"
                style={
                  produtoAberto.disponibilidade !== "indisponivel"
                    ? { backgroundColor: catalogo.loja.corPrimaria }
                    : undefined
                }
              >
                <Plus />
                {t.adicionar}
              </button>
              <button
                onClick={fecharProduto}
                className="mt-3 w-full py-2 text-sm font-semibold text-slate-500"
              >
                {t.voltar}
              </button>
            </div>
          </div>
        </div>
      )}
      {carrinhoAberto && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/55"
          onClick={() => setCarrinhoAberto(false)}
        >
          <aside
            className="ml-auto flex h-full w-full max-w-md flex-col bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-black">{t.carrinho}</h2>
                <p className="text-sm text-slate-500">
                  {quantidadeTotal} {t.itens}
                </p>
              </div>
              <button
                onClick={() => setCarrinhoAberto(false)}
                className="rounded-full border p-2"
              >
                <X size={19} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {itens.length ? (
                itens.map(({ produto, quantidade }) => (
                  <div
                    key={produto.id}
                    className="flex gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{produto.nome}</p>
                      <p className="text-sm font-semibold">
                        {produto.preco == null
                          ? "—"
                          : moeda(produto.preco, idioma)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => mudarQuantidade(produto, -1)}
                          className="rounded-lg border p-1"
                        >
                          <Minus size={15} />
                        </button>
                        <strong>{quantidade}</strong>
                        <button
                          onClick={() => mudarQuantidade(produto, 1)}
                          className="rounded-lg border p-1"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          onClick={() =>
                            setCarrinho((atual) => {
                              const novo = { ...atual };
                              delete novo[produto.id];
                              return novo;
                            })
                          }
                          className="ml-auto text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-16 text-center text-slate-500">
                  {t.carrinhoVazio}
                </p>
              )}
            </div>
            <div className="space-y-2 border-t bg-slate-50 p-5 text-sm">
              <div className="flex justify-between">
                <span>{t.subtotal}</span>
                <strong>{moeda(subtotal, idioma)}</strong>
              </div>
              {taxa > 0 && (
                <div className="flex justify-between">
                  <span>{t.entrega}</span>
                  <strong>{moeda(taxa, idioma)}</strong>
                </div>
              )}
              <div className="flex justify-between border-t pt-3 text-lg">
                <span>{t.total}</span>
                <strong>{moeda(total, idioma)}</strong>
              </div>
              {catalogo.loja.pedidoMinimo > 0 && (
                <div
                  className={`rounded-lg p-2 text-xs font-semibold ${faltaMinimo ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}
                >
                  {faltaMinimo ? (
                    `${t.faltam} ${moeda(faltaMinimo, idioma)} · ${t.minimo}: ${moeda(catalogo.loja.pedidoMinimo, idioma)}`
                  ) : (
                    <span className="inline-flex gap-1">
                      <Check size={14} />
                      {t.minimo}
                    </span>
                  )}
                </div>
              )}
              <button
                disabled={
                  !itens.length ||
                  faltaMinimo > 0 ||
                  !catalogo.loja.telefoneWhatsapp
                }
                onClick={() => void enviarPedido()}
                className="mt-3 flex w-full justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 font-bold text-white disabled:bg-slate-300"
              >
                <MessageCircle />
                {t.enviar}
              </button>
              <button
                onClick={() => setCarrinhoAberto(false)}
                className="w-full py-2 text-sm font-semibold text-slate-500"
              >
                {t.fechar}
              </button>
            </div>
          </aside>
        </div>
      )}
      {mensagem && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          {mensagem}
        </div>
      )}
    </div>
  );
}
