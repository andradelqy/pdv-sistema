// src/lib/purchasing/analysis.ts
import type { Venda } from '../store';
import type { CategoriaXYZ } from './types';

export function classificarXYZ(produtoId: string, vendas: Venda[]): CategoriaXYZ {
  const vendasDoProd = vendas
    .map(v => v.itens.find(i => i.produtoId === produtoId)?.quantidade || 0);
  
  if (vendasDoProd.length < 5) return 'Z';

  const media = vendasDoProd.reduce((a, b) => a + b, 0) / vendasDoProd.length;
  const variancia = vendasDoProd.reduce((a, b) => a + Math.pow(b - media, 2), 0) / vendasDoProd.length;
  const cv = Math.sqrt(variancia) / media; // Coeficiente de variação

  if (cv < 0.2) return 'X'; // Demanda estável
  if (cv < 0.5) return 'Y'; // Moderadamente variável
  return 'Z'; // Imprevisível
}
