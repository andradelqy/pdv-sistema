export type Urgencia = 'BAIXA' | 'NORMAL' | 'ALTA' | 'CRITICA';
export type CategoriaABC = 'A' | 'B' | 'C';
export type CategoriaXYZ = 'X' | 'Y' | 'Z';

export interface LeadTimeData {
  average: number;
  p90: number;
  reliability: number;
}

export interface InventoryEngineResult {
  productId: string;
  
  // Previsão
  demandForecast: number;           // Média ponderada ajustada
  demandConfidence: number;         // 0-100
  
  // Importância (SAIC)
  automaticImportanceScore: number; // 0-100
  automaticImportanceLevel: number; // 1-5
  confidenceScore: number;          // 0-100
  
  abcClass: CategoriaABC;
  xyzClass: CategoriaXYZ;
  
  // Parâmetros de Estoque
  safetyStock: number;
  reorderPoint: number;
  maximumStock: number;
  
  // Métricas
  daysOfCover: number;
  ruptureRisk: number;              // 0-1
  excessRisk: number;               // 0-1
  
  // Decisão
  recommendedPurchaseQty: number;
  recommendation: 'BUY_SOON' | 'BUY_NOW' | 'WAIT' | 'SELL_OFF' | 'NO_ACTION';
  status: 'NEW_PRODUCT' | 'NORMAL' | 'CRITICAL' | 'STAGNATED';
  reasons: string[];
}
