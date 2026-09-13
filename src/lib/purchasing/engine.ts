import type { Produto, Movimentacao, Venda, PedidoCompra } from '../store';
import type { DecisaoCompra } from './types';
import { supabase } from '../supabase';
import { calcularDemanda } from './forecast';
import { logDecisao } from './logger';
import { getSupplierMetric } from './suppliers';

export async function agenteCompras(
  produto: Produto,
  _movimentacoes: Movimentacao[],
  vendas: Venda[],
  estoqueEmTransito: number,
  lojaId: string,
  pedidosHistorico: PedidoCompra[],
  modoAutomacao: 'recommendation' | 'controlled' | 'autonomous'
): Promise<DecisaoCompra> {
  const giroDiario = calcularDemanda(produto, vendas);

  // Sazonalidade (Requisito #2)
  const mesAtual = new Date().getMonth() + 1;
  const { data: sazonalidade } = await supabase
      .from('fatores_sazonalidade')
      .select('multiplicador')
      .eq('mes', mesAtual)
      .single();
  const fator = sazonalidade?.multiplicador || 1.0;
  
  const giroSazonal = giroDiario * fator;
  const supplierMetrics = getSupplierMetric(produto.fornecedor || 'default', pedidosHistorico);
  
  const posicaoEstoque = produto.estoque + estoqueEmTransito;
  const leadTimeUtil = supplierMetrics.avgLeadTime;
  
  // Nível de Estoque Alvo: Cobrir Lead Time + 14 dias de margem
  const diasCobertura = 14;
  const nivelAlvo = Math.ceil(giroSazonal * (leadTimeUtil + diasCobertura));
  
  const estoqueSeguranca = Math.ceil(giroSazonal * leadTimeUtil * 1.2);
  const pontoPedido = (giroSazonal * leadTimeUtil) + estoqueSeguranca;

  // Calculo VEC
  const margemBruta = produto.precoVenda > 0 ? (produto.precoVenda - produto.precoCompra) / produto.precoVenda : 0;
  const vec = margemBruta * giroSazonal * (produto.qualidade || 1);

  const motivacao: string[] = [`LT Real: ${leadTimeUtil}d`, `Alvo: ${nivelAlvo}un`];
  let decisao: DecisaoCompra['decisao'] = 'AGUARDAR';
  let prioridade: DecisaoCompra['prioridade'] = 'BAIXA';
  
  if (posicaoEstoque <= estoqueSeguranca) {
      decisao = 'COMPRAR_AGORA';
      prioridade = 'CRITICA';
      motivacao.push(`Estoque crítico (${posicaoEstoque}/${estoqueSeguranca})`);
  } else if (posicaoEstoque < pontoPedido) {
      decisao = 'REPOR_ESTOQUE';
      prioridade = 'NORMAL';
      motivacao.push(`Abaixo do ponto de pedido (${posicaoEstoque} < ${pontoPedido})`);
  } else if (posicaoEstoque > nivelAlvo) {
      decisao = 'EXCESSO';
      prioridade = 'BAIXA';
      motivacao.push('Estoque elevado, risco de capital parado');
  }

  // Se modo autônomo, força compra se for crítica
  if (modoAutomacao !== 'recommendation' && decisao === 'COMPRAR_AGORA' && supplierMetrics.confidence > 0.8) {
      motivacao.push('Execução autônoma ativada');
  }

  const resultado: DecisaoCompra = {
    produtoId: produto.id,
    decisao,
    quantidadeSugerida: (decisao === 'COMPRAR_AGORA' || decisao === 'REPOR_ESTOQUE') ? Math.max(1, nivelAlvo - posicaoEstoque) : 0,
    prioridade,
    vec,
    confianca: supplierMetrics.confidence * 100,
    motivacao,
    riscos: { ruptura: posicaoEstoque < pontoPedido ? 0.8 : 0.1, excesso: posicaoEstoque > nivelAlvo ? 0.7 : 0.05 },
    xyz: 'X'
  };

  await logDecisao(resultado, lojaId);

  return resultado;
}
