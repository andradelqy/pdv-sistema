import { describe, expect, it } from "vitest";
import {
  linkWhatsAppCatalogo,
  linkPedidoWhatsAppCatalogo,
  montarProdutosParaCatalogo,
  referenciaImagemCatalogoValida,
  slugDoCatalogo,
} from "./catalogo";

describe("catálogo virtual", () => {
  it("gera um slug público seguro e previsível", () => {
    expect(slugDoCatalogo("  Adega São João! ")).toBe("adega-sao-joao");
  });

  it("gera CTA do WhatsApp sem expor texto cru na URL", () => {
    const url = linkWhatsAppCatalogo(
      "55 (11) 99999-9999",
      {
        id: "1",
        nome: "Dose Limão",
        destaque: false,
        ordem: 0,
        imagensUrls: [],
        disponibilidade: "disponivel",
      },
      "Órbita Adega",
    );
    expect(url).toContain("https://wa.me/5511999999999?text=");
    expect(url).not.toContain("Dose Limão");
  });

  it("monta um único pedido com itens, quantidades, entrega e total", () => {
    const url = linkPedidoWhatsAppCatalogo(
      "5511999999999",
      "Adega",
      [
        { produto: { id: "p1", nome: "Água", preco: 5 }, quantidade: 2 },
        { produto: { id: "p2", nome: "Gelo", preco: 7 }, quantidade: 1 },
      ],
      3,
      "pt-BR",
    );
    const mensagem = decodeURIComponent(url!.split("text=")[1]);
    expect(mensagem).toContain("2x Água");
    expect(mensagem).toContain("R$ 20,00");
  });

  it("mostra o estoque na gestão antes da primeira configuração do catálogo", () => {
    const produtos = montarProdutosParaCatalogo(
      [
        {
          id: "p1",
          sku: "001",
          nome: "Produto existente",
          leadTime: 7,
          precoCompra: 5,
          precoVenda: 10,
          imposto: 0,
          frete: 0,
          comissao: 0,
          margemAlvo: 30,
          estoque: 8,
          estoqueMin: 1,
          pontoPedido: 2,
          qualidade: 3,
        },
      ],
      "loja-a",
    );
    expect(produtos).toHaveLength(1);
    expect(produtos[0].config).toMatchObject({
      catalogoId: "",
      lojaId: "loja-a",
      visivel: false,
    });
  });

  it("aceita somente caminhos internos ou URLs HTTP de imagem válidas", () => {
    expect(referenciaImagemCatalogoValida("loja/produtos/foto.webp")).toBe(
      true,
    );
    expect(
      referenciaImagemCatalogoValida("https://cdn.exemplo.com/foto.jpg"),
    ).toBe(true);
    expect(referenciaImagemCatalogoValida("javascript:alert(1)")).toBe(false);
    expect(referenciaImagemCatalogoValida("site sem url")).toBe(false);
  });
});
