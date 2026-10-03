import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  BarChart3,
  Languages,
  Link2,
  Loader2,
  Package,
  Palette,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import {
  alterarVisibilidadeEmLote,
  carregarCatalogoAdministrativo,
  carregarMetricasCatalogo,
  removerCategoria,
  removerImagemProdutoCatalogo,
  salvarCatalogo,
  salvarCategoria,
  salvarImagemProdutoCatalogo,
  salvarProdutoCatalogo,
  slugDoCatalogo,
  uploadImagemCatalogo,
  urlPublicaImagem,
  referenciaImagemCatalogoValida,
  type Catalogo as CatalogoTipo,
  type CatalogoCategoria,
  type IdiomaCatalogo,
  type MetricasCatalogo,
  type ProdutoCatalogoAdmin,
} from "../lib/catalogo";

type Aba = "produtos" | "categorias" | "aparencia" | "desempenho";

const catalogoInicial = (lojaId: string): Omit<CatalogoTipo, "id"> => ({
  lojaId,
  slug: "",
  nome: "Minha loja",
  descricao: "",
  status: "rascunho",
  corPrimaria: "#0891b2",
  corSecundaria: "#0b2545",
  telefoneWhatsapp: "",
  mostrarPrecos: true,
  modoEstoque: "status",
  novosProdutosVisiveis: false,
  idiomaPadrao: "pt-BR",
  idiomasAtivos: ["pt-BR"],
  pedidoMinimo: 0,
  taxaEntrega: 0,
  regioesEntrega: [],
  formasPagamento: ["pix", "dinheiro", "cartao"],
  diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
  fusoHorario: "America/Sao_Paulo",
  limiteEstoqueBaixo: 3,
  mostrarOfertas: true,
});

