// src/lib/purchasing/types.ts
export type Urgencia = 'BAIXA' | 'NORMAL' | 'ALTA' | 'CRITICA';
export type CategoriaXYZ = 'X' | 'Y' | 'Z'; // X: Previsível, Z: Imprevisível

export interface DecisaoCompra {
  produtoId: string;
  decisao: 'COMPRAR_AGORA' | 'REPOR_ESTOQUE' | 'AGUARDAR' | 'EXCESSO' | 'NAO_COMPRAR';
  quantidadeSugerida: number;
  prioridade: Urgencia;
  vec: number;
  confianca: number;
  motivacao: string[];
  riscos: { ruptura: number; excesso: number };
  xyz: CategoriaXYZ; // Nova métrica de previsibilidade
}

export interface SupplierPerformance {
  confidence: number; // 0 a 1
  avgLeadTime: number;
  atrasos: number;
}

export interface MetricasFinanceiras {
    giroDiario: number;
    roi: number;
    diasCobertura: number;
    margemContribuicao: number;
}
