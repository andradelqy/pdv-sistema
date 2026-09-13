// src/lib/purchasing/logger.ts
import { supabase } from '../supabase';
import type { DecisaoCompra } from './types';

export async function logDecisao(decisao: DecisaoCompra, lojaId: string) {
  try {
    const { error } = await supabase.from('log_decisoes_compra').insert({
      loja_id: lojaId,
      produto_id: decisao.produtoId,
      decisao_tomada: decisao.decisao,
      quantidade_sugerida: decisao.quantidadeSugerida,
      confianca_score: decisao.confianca,
      detalhes_decisao: { motivacao: decisao.motivacao, riscos: decisao.riscos },
      data_decisao: new Date().toISOString()
    });
    if (error) throw error;
  } catch (e) {
    console.error('Erro ao logar decisão:', e);
  }
}