export function Catalogo() {
  const { lojaId, produtos } = useStore();
  const [catalogo, setCatalogo] = useState<
    Omit<CatalogoTipo, "id"> & { id?: string }
  >(() => catalogoInicial(lojaId));
  const [categorias, setCategorias] = useState<CatalogoCategoria[]>([]);
  const [itens, setItens] = useState<ProdutoCatalogoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("produtos");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<
    "todos" | "visiveis" | "ocultos" | "sem_estoque"
  >("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<ProdutoCatalogoAdmin>();
  const [categoriaForm, setCategoriaForm] = useState<{
    id?: string;
    nome: string;
    descricao: string;
    nomeEs?: string;
    nomeEn?: string;
  }>({ nome: "", descricao: "" });
  const [imagemSubindo, setImagemSubindo] = useState("");
  const [novaImagemUrl, setNovaImagemUrl] = useState("");
  const [metricas, setMetricas] = useState<MetricasCatalogo>();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await carregarCatalogoAdministrativo(lojaId, produtos);
      setCatalogo(data.catalogo || catalogoInicial(lojaId));
      setCategorias(data.categorias);
      setItens(data.produtos);
      setMetricas(undefined);
      if (data.catalogo?.id) {
        void carregarMetricasCatalogo(data.catalogo.id)
          .then(setMetricas)
          .catch(() => setMetricas(undefined));
      }
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o catálogo.",
      );
    } finally {
      setCarregando(false);
    }
  }, [lojaId, produtos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const quantidades = useMemo(
    () => ({
      visiveis: itens.filter((item) => item.config.visivel).length,
      destaques: itens.filter(
        (item) => item.config.visivel && item.config.destaque,
      ).length,
      semEstoque: itens.filter((item) => {
        const origem = produtos.find(
          (produto) => produto.id === item.produto.produtoEstoqueOrigemId,
        );
        const disponivel = origem
          ? origem.estoque * (item.produto.unidadesPorEstoqueOrigem || 1)
          : item.produto.estoque;
        return item.config.visivel && disponivel <= 0;
      }).length,
    }),
    [itens, produtos],
  );

  const filtrados = useMemo(
    () =>
      itens.filter((item) => {
        const termo = busca.trim().toLowerCase();
        const origem = produtos.find(
          (produto) => produto.id === item.produto.produtoEstoqueOrigemId,
        );
        const estoque = origem
          ? origem.estoque * (item.produto.unidadesPorEstoqueOrigem || 1)
          : item.produto.estoque;
        return (
          (!termo ||
            `${item.produto.nome} ${item.produto.sku} ${item.produto.categoria || ""}`
              .toLowerCase()
              .includes(termo)) &&
          (filtro === "todos" ||
            (filtro === "visiveis" && item.config.visivel) ||
            (filtro === "ocultos" && !item.config.visivel) ||
            (filtro === "sem_estoque" && estoque <= 0))
        );
      }),
    [itens, busca, filtro, produtos],
  );

  const linkPublico = `${window.location.origin}/catalogo/${catalogo.slug || "sua-loja"}`;

  async function gravarCatalogo(status?: CatalogoTipo["status"]) {
    if (!catalogo.nome.trim())
      return toast("Informe o nome da loja.", "warning");
    const slug = slugDoCatalogo(catalogo.slug || catalogo.nome);
    if (slug.length < 3)
      return toast(
        "Escolha um endereço público com pelo menos 3 caracteres.",
        "warning",
      );
    if ((status || catalogo.status) === "publicado" && !quantidades.visiveis)
      return toast("Ative pelo menos um produto antes de publicar.", "warning");
    setSalvando(true);
    try {
      const salvo = await salvarCatalogo({
        ...catalogo,
        slug,
        status: status || catalogo.status,
      });
      setCatalogo(salvo);
      toast(
        status === "publicado"
          ? "Catálogo publicado."
          : "Configurações salvas.",
        "success",
      );
      if (!catalogo.id) await carregar();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não foi possível salvar.",
        "danger",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function alternarVisibilidade(item: ProdutoCatalogoAdmin) {
    if (!catalogo.id)
      return toast(
        "Salve a configuração da loja antes de publicar produtos.",
        "warning",
      );
    const config = {
      ...item.config,
      catalogoId: catalogo.id,
      lojaId,
      visivel: !item.config.visivel,
    };
    setItens((atual) =>
      atual.map((valor) =>
        valor.produto.id === item.produto.id ? { ...valor, config } : valor,
      ),
    );
    try {
      await salvarProdutoCatalogo(config);
    } catch (error) {
      setItens((atual) =>
        atual.map((valor) =>
          valor.produto.id === item.produto.id ? item : valor,
        ),
      );
      toast(
        error instanceof Error
          ? error.message
          : "Falha ao alterar visibilidade.",
        "danger",
      );
    }
  }

  async function gravarProduto(item: ProdutoCatalogoAdmin) {
    if (!catalogo.id) {
      return toast(
        "Salve primeiro o nome e o endereço da loja em Aparência e loja.",
        "warning",
      );
    }
    setSalvando(true);
    try {
      const config = { ...item.config, catalogoId: catalogo.id, lojaId };
      await salvarProdutoCatalogo(config);
      setItens((atual) =>
        atual.map((valor) =>
          valor.produto.id === item.produto.id ? { ...item, config } : valor,
        ),
      );
      setEditando(undefined);
      toast("Apresentação do produto atualizada.", "success");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o produto.",
        "danger",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarEmLote(visivel: boolean) {
    if (!catalogo.id || !selecionados.size) return;
    const alvos = itens
      .filter((item) => selecionados.has(item.produto.id))
      .map((item) => ({ ...item.config, catalogoId: catalogo.id!, lojaId }));
    setSalvando(true);
    try {
      await alterarVisibilidadeEmLote(alvos, visivel);
      setItens((atual) =>
        atual.map((item) =>
          selecionados.has(item.produto.id)
            ? { ...item, config: { ...item.config, visivel } }
            : item,
        ),
      );
      setSelecionados(new Set());
      toast(`${alvos.length} produto(s) atualizado(s).`, "success");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os produtos.",
        "danger",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function gravarCategoria() {
    if (!catalogo.id)
      return toast("Salve a loja antes de criar categorias.", "warning");
    if (!categoriaForm.nome.trim())
      return toast("Informe o nome da categoria.", "warning");
    setSalvando(true);
    try {
      const existente = categorias.find(
        (categoria) => categoria.id === categoriaForm.id,
      );
      await salvarCategoria({
        id: categoriaForm.id,
        catalogoId: catalogo.id,
        lojaId,
        nome: categoriaForm.nome,
        slug: slugDoCatalogo(categoriaForm.nome),
        descricao: categoriaForm.descricao,
        nomeEs: categoriaForm.nomeEs,
        nomeEn: categoriaForm.nomeEn,
        visivel: existente?.visivel ?? true,
        ordem: existente?.ordem ?? categorias.length,
      });
      setCategoriaForm({ nome: "", descricao: "" });
      await carregar();
      toast("Categoria salva.", "success");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a categoria.",
        "danger",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirCategoria(categoria: CatalogoCategoria) {
    if (
      !confirm(
        `Excluir a categoria “${categoria.nome}”? Os produtos continuarão no catálogo sem categoria.`,
      )
    )
      return;
    try {
      await removerCategoria(categoria.id);
      await carregar();
      toast("Categoria removida.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não foi possível remover.",
        "danger",
      );
    }
  }

  async function moverCategoria(categoria: CatalogoCategoria, direcao: -1 | 1) {
    const destino = categorias[categorias.indexOf(categoria) + direcao];
    if (!destino) return;
    try {
      await Promise.all([
        salvarCategoria({ ...categoria, ordem: destino.ordem }),
        salvarCategoria({ ...destino, ordem: categoria.ordem }),
      ]);
      await carregar();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não foi possível reordenar.",
        "danger",
      );
    }
  }

  async function subirImagem(
    tipo: "logo" | "banner" | "bannerMobile",
    arquivo?: File,
  ) {
    if (!arquivo) return;
    if (!catalogo.id)
      return toast(
        "Salve as configurações da loja antes de enviar imagens.",
        "warning",
      );
    setImagemSubindo(tipo);
    try {
      const path = await uploadImagemCatalogo(arquivo, lojaId, "identidade");
      const campo =
        tipo === "logo"
          ? "logoPath"
          : tipo === "banner"
            ? "bannerPath"
            : "bannerMobilePath";
      const proximo = { ...catalogo, [campo]: path };
      setCatalogo(proximo);
      await salvarCatalogo(proximo);
      toast("Imagem atualizada.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Falha no upload.",
        "danger",
      );
    } finally {
      setImagemSubindo("");
    }
  }

  async function adicionarImagemGaleria() {
    if (!catalogo.id || !editando) return;
    if (
      !referenciaImagemCatalogoValida(novaImagemUrl) ||
      !novaImagemUrl.trim()
    ) {
      return toast("Informe uma URL pública válida para a galeria.", "warning");
    }
    try {
      const salva = await salvarImagemProdutoCatalogo({
        catalogoId: catalogo.id,
        lojaId,
        produtoId: editando.produto.id,
        storagePath: novaImagemUrl.trim(),
        textoAlternativo: editando.config.nomePublico || editando.produto.nome,
        ordem: editando.config.imagens?.length || 0,
      });
      setEditando((item) =>
        item
          ? {
              ...item,
              config: {
                ...item.config,
                imagens: [...(item.config.imagens || []), salva],
              },
            }
          : item,
      );
      setNovaImagemUrl("");
      toast("Imagem adicionada à galeria.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Falha ao adicionar imagem.",
        "danger",
      );
    }
  }

  async function excluirImagemGaleria(id: string) {
    try {
      await removerImagemProdutoCatalogo(id);
      setEditando((item) =>
        item
          ? {
              ...item,
              config: {
                ...item.config,
                imagens: (item.config.imagens || []).filter(
                  (imagem) => imagem.id !== id,
                ),
              },
            }
          : item,
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Falha ao remover imagem.",
        "danger",
      );
    }
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(linkPublico);
    toast("Link copiado.", "success");
  }

  if (carregando)
    return (
      <div className="grid min-h-72 place-items-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  if (erro)
    return (
      <div className="mx-auto max-w-xl card-adega p-7 text-center">
        <LayoutGrid className="mx-auto text-destructive" />
        <h2 className="mt-3 font-bold">Catálogo indisponível</h2>
        <p className="mt-2 text-sm text-muted-foreground">{erro}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Aplique a migration do Catálogo Virtual no Supabase.
        </p>
        <button
          onClick={() => void carregar()}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/15 text-cyan-600">
              <LayoutGrid size={20} />
            </span>
            <div>
              <h2 className="text-xl font-bold">Catálogo Virtual</h2>
              <p className="text-sm text-muted-foreground">
                Sua vitrine online conectada ao estoque do Órbita.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalogo.id && (
            <>
              <button
                onClick={() => void copiarLink()}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
              >
                <Copy size={15} /> Copiar link
              </button>
              <a
                href={linkPublico}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
              >
                <ExternalLink size={15} /> Abrir vitrine
              </a>
            </>
          )}
          <button
            disabled={salvando}
            onClick={() =>
              void gravarCatalogo(
                catalogo.status === "publicado" ? "pausado" : "publicado",
              )
            }
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${catalogo.status === "publicado" ? "bg-amber-600" : "bg-emerald-600"}`}
          >
            {catalogo.status === "publicado" ? (
              <EyeOff size={16} />
            ) : (
              <Eye size={16} />
            )}
            {catalogo.status === "publicado"
              ? "Pausar catálogo"
              : "Publicar catálogo"}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-adega p-4">
          <p className="text-xs font-semibold text-muted-foreground">Status</p>
          <p
            className={`mt-1 text-xl font-bold capitalize ${catalogo.status === "publicado" ? "text-emerald-600" : catalogo.status === "pausado" ? "text-amber-600" : ""}`}
          >
            {catalogo.status}
          </p>
        </div>
        <div className="card-adega p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            Produtos publicados
          </p>
          <p className="mt-1 text-xl font-bold">
            {quantidades.visiveis}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              de {itens.length}
            </span>
          </p>
        </div>
        <div className="card-adega p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            Destaques
          </p>
          <p className="mt-1 text-xl font-bold">{quantidades.destaques}</p>
        </div>
        <div className="card-adega p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            Publicados sem estoque
          </p>
          <p
            className={`mt-1 text-xl font-bold ${quantidades.semEstoque ? "text-amber-600" : "text-emerald-600"}`}
          >
            {quantidades.semEstoque}
          </p>
        </div>
      </div>

      {!catalogo.id && (
        <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] p-5">
          <div className="flex gap-3">
            <Sparkles className="shrink-0 text-cyan-600" />
            <div>
              <h3 className="font-bold">
                Prepare sua vitrine em poucos minutos
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina o nome e o endereço público abaixo, salve e escolha os
                produtos que seus clientes poderão ver.
              </p>
            </div>
          </div>
        </section>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
        {(
          [
            ["produtos", Package, "Produtos"],
            ["categorias", LayoutGrid, "Categorias"],
            ["aparencia", Palette, "Aparência e loja"],
            ["desempenho", BarChart3, "Desempenho"],
          ] as [Aba, typeof Package, string][]
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${aba === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {aba === "produtos" && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por produto, SKU ou categoria"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={filtro}
              onChange={(event) =>
                setFiltro(event.target.value as typeof filtro)
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="visiveis">Publicados</option>
              <option value="ocultos">Ocultos</option>
              <option value="sem_estoque">Sem estoque</option>
            </select>
          </div>
          {selecionados.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-3 text-sm">
              <strong>{selecionados.size} selecionado(s)</strong>
              <button
                onClick={() => void aplicarEmLote(true)}
                className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
              >
                Publicar
              </button>
              <button
                onClick={() => void aplicarEmLote(false)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 font-semibold"
              >
                Ocultar
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={
                        filtrados.length > 0 &&
                        filtrados.every((item) =>
                          selecionados.has(item.produto.id),
                        )
                      }
                      onChange={(event) =>
                        setSelecionados(
                          event.target.checked
                            ? new Set(filtrados.map((item) => item.produto.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Categoria pública</th>
                  <th className="p-3">Destaque</th>
                  <th className="p-3">Visibilidade</th>
                  <th className="p-3 text-right">Configurar</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((item) => {
                  const origem = produtos.find(
                    (produto) =>
                      produto.id === item.produto.produtoEstoqueOrigemId,
                  );
                  const estoque = origem
                    ? Math.floor(
                        origem.estoque *
                          (item.produto.unidadesPorEstoqueOrigem || 1),
                      )
                    : item.produto.estoque;
                  return (
                    <tr
                      key={item.produto.id}
                      className="border-t border-border"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selecionados.has(item.produto.id)}
                          onChange={() =>
                            setSelecionados((atual) => {
                              const proximo = new Set(atual);
                              if (proximo.has(item.produto.id)) {
                                proximo.delete(item.produto.id);
                              } else {
                                proximo.add(item.produto.id);
                              }
                              return proximo;
                            })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {item.config.imagemPrincipalPath ||
                          item.produto.imagem ? (
                            <img
                              src={
                                urlPublicaImagem(
                                  item.config.imagemPrincipalPath,
                                ) || item.produto.imagem
                              }
                              alt=""
                              className="h-11 w-11 rounded-lg bg-muted object-cover"
                            />
                          ) : (
                            <span className="grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground">
                              <Package size={18} />
                            </span>
                          )}
                          <div>
                            <strong className="block">
                              {item.config.nomePublico || item.produto.nome}
                            </strong>
                            <span className="text-xs text-muted-foreground">
                              {item.produto.sku} ·{" "}
                              {item.produto.categoria || "Sem categoria"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td
                        className={`p-3 font-semibold ${estoque <= 0 ? "text-destructive" : ""}`}
                      >
                        {estoque} un.
                        {origem && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            via {origem.nome}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {categorias.find(
                          (categoria) =>
                            categoria.id === item.config.categoriaId,
                        )?.nome || "—"}
                      </td>
                      <td className="p-3">
                        {item.config.destaque ? (
                          <Sparkles size={17} className="text-amber-500" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => void alternarVisibilidade(item)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${item.config.visivel ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/15 text-slate-600 dark:text-slate-300"}`}
                        >
                          {item.config.visivel ? (
                            <Eye size={13} />
                          ) : (
                            <EyeOff size={13} />
                          )}
                          {item.config.visivel ? "Publicado" : "Oculto"}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() =>
                            setEditando({
                              produto: item.produto,
                              config: { ...item.config },
                            })
                          }
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                        >
                          <Settings2 size={14} className="mr-1 inline" />
                          Editar vitrine
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtrados.length && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </div>
          )}
        </section>
      )}

      {aba === "categorias" && (
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <section className="card-adega h-fit space-y-4 p-5">
            <div>
              <h3 className="font-bold">
                {categoriaForm.id ? "Editar categoria" : "Nova categoria"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Organize a navegação que o cliente verá.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                NOME
              </label>
              <input
                value={categoriaForm.nome}
                onChange={(event) =>
                  setCategoriaForm((form) => ({
                    ...form,
                    nome: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                placeholder="Ex.: Doses e drinks"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                DESCRIÇÃO
              </label>
              <textarea
                value={categoriaForm.descricao}
                onChange={(event) =>
                  setCategoriaForm((form) => ({
                    ...form,
                    descricao: event.target.value,
                  }))
                }
                className="min-h-24 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                NOME EM ESPANHOL
                <input
                  value={categoriaForm.nomeEs || ""}
                  onChange={(event) =>
                    setCategoriaForm((form) => ({
                      ...form,
                      nomeEs: event.target.value,
                    }))
                  }
                  placeholder={categoriaForm.nome || "Categoría"}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                NOME EM INGLÊS
                <input
                  value={categoriaForm.nomeEn || ""}
                  onChange={(event) =>
                    setCategoriaForm((form) => ({
                      ...form,
                      nomeEn: event.target.value,
                    }))
                  }
                  placeholder={categoriaForm.nome || "Category"}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                disabled={salvando}
                onClick={() => void gravarCategoria()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                <Plus size={16} />
                {categoriaForm.id ? "Salvar" : "Adicionar"}
              </button>
              {categoriaForm.id && (
                <button
                  onClick={() => setCategoriaForm({ nome: "", descricao: "" })}
                  className="rounded-lg border border-border px-3"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h3 className="font-bold">Categorias da vitrine</h3>
            </div>
            {categorias.length ? (
              <div>
                {categorias.map((categoria, index) => (
                  <div
                    key={categoria.id}
                    className="flex items-center gap-3 border-b border-border p-4 last:border-0"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 font-bold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong>{categoria.nome}</strong>
                      <p className="truncate text-xs text-muted-foreground">
                        {categoria.descricao || `/${categoria.slug}`}
                      </p>
                    </div>
                    <button
                      disabled={index === 0}
                      onClick={() => void moverCategoria(categoria, -1)}
                      className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      disabled={index === categorias.length - 1}
                      onClick={() => void moverCategoria(categoria, 1)}
                      className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      onClick={() =>
                        setCategoriaForm({
                          id: categoria.id,
                          nome: categoria.nome,
                          descricao: categoria.descricao || "",
                          nomeEs: categoria.nomeEs,
                          nomeEn: categoria.nomeEn,
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void excluirCategoria(categoria)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-14 text-center text-sm text-muted-foreground">
                Crie categorias para facilitar a navegação.
              </div>
            )}
          </section>
        </div>
      )}

      {aba === "aparencia" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_460px]">
          <section className="card-adega space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  NOME DA LOJA
                </label>
                <input
                  value={catalogo.nome}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      nome: event.target.value,
                      ...(!valor.id && !valor.slug
                        ? { slug: slugDoCatalogo(event.target.value) }
                        : {}),
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  ENDEREÇO PÚBLICO
                </label>
                <div className="flex rounded-lg border border-border bg-background">
                  <span className="grid place-items-center border-r border-border px-3 text-muted-foreground">
                    <Link2 size={15} />
                  </span>
                  <input
                    value={catalogo.slug}
                    onChange={(event) =>
                      setCatalogo((valor) => ({
                        ...valor,
                        slug: slugDoCatalogo(event.target.value),
                      }))
                    }
                    className="min-w-0 flex-1 bg-transparent p-2.5 text-sm outline-none"
                    placeholder="minha-loja"
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {linkPublico}
                </p>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                APRESENTAÇÃO
              </label>
              <textarea
                value={catalogo.descricao || ""}
                onChange={(event) =>
                  setCatalogo((valor) => ({
                    ...valor,
                    descricao: event.target.value,
                  }))
                }
                maxLength={1000}
                className="min-h-24 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                placeholder="Conte aos clientes o que sua loja oferece."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  WHATSAPP COM DDD E PAÍS
                </label>
                <input
                  value={catalogo.telefoneWhatsapp || ""}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      telefoneWhatsapp: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  placeholder="5511999999999"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  EXIBIÇÃO DO ESTOQUE
                </label>
                <select
                  value={catalogo.modoEstoque}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      modoEstoque: event.target
                        .value as CatalogoTipo["modoEstoque"],
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                >
                  <option value="oculto">Não mostrar</option>
                  <option value="status">Mostrar situação</option>
                  <option value="quantidade">Mostrar quantidade</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={catalogo.mostrarPrecos}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      mostrarPrecos: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong className="block text-sm">Mostrar preços</strong>
                  <span className="text-xs text-muted-foreground">
                    Exibe o valor de venda ao cliente.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={catalogo.novosProdutosVisiveis}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      novosProdutosVisiveis: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong className="block text-sm">
                    Publicar produtos novos
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    Recomendamos manter desativado.
                  </span>
                </span>
              </label>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-4 flex items-center gap-2">
                <Languages size={18} className="text-primary" />
                <div>
                  <h3 className="text-sm font-bold">Idiomas do catálogo</h3>
                  <p className="text-xs text-muted-foreground">
                    A interface muda de idioma; traduções vazias usam o
                    português.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  IDIOMA PADRÃO
                  <select
                    value={catalogo.idiomaPadrao}
                    onChange={(event) => {
                      const idioma = event.target.value as IdiomaCatalogo;
                      setCatalogo((valor) => ({
                        ...valor,
                        idiomaPadrao: idioma,
                        idiomasAtivos: valor.idiomasAtivos.includes(idioma)
                          ? valor.idiomasAtivos
                          : [...valor.idiomasAtivos, idioma],
                      }));
                    }}
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    IDIOMAS DISPONÍVEIS
                  </span>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {(
                      [
                        ["pt-BR", "Português"],
                        ["es", "Español"],
                        ["en", "English"],
                      ] as [IdiomaCatalogo, string][]
                    ).map(([id, nome]) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={catalogo.idiomasAtivos.includes(id)}
                          disabled={catalogo.idiomaPadrao === id}
                          onChange={(event) =>
                            setCatalogo((valor) => ({
                              ...valor,
                              idiomasAtivos: event.target.checked
                                ? [...new Set([...valor.idiomasAtivos, id])]
                                : valor.idiomasAtivos.filter(
                                    (item) => item !== id,
                                  ),
                            }))
                          }
                        />
                        {nome}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold">
                Pedidos, entrega e atendimento
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-muted-foreground">
                  PEDIDO MÍNIMO
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={catalogo.pedidoMinimo}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        pedidoMinimo: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  TAXA DE ENTREGA
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={catalogo.taxaEntrega}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        taxaEntrega: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  LIMITE “ÚLTIMAS UNIDADES”
                  <input
                    type="number"
                    min={0}
                    value={catalogo.limiteEstoqueBaixo}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        limiteEstoqueBaixo: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  ABERTURA
                  <input
                    type="time"
                    value={catalogo.horarioAbertura || ""}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        horarioAbertura: e.target.value || undefined,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  FECHAMENTO
                  <input
                    type="time"
                    value={catalogo.horarioFechamento || ""}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        horarioFechamento: e.target.value || undefined,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  PRAZO DE ENTREGA (MIN–MÁX)
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={catalogo.prazoEntregaMin ?? ""}
                      onChange={(e) =>
                        setCatalogo((v) => ({
                          ...v,
                          prazoEntregaMin:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                    />
                    <input
                      type="number"
                      min={0}
                      value={catalogo.prazoEntregaMax ?? ""}
                      onChange={(e) =>
                        setCatalogo((v) => ({
                          ...v,
                          prazoEntregaMax:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                    />
                  </div>
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  REGIÕES DE ENTREGA (SEPARADAS POR VÍRGULA)
                  <input
                    value={catalogo.regioesEntrega.join(", ")}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        regioesEntrega: e.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                    placeholder="Centro, Zona Sul"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  MENSAGEM FORA DO HORÁRIO
                  <input
                    value={catalogo.mensagemFechado || ""}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        mensagemFechado: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm font-normal"
                    placeholder="Estamos fechados, mas você pode montar seu pedido."
                  />
                </label>
              </div>
              <div className="mt-4">
                <span className="text-xs font-semibold text-muted-foreground">
                  FORMAS DE PAGAMENTO
                </span>
                <div className="mt-2 flex flex-wrap gap-3">
                  {[
                    ["pix", "PIX"],
                    ["dinheiro", "Dinheiro"],
                    ["cartao", "Cartão"],
                    ["fiado", "Fiado"],
                  ].map(([id, nome]) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={catalogo.formasPagamento.includes(id)}
                        onChange={(e) =>
                          setCatalogo((v) => ({
                            ...v,
                            formasPagamento: e.target.checked
                              ? [...new Set([...v.formasPagamento, id])]
                              : v.formasPagamento.filter((item) => item !== id),
                          }))
                        }
                      />
                      {nome}
                    </label>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={catalogo.mostrarOfertas}
                  onChange={(e) =>
                    setCatalogo((v) => ({
                      ...v,
                      mostrarOfertas: e.target.checked,
                    }))
                  }
                />
                Exibir ofertas ativas automaticamente
              </label>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold">SEO e compartilhamento</h3>
              <div className="mt-3 grid gap-3">
                <input
                  value={catalogo.seoTitulo || ""}
                  onChange={(e) =>
                    setCatalogo((v) => ({ ...v, seoTitulo: e.target.value }))
                  }
                  maxLength={70}
                  placeholder="Título para Google e compartilhamentos"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
                <textarea
                  value={catalogo.seoDescricao || ""}
                  onChange={(e) =>
                    setCatalogo((v) => ({ ...v, seoDescricao: e.target.value }))
                  }
                  maxLength={160}
                  placeholder="Descrição curta do catálogo"
                  className="min-h-20 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={catalogo.instagramUrl || ""}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        instagramUrl: e.target.value,
                      }))
                    }
                    placeholder="URL do Instagram"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                  <input
                    value={catalogo.dominioPersonalizado || ""}
                    onChange={(e) =>
                      setCatalogo((v) => ({
                        ...v,
                        dominioPersonalizado: e.target.value,
                      }))
                    }
                    placeholder="catalogo.sualoja.com.br (requer DNS)"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="rounded-xl border border-dashed border-border p-4">
                <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                  LOGO
                </span>
                {catalogo.logoPath && (
                  <img
                    src={urlPublicaImagem(catalogo.logoPath)}
                    alt="Logo"
                    className="mb-3 h-20 w-20 rounded-xl object-cover"
                  />
                )}
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                  <ImagePlus size={16} />
                  {imagemSubindo === "logo" ? "Enviando…" : "Escolher logo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void subirImagem("logo", event.target.files?.[0])
                    }
                  />
                </span>
              </label>
              <label className="rounded-xl border border-dashed border-border p-4">
                <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                  BANNER
                </span>
                {catalogo.bannerPath && (
                  <img
                    src={urlPublicaImagem(catalogo.bannerPath)}
                    alt="Banner"
                    className="mb-3 h-20 w-full rounded-xl object-cover"
                  />
                )}
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                  <ImagePlus size={16} />
                  {imagemSubindo === "banner" ? "Enviando…" : "Escolher banner"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void subirImagem("banner", event.target.files?.[0])
                    }
                  />
                </span>
              </label>
              <label className="rounded-xl border border-dashed border-border p-4 md:col-span-2">
                <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                  BANNER PARA CELULAR
                </span>
                {catalogo.bannerMobilePath && (
                  <img
                    src={urlPublicaImagem(catalogo.bannerMobilePath)}
                    alt="Banner para celular"
                    className="mb-3 h-28 w-full rounded-xl object-cover"
                  />
                )}
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                  <ImagePlus size={16} />
                  {imagemSubindo === "bannerMobile"
                    ? "Enviando…"
                    : "Escolher banner mobile"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void subirImagem("bannerMobile", event.target.files?.[0])
                    }
                  />
                </span>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                COR PRINCIPAL
                <input
                  type="color"
                  value={catalogo.corPrimaria}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      corPrimaria: event.target.value,
                    }))
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-background p-1"
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                COR SECUNDÁRIA
                <input
                  type="color"
                  value={catalogo.corSecundaria}
                  onChange={(event) =>
                    setCatalogo((valor) => ({
                      ...valor,
                      corSecundaria: event.target.value,
                    }))
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-background p-1"
                />
              </label>
            </div>
            <button
              disabled={salvando}
              onClick={() => void gravarCatalogo()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Save size={17} />
              )}
              Salvar configurações
            </button>
          </section>
          <aside className="h-fit overflow-hidden rounded-3xl border border-border bg-background shadow-xl">
            <div
              className="relative min-h-40 p-6 text-white"
              style={{
                background: `linear-gradient(135deg, ${catalogo.corSecundaria}, ${catalogo.corPrimaria})`,
              }}
            >
              {catalogo.bannerPath && (
                <img
                  src={urlPublicaImagem(catalogo.bannerPath)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-25"
                />
              )}
              <div className="relative flex items-center gap-3">
                {catalogo.logoPath ? (
                  <img
                    src={urlPublicaImagem(catalogo.logoPath)}
                    alt=""
                    className="h-16 w-16 rounded-xl bg-white object-cover"
                  />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-xl bg-white/20">
                    <Package />
                  </span>
                )}
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/70">
                    Prévia
                  </p>
                  <h3 className="text-2xl font-black">
                    {catalogo.nome || "Sua loja"}
                  </h3>
                </div>
              </div>
              <p className="relative mt-3 line-clamp-2 text-sm text-white/80">
                {catalogo.descricao ||
                  "A apresentação da sua loja aparecerá aqui."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {itens
                .filter((item) => item.config.visivel)
                .slice(0, 4)
                .map((item) => (
                  <div
                    key={item.produto.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="aspect-square bg-muted">
                      {item.config.imagemPrincipalPath ||
                      item.produto.imagem ? (
                        <img
                          src={
                            urlPublicaImagem(item.config.imagemPrincipalPath) ||
                            item.produto.imagem
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <Package />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-1 text-xs font-bold">
                        {item.config.nomePublico || item.produto.nome}
                      </p>
                      {catalogo.mostrarPrecos && (
                        <p
                          className="mt-1 text-sm font-black"
                          style={{ color: catalogo.corPrimaria }}
                        >
                          R${" "}
                          {(item.config.precoPublico ?? item.produto.precoVenda)
                            .toFixed(2)
                            .replace(".", ",")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              {!quantidades.visiveis && (
                <div className="col-span-2 py-10 text-center text-xs text-muted-foreground">
                  Publique produtos para completar a prévia.
                </div>
              )}
            </div>
            {catalogo.id && (
              <div className="flex items-center gap-4 border-t border-border p-4">
                <QRCodeSVG
                  value={linkPublico}
                  size={84}
                  level="M"
                  marginSize={1}
                />
                <div>
                  <p className="text-sm font-bold">QR Code da vitrine</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Baixe por impressão do navegador ou mostre este código no
                    balcão.
                  </p>
                  <button
                    onClick={() => void copiarLink()}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    Copiar link público
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {aba === "desempenho" && (
        <div className="space-y-5">
          {!catalogo.id ? (
            <div className="card-adega p-10 text-center text-sm text-muted-foreground">
              Salve e publique o catálogo para começar a medir visitas e
              conversões.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Visitas",
                    metricas?.visitas || 0,
                    `${metricas?.visitantes || 0} visitantes`,
                  ],
                  [
                    "Produtos visualizados",
                    metricas?.visualizacoesProdutos || 0,
                    "Aberturas de detalhes",
                  ],
                  [
                    "Adições ao carrinho",
                    metricas?.adicoesCarrinho || 0,
                    "Intenção de compra",
                  ],
                  [
                    "Pedidos no WhatsApp",
                    metricas?.cliquesWhatsapp || 0,
                    `${metricas?.conversaoWhatsapp || 0}% de conversão`,
                  ],
                ].map(([titulo, valor, detalhe]) => (
                  <div key={titulo} className="card-adega p-5">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {titulo}
                    </p>
                    <p className="mt-1 text-2xl font-black">{valor}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detalhe}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="card-adega p-5">
                  <h3 className="font-bold">Produtos mais visualizados</h3>
                  <div className="mt-4 space-y-3">
                    {metricas?.produtosMaisVistos?.length ? (
                      metricas.produtosMaisVistos.map((ranking, index) => {
                        const produto = produtos.find(
                          (item) => item.id === ranking.produtoId,
                        );
                        return (
                          <div
                            key={ranking.produtoId}
                            className="flex items-center gap-3"
                          >
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {produto?.nome || "Produto removido"}
                            </span>
                            <strong className="text-sm">{ranking.total}</strong>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Ainda não há visualizações registradas.
                      </p>
                    )}
                  </div>
                </section>
                <section className="card-adega p-5">
                  <h3 className="font-bold">Funil comercial</h3>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Visitas", metricas?.visitas || 0],
                      ["Visualizações", metricas?.visualizacoesProdutos || 0],
                      ["Carrinho", metricas?.adicoesCarrinho || 0],
                      ["WhatsApp", metricas?.cliquesWhatsapp || 0],
                    ].map(([nome, total], _index, lista) => {
                      const max = Number(lista[0][1]) || 1;
                      return (
                        <div key={nome}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{nome}</span>
                            <strong>{total}</strong>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.max(Number(total) ? 4 : 0, Math.min(100, (Number(total) / max) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
              <p className="text-xs text-muted-foreground">
                Período: últimos {metricas?.periodoDias || 30} dias. Métricas
                não impedem a navegação quando estiverem indisponíveis.
              </p>
            </>
          )}
        </div>
      )}

      {editando && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setEditando(undefined)}
        >
          <div
            className="card-adega max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Apresentação pública
                </p>
                <h3 className="text-xl font-bold">{editando.produto.nome}</h3>
              </div>
              <button onClick={() => setEditando(undefined)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  NOME NO CATÁLOGO
                </label>
                <input
                  value={editando.config.nomePublico || ""}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            nomePublico: event.target.value,
                          },
                        },
                    )
                  }
                  placeholder={editando.produto.nome}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  PREÇO ESPECÍFICO
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editando.config.precoPublico ?? ""}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            precoPublico:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          },
                        },
                    )
                  }
                  placeholder={String(editando.produto.precoVenda)}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  CATEGORIA PÚBLICA
                </label>
                <select
                  value={editando.config.categoriaId || ""}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            categoriaId: event.target.value || undefined,
                          },
                        },
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  ORDEM
                </label>
                <input
                  type="number"
                  min={0}
                  value={editando.config.ordem}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            ordem: Math.max(0, Number(event.target.value)),
                          },
                        },
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                DESCRIÇÃO PÚBLICA
              </label>
              <textarea
                value={editando.config.descricaoPublica || ""}
                onChange={(event) =>
                  setEditando(
                    (item) =>
                      item && {
                        ...item,
                        config: {
                          ...item.config,
                          descricaoPublica: event.target.value,
                        },
                      },
                  )
                }
                placeholder={
                  editando.produto.descricao ||
                  "Descreva este produto para o cliente."
                }
                className="min-h-28 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
              />
            </div>
            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Languages size={17} className="text-primary" />
                <div>
                  <h4 className="text-sm font-bold">Traduções do produto</h4>
                  <p className="text-xs text-muted-foreground">
                    Campos vazios usam automaticamente o texto em português.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    ESPAÑOL
                  </label>
                  <input
                    value={editando.config.nomePublicoEs || ""}
                    onChange={(event) =>
                      setEditando(
                        (item) =>
                          item && {
                            ...item,
                            config: {
                              ...item.config,
                              nomePublicoEs: event.target.value,
                            },
                          },
                      )
                    }
                    placeholder="Nombre del producto"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                  <textarea
                    value={editando.config.descricaoPublicaEs || ""}
                    onChange={(event) =>
                      setEditando(
                        (item) =>
                          item && {
                            ...item,
                            config: {
                              ...item.config,
                              descricaoPublicaEs: event.target.value,
                            },
                          },
                      )
                    }
                    placeholder="Descripción en español"
                    className="min-h-20 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    ENGLISH
                  </label>
                  <input
                    value={editando.config.nomePublicoEn || ""}
                    onChange={(event) =>
                      setEditando(
                        (item) =>
                          item && {
                            ...item,
                            config: {
                              ...item.config,
                              nomePublicoEn: event.target.value,
                            },
                          },
                      )
                    }
                    placeholder="Product name"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                  <textarea
                    value={editando.config.descricaoPublicaEn || ""}
                    onChange={(event) =>
                      setEditando(
                        (item) =>
                          item && {
                            ...item,
                            config: {
                              ...item.config,
                              descricaoPublicaEn: event.target.value,
                            },
                          },
                      )
                    }
                    placeholder="Description in English"
                    className="min-h-20 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={editando.config.visivel}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            visivel: event.target.checked,
                          },
                        },
                    )
                  }
                />
                Publicado
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={editando.config.destaque}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            destaque: event.target.checked,
                          },
                        },
                    )
                  }
                />
                Destaque
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={editando.config.exibirSemEstoque}
                  onChange={(event) =>
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: {
                            ...item.config,
                            exibirSemEstoque: event.target.checked,
                          },
                        },
                    )
                  }
                />
                Exibir sem estoque
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="grid gap-4 sm:grid-cols-[112px_1fr] sm:items-start">
                <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                  {editando.config.imagemPrincipalPath ||
                  editando.produto.imagem ? (
                    <img
                      src={
                        urlPublicaImagem(editando.config.imagemPrincipalPath) ||
                        editando.produto.imagem
                      }
                      alt={`Prévia de ${editando.config.nomePublico || editando.produto.nome}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-muted-foreground">
                      <ImagePlus size={28} />
                    </span>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    URL DA IMAGEM
                  </label>
                  <input
                    type="url"
                    value={editando.config.imagemPrincipalPath || ""}
                    onChange={(event) =>
                      setEditando(
                        (item) =>
                          item && {
                            ...item,
                            config: {
                              ...item.config,
                              imagemPrincipalPath:
                                event.target.value.trim() || undefined,
                            },
                          },
                      )
                    }
                    placeholder="https://exemplo.com/imagem-do-produto.jpg"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                  />
                  {editando.config.imagemPrincipalPath &&
                    !referenciaImagemCatalogoValida(
                      editando.config.imagemPrincipalPath,
                    ) && (
                      <p className="mt-1 text-xs font-medium text-destructive">
                        Use uma URL completa começando com http:// ou https://.
                      </p>
                    )}
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    Cole uma imagem pública ou envie um arquivo abaixo. O envio
                    substitui a URL.
                  </p>
                  {editando.config.imagemPrincipalPath && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditando((item) =>
                          item
                            ? {
                                ...item,
                                config: {
                                  ...item.config,
                                  imagemPrincipalPath: undefined,
                                },
                              }
                            : item,
                        )
                      }
                      className="mt-2 text-xs font-semibold text-destructive hover:underline"
                    >
                      Remover imagem exclusiva
                    </button>
                  )}
                </div>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm font-semibold">
              <ImagePlus size={17} />
              {imagemSubindo === editando.produto.id
                ? "Enviando imagem…"
                : "Enviar imagem do computador"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (event) => {
                  const arquivo = event.target.files?.[0];
                  if (!arquivo) return;
                  if (!catalogo.id) {
                    toast(
                      "Salve primeiro as configurações da loja antes de enviar imagens.",
                      "warning",
                    );
                    event.target.value = "";
                    return;
                  }
                  setImagemSubindo(editando.produto.id);
                  try {
                    const path = await uploadImagemCatalogo(
                      arquivo,
                      lojaId,
                      `produtos/${editando.produto.id}`,
                    );
                    setEditando(
                      (item) =>
                        item && {
                          ...item,
                          config: { ...item.config, imagemPrincipalPath: path },
                        },
                    );
                  } catch (error) {
                    toast(
                      error instanceof Error
                        ? error.message
                        : "Falha no upload.",
                      "danger",
                    );
                  } finally {
                    setImagemSubindo("");
                  }
                }}
              />
            </label>
            <div className="mt-4 rounded-xl border border-border p-4">
              <h4 className="text-sm font-bold">Galeria de imagens</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Adicione outros ângulos ou apresentações do produto por URL.
              </p>
              {!!editando.config.imagens?.length && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {editando.config.imagens.map((imagem) => (
                    <div
                      key={imagem.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      <img
                        src={urlPublicaImagem(imagem.storagePath)}
                        alt={imagem.textoAlternativo || ""}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void excluirImagemGaleria(imagem.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                        aria-label="Remover imagem"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  type="url"
                  value={novaImagemUrl}
                  onChange={(event) => setNovaImagemUrl(event.target.value)}
                  placeholder="https://exemplo.com/outra-imagem.jpg"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void adicionarImagemGaleria()}
                  className="rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
                >
                  Adicionar
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditando(undefined)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={
                  salvando ||
                  !referenciaImagemCatalogoValida(
                    editando.config.imagemPrincipalPath,
                  )
                }
                onClick={() => void gravarProduto(editando)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Check size={16} />
                Salvar produto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
