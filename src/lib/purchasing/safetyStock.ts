// src/lib/purchasing/safetyStock.ts
import type { Produto, Venda, PedidoCompra } from '../store';
import { calcularDemanda } from './forecast';
import { getSupplierMetric } from './suppliers';

export function sugerirEstoqueMinimo(
  produto: Produto,
  vendas: Venda[],
  pedidosHistorico: PedidoCompra[]
): number {
  const giroDiario = calcularDemanda(produto, vendas);
  const supplier = getSupplierMetric(produto.fornecedor || 'default', pedidosHistorico);

  const fatorRisco = (produto.qualidade || 3) * 0.6;
  const leadTime = supplier.avgLeadTime;

  const estoqueMinimo = Math.ceil((giroDiario * leadTime) + (Math.sqrt(leadTime) * giroDiario * fatorRisco));

  return Math.max(1, estoqueMinimo);
}
