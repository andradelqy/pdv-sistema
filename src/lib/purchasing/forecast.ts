// src/lib/purchasing/forecast.ts
import type { Venda, Produto } from '../store';

export function calcularDemanda(
  produto: Produto,
  vendas: Venda[],
  janelaDias: number = 30
): number {
  const agora = new Date();
  const corte = new Date();
  corte.setDate(agora.getDate() - janelaDias);

  const vendasFiltradas = vendas.filter(v => new Date(v.criadoEm) >= corte);

  // Requisito #7: Considerar apenas dias onde o produto esteve disponível para venda
  // Simplificação: Se houver venda, o produto estava disponível.
  const diasComVenda = new Set(vendasFiltradas
    .filter(v => v.itens.some(i => i.produtoId === produto.id))
    .map(v => v.data));
  const diasAtivos = Math.max(diasComVenda.size, 1);

  const totalVendido = vendasFiltradas.reduce((acc, v) =>
    acc + (v.itens.find(i => i.produtoId === produto.id)?.quantidade || 0), 0
  );

  return totalVendido / diasAtivos;
}

