import { supabase } from '../supabase';

export async function registrarResultadoCompra(
  produtoId: string, 
  quantidadeComprada: number, 
  vendasReais: number, 
  lojaId: string
) {
  const erro = (vendasReais - quantidadeComprada) / (quantidadeComprada || 1);

  try {
    // 1. Registrar o log para auditoria de backtesting
    await supabase.from('log_compras_simuladas').insert({
      loja_id: lojaId,
      produto_id: produtoId,
      sugestao_agente: { quantidadeComprada },
      vendas_reais: vendasReais,
      erro_previsao: erro
    });

    // 2. Ajustar o fator de correção automaticamente via RPC (aprendizado)
    await supabase.rpc('ajustar_fator_correcao', {
      p_produto_id: produtoId,
      p_loja_id: lojaId,
      p_fator: 1 + (erro * 0.1) 
    });
  } catch (e) {
    console.error('Falha ao aprender com o resultado da compra:', e);
  }
}
