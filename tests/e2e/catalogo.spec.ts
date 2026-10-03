import { expect, test } from "@playwright/test";

const produto = (idioma: string) => ({
  id: "produto-1",
  nome:
    idioma === "es"
      ? "Agua mineral"
      : idioma === "en"
        ? "Mineral water"
        : "Água mineral",
  descricao:
    idioma === "es"
      ? "Botella fría"
      : idioma === "en"
        ? "Cold bottle"
        : "Garrafa gelada",
  preco: 5,
  imagensUrls: [],
  destaque: true,
  ordem: 0,
  disponibilidade: "disponivel",
  quantidadeDisponivel: 8,
});

test("catálogo troca idioma, monta carrinho e respeita pedido mínimo", async ({
  page,
}) => {
  await page.route("**/functions/v1/catalogo-publico**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: '{"recebido":true}',
      });
      return;
    }
    const idioma =
      new URL(route.request().url()).searchParams.get("lang") || "pt-BR";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        loja: {
          nome: "Loja E2E",
          slug: "loja-e2e",
          corPrimaria: "#0891b2",
          corSecundaria: "#0b2545",
          telefoneWhatsapp: "5511999999999",
          mostrarPrecos: true,
          modoEstoque: "quantidade",
          idiomaPadrao: "pt-BR",
          idiomasAtivos: ["pt-BR", "es", "en"],
          pedidoMinimo: 15,
          taxaEntrega: 3,
          regioesEntrega: ["Centro"],
          formasPagamento: ["pix"],
          diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
          aberto: true,
        },
        categorias: [],
        produtos: [produto(idioma)],
        idioma,
        atualizadoEm: new Date().toISOString(),
      }),
    });
  });

  await page.goto("/catalogo/loja-e2e");
  await expect(page.getByRole("heading", { name: "Loja E2E" })).toBeVisible();
  await expect(
    page.getByText("Água mineral", { exact: true }).first(),
  ).toBeVisible();

  await page.getByLabel("Idioma").selectOption("es");
  await expect(
    page.getByText("Agua mineral", { exact: true }).first(),
  ).toBeVisible();
  const adicionar = page
    .getByRole("button", { name: "Agregar Agua mineral" })
    .first();
  await adicionar.click();
  await adicionar.click();
  await adicionar.click();
  await page.getByRole("button", { name: /Ver carrito/ }).click();
  await expect(page.getByRole("heading", { name: "Tu pedido" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar pedido por WhatsApp" }),
  ).toBeEnabled();
  await expect(page.getByText(/18,00\s*BRL/).last()).toBeVisible();
  await page.getByRole("button", { name: /Seguir comprando/ }).click();
  await expect(page.getByPlaceholder("Buscar productos…")).toBeVisible();
});
