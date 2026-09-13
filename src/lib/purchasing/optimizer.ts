// src/lib/purchasing/optimizer.ts
import type { Produto } from '../store';
import type { DecisaoCompra } from './types';

export function otimizarOrcamento(
  sugestoes: DecisaoCompra[],
  produtos: Produto[],
  orcamentoDisponivel: number
): { carrinho: { produtoId: string, quantidade: number, custo: number }[], total: number } {
  // Prioriza pelo VEC (Valor Econômico da Compra)
  const sugestoesOrdenadas = [...sugestoes].sort((a, b) => b.vec - a.vec);
  
  const carrinho = [];
  let total = 0;

  for (const sugestao of sugestoesOrdenadas) {
    const produto = produtos.find(p => p.id === sugestao.produtoId);
    if (!produto) continue;
    
    const custo = sugestao.quantidadeSugerida * produto.precoCompra;
    if (total + custo <= orcamentoDisponivel && sugestao.decisao !== 'EXCESSO' && sugestao.decisao !== 'NAO_COMPRAR') {
      carrinho.push({ produtoId: sugestao.produtoId, quantidade: sugestao.quantidadeSugerida, custo });
      total += custo;
    }
  }

  return { carrinho, total };
}
