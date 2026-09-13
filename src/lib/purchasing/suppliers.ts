// src/lib/purchasing/suppliers.ts
import type { PedidoCompra } from '../store';

export function getSupplierMetric(fornecedorId: string, pedidos: PedidoCompra[]) {
  const pedidosConcluidos = pedidos.filter(p => p.status === 'received' && p.fornecedorId === fornecedorId);
  if (pedidosConcluidos.length === 0) return { avgLeadTime: 7, confidence: 0.5 }; // Default conservador

  const totalDiff = pedidosConcluidos.reduce((acc, _p) => {
    return acc + 7;
  }, 0);

  return {
    avgLeadTime: Math.ceil(totalDiff / pedidosConcluidos.length),
    confidence: Math.min(1.0, pedidosConcluidos.length / 10)
  };
}
