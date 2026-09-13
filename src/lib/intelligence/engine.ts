// src/lib/intelligence/engine.ts

import type { Produto, Venda, PedidoCompra } from '../store';
import type { InventoryEngineResult } from './types';
import { calcularPrevisaoDemanda } from './forecast';
import { calcularImportancia } from './Importance';

type DemandaStats = {
  dailyDemand: number;
  stdDev: number;
  cv: number;
  observations: number;
  activeDays: number;
  historyDays: number;
  lastSaleDaysAgo: number | null;
  demand14: number;
  demand60: number;
  trend: number;
  zeroDaysRatio: number;
};

type FornecedorStats = {
  leadTimeAverage: number;
  leadTimeP90: number;
  reliability: number;
  confidence: number;
  inTransit: number;
  totalOrders: number;
  receivedOrders: number;
  cancelledOrders: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function diasDesde(data: string): number {
  const timestamp = new Date(data).getTime();

  if (!Number.isFinite(timestamp)) {
    return Infinity;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / MS_PER_DAY)
  );
}

function quantidadeProdutoNaVenda(
  venda: Venda,
  produtoId: string
): number {
  return venda.itens
    .filter(item => item.produtoId === produtoId)
    .reduce((sum, item) => sum + Math.max(0, item.quantidade), 0);
}

/**
 * Constrói uma série diária de demanda.
 *
 * Usamos 60 dias porque isso permite:
 * - detectar tendência;
 * - medir variabilidade;
 * - detectar intermitência;
 * - evitar que poucos dias de venda distorçam demais o cálculo.
 */
function construirDemandaDiaria(
  produto: Produto,
  vendas: Venda[],
  dias = 60
): number[] {
  const hoje = new Date();
  const serie = Array(dias).fill(0);

  for (const venda of vendas) {
    const quantidade = quantidadeProdutoNaVenda(venda, produto.id);

    if (quantidade <= 0) continue;

    const data = new Date(venda.data);

    if (!Number.isFinite(data.getTime())) continue;

    const diff = Math.floor(
      (Date.UTC(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate()
      ) -
        Date.UTC(
          data.getFullYear(),
          data.getMonth(),
          data.getDate()
        )) /
        MS_PER_DAY
    );

    if (diff < 0 || diff >= dias) continue;

    const index = dias - 1 - diff;

    if (index >= 0 && index < dias) {
      serie[index] += quantidade;
    }
  }

  return serie;
}

function calcularMedia(valores: number[]): number {
  if (!valores.length) return 0;

  return (
    valores.reduce((sum, value) => sum + value, 0) /
    valores.length
  );
}

function calcularDesvioPadrao(valores: number[]): number {
  if (valores.length <= 1) return 0;

  const media = calcularMedia(valores);

  const variancia =
    valores.reduce(
      (sum, value) => sum + Math.pow(value - media, 2),
      0
    ) / valores.length;

  return Math.sqrt(variancia);
}

function analisarDemanda(
  produto: Produto,
  vendas: Venda[]
): DemandaStats {
  const serie60 = construirDemandaDiaria(produto, vendas, 60);

  const serie14 = serie60.slice(-14);

  const demand60 = calcularMedia(serie60);
  const demand14 = calcularMedia(serie14);

  const stdDev = calcularDesvioPadrao(serie60);

  const cv =
    demand60 > 0
      ? stdDev / demand60
      : 0;

  const activeDays = serie60.filter(v => v > 0).length;

  const observations = serie60.reduce(
    (sum, value) => sum + value,
    0
  );

  const zeroDaysRatio =
    serie60.length > 0
      ? (serie60.length - activeDays) / serie60.length
      : 1;

  const trend =
    demand60 > 0
      ? (demand14 - demand60) / demand60
      : demand14 > 0
        ? 1
        : 0;

  let lastSaleDaysAgo: number | null = null;

  const vendasProduto = vendas
    .filter(v => quantidadeProdutoNaVenda(v, produto.id) > 0)
    .sort(
      (a, b) =>
        new Date(b.data).getTime() -
        new Date(a.data).getTime()
    );

  if (vendasProduto.length > 0) {
    const dias = diasDesde(vendasProduto[0].data);

    if (Number.isFinite(dias)) {
      lastSaleDaysAgo = dias;
    }
  }

  return {
    dailyDemand: demand60,
    stdDev,
    cv,
    observations,
    activeDays,
    historyDays: 60,
    lastSaleDaysAgo,
    demand14,
    demand60,
    trend,
    zeroDaysRatio,
  };
}

/**
 * Recupera uma média conservadora para produtos que venderam nos últimos seis
 * meses, mas ficaram sem venda na janela curta de 60 dias. Sem isso, uma
 * ruptura poderia receber uma recomendação de zero unidades.
 */
function calcularDemandaHistorica(produto: Produto, vendas: Venda[]): number {
  const limite = Date.now() - 180 * MS_PER_DAY;
  const vendasRecentes = vendas.filter(venda => {
    const data = new Date(venda.data).getTime();
    return Number.isFinite(data) && data >= limite && quantidadeProdutoNaVenda(venda, produto.id) > 0;
  });
  if (!vendasRecentes.length) return 0;

  const total = vendasRecentes.reduce((soma, venda) => soma + quantidadeProdutoNaVenda(venda, produto.id), 0);
  const primeiraVenda = Math.min(...vendasRecentes.map(venda => new Date(venda.data).getTime()));
  const dias = Math.max(30, Math.min(180, Math.ceil((Date.now() - primeiraVenda) / MS_PER_DAY) + 1));
  return total / dias;
}

/**
 * Classificação XYZ:
 *
 * X = demanda previsível
 * Y = variação moderada
 * Z = demanda muito irregular/intermitente
 */
function calcularXYZ(stats: DemandaStats): 'X' | 'Y' | 'Z' {
  if (stats.observations <= 0) {
    return 'Z';
  }

  if (
    stats.zeroDaysRatio > 0.50 ||
    stats.cv > 1
  ) {
    return 'Z';
  }

  if (
    stats.cv > 0.50 ||
    stats.zeroDaysRatio > 0.25
  ) {
    return 'Y';
  }

  return 'X';
}

/**
 * ABC por participação no faturamento do catálogo.
 *
 * Como o engine recebe todas as vendas, conseguimos calcular
 * a participação do produto no faturamento observado sem
 * precisar alterar o contrato da função.
 */
function calcularABC(
  produto: Produto,
  vendas: Venda[]
): 'A' | 'B' | 'C' {
  const faturamentoPorProduto = new Map<string, number>();

  for (const venda of vendas) {
    for (const item of venda.itens) {
      const faturamento =
        Math.max(0, item.quantidade) *
        Math.max(0, item.precoUnit);

      faturamentoPorProduto.set(
        item.produtoId,
        (faturamentoPorProduto.get(item.produtoId) || 0) +
          faturamento
      );
    }
  }

  const valores = Array.from(
    faturamentoPorProduto.entries()
  ).sort((a, b) => b[1] - a[1]);

  const total = valores.reduce(
    (sum, [, valor]) => sum + valor,
    0
  );

  if (total <= 0) {
    return 'C';
  }

  let acumulado = 0;

  for (const [produtoId, valor] of valores) {
    acumulado += valor;

    if (produtoId !== produto.id) continue;

    const participacaoAcumulada =
      acumulado / total;

    if (participacaoAcumulada <= 0.80) {
      return 'A';
    }

    if (participacaoAcumulada <= 0.95) {
      return 'B';
    }

    return 'C';
  }

  return 'C';
}

function analisarFornecedor(
  produto: Produto,
  pedidos: PedidoCompra[]
): FornecedorStats {
  const pedidosProduto = pedidos.filter(pedido =>
    pedido.itens.some(
      item => item.produtoId === produto.id
    )
  );

  const totalOrders = pedidosProduto.length;

  const receivedOrders = pedidosProduto.filter(
    pedido => pedido.status === 'received'
  ).length;

  const cancelledOrders = pedidosProduto.filter(
    pedido => pedido.status === 'cancelled'
  ).length;

  const inTransit = pedidosProduto
    // Pedidos aprovados (pending) já comprometem reposição e não podem gerar compra duplicada.
    .filter(pedido => pedido.status === 'pending' || pedido.status === 'in_transit')
    .reduce((sum, pedido) => {
      const item = pedido.itens.find(
        item => item.produtoId === produto.id
      );

      return sum + (item?.quantidade || 0);
    }, 0);

  const configuredLeadTime =
    Math.max(1, Number(produto.leadTime) || 1);

  const leadTimes = pedidosProduto
    .filter(pedido => pedido.status === 'received' && pedido.recebidoEm)
    .map(pedido => (new Date(pedido.recebidoEm!).getTime() - new Date(pedido.dataPedido).getTime()) / MS_PER_DAY)
    .filter(dias => Number.isFinite(dias) && dias >= 0);

  const leadTimeAverage = leadTimes.length
    ? leadTimes.reduce((sum, dias) => sum + dias, 0) / leadTimes.length
    : configuredLeadTime;

  const leadTimeP90Historico = leadTimes.length
    ? [...leadTimes].sort((a, b) => a - b)[Math.ceil(leadTimes.length * 0.9) - 1]
    : leadTimeAverage;

  let reliability = 0.70;

  if (totalOrders > 0) {
    const concludedOrders =
      receivedOrders + cancelledOrders;

    if (concludedOrders > 0) {
      reliability =
        receivedOrders / concludedOrders;
    } else {
      reliability = 0.70;
    }

    // Quanto mais histórico, maior nossa confiança na métrica.
    const confidenceFactor = clamp(
      totalOrders / 10
    );

    reliability =
      0.70 * (1 - confidenceFactor) +
      reliability * confidenceFactor;
  }

  reliability = clamp(reliability);

  /**
   * Sem data de recebimento não podemos estimar P90 real.
   *
   * Aplicamos uma penalização no P90 quando a confiabilidade
   * histórica é baixa, tornando o estoque mais conservador.
   */
  const leadTimeP90 =
    leadTimeP90Historico *
    (
      1 +
      (1 - reliability) * 0.75
    );

  const confidence =
    totalOrders === 0
      ? 25
      : Math.min(
          100,
          25 + totalOrders * 7
        );

  return {
    leadTimeAverage: round(leadTimeAverage),
    leadTimeP90,
    reliability,
    confidence,
    inTransit,
    totalOrders,
    receivedOrders,
    cancelledOrders,
  };
}

/**
 * Importância maior => proteção maior.
 *
 * Diferente do engine antigo, nível 5 agora possui
 * maior fator de segurança que nível 1.
 */
function fatorABC(abc: 'A' | 'B' | 'C'): number {
  if (abc === 'A') return 1.15;
  if (abc === 'B') return 1.05;
  return 1.00;
}

function fatorXYZ(xyz: 'X' | 'Y' | 'Z'): number {
  if (xyz === 'Z') return 1.25;
  if (xyz === 'Y') return 1.10;
  return 1.00;
}

function calcularEstoqueSeguranca(params: {
  stats: DemandaStats;
  fornecedor: FornecedorStats;
  importanceLevel: number;
  abcClass: 'A' | 'B' | 'C';
  xyzClass: 'X' | 'Y' | 'Z';
}): number {
  const {
    stats,
    fornecedor,
    importanceLevel,
    abcClass,
    xyzClass,
  } = params;

  if (stats.dailyDemand <= 0) {
    return 0;
  }

  /**
   * Variabilidade durante o lead time:
   *
   * sigma_demanda * sqrt(leadTime)
   */
  const variabilidadeLeadTime =
    stats.stdDev *
    Math.sqrt(
      Math.max(1, fornecedor.leadTimeP90)
    );

  const zBase =
    1.28 +
    (importanceLevel - 1) * 0.18;

  let safetyStock =
    variabilidadeLeadTime *
    zBase;

  safetyStock *= fatorABC(abcClass);
  safetyStock *= fatorXYZ(xyzClass);

  /**
   * Fornecedor pouco confiável recebe proteção adicional.
   */
  const reliabilityFactor =
    1 +
    (1 - fornecedor.reliability) * 0.50;

  safetyStock *= reliabilityFactor;

  /**
   * Tendência positiva exige proteção adicional.
   */
  if (stats.trend > 0) {
    safetyStock *=
      1 + Math.min(0.30, stats.trend * 0.50);
  }

  return Math.max(
    0,
    Math.ceil(safetyStock)
  );
}

function calcularPontoPedido(params: {
  demand: number;
  leadTime: number;
  safetyStock: number;
}): number {
  const {
    demand,
    leadTime,
    safetyStock,
  } = params;

  return Math.max(
    0,
    Math.ceil(
      demand * leadTime +
      safetyStock
    )
  );
}

function calcularEstoqueMaximo(params: {
  demand: number;
  safetyStock: number;
  importanceLevel: number;
  abcClass: 'A' | 'B' | 'C';
}): number {
  const {
    demand,
    safetyStock,
    importanceLevel,
    abcClass,
  } = params;

  if (demand <= 0) {
    return safetyStock;
  }

  let coberturaDias = 30;

  if (abcClass === 'A') {
    coberturaDias = 21;
  } else if (abcClass === 'B') {
    coberturaDias = 30;
  } else {
    coberturaDias = 45;
  }

  /**
   * Produtos importantes podem ter um horizonte um pouco
   * maior para reduzir risco operacional.
   */
  coberturaDias +=
    Math.max(0, importanceLevel - 3) * 3;

  return Math.max(
    safetyStock,
    Math.ceil(
      demand * coberturaDias +
      safetyStock
    )
  );
}

function calcularInventoryPosition(params: {
  estoqueDisponivel: number;
  estoqueEmTransito: number;
}): number {
  return Math.max(
    0,
    params.estoqueDisponivel +
      params.estoqueEmTransito
  );
}

function calcularRiscoRuptura(params: {
  inventoryPosition: number;
  reorderPoint: number;
  demandForecast: number;
  daysOfCover: number;
  leadTimeP90: number;
  demandVariability: number;
  supplierReliability: number;
  importanceScore: number;
}): number {
  const {
    inventoryPosition,
    reorderPoint,
    demandForecast,
    daysOfCover,
    leadTimeP90,
    demandVariability,
    supplierReliability,
    importanceScore,
  } = params;

  if (demandForecast <= 0) {
    return 0;
  }

  /**
   * Quanto menor a cobertura comparada ao lead time,
   * maior o risco.
   */
  const coberturaRisk = clamp(
    1 -
      daysOfCover /
        Math.max(1, leadTimeP90)
  );

  /**
   * Distância para o ponto de pedido.
   */
  const reorderRisk = clamp(
    (reorderPoint - inventoryPosition) /
      Math.max(
        1,
        reorderPoint
      )
  );

  /**
   * Variabilidade aumenta risco.
   */
  const variabilityRisk = clamp(
    demandVariability / 2
  );

  /**
   * Fornecedor pouco confiável aumenta risco.
   */
  const supplierRisk =
    1 - clamp(supplierReliability);

  /**
   * Produtos importantes recebem uma pequena
   * penalização adicional.
   */
  const importanceRisk =
    clamp(importanceScore / 100) * 0.20;

  const risk =
    coberturaRisk * 0.35 +
    reorderRisk * 0.30 +
    variabilityRisk * 0.15 +
    supplierRisk * 0.10 +
    importanceRisk * 0.10;

  /**
   * Estoque zerado é uma situação especial.
   */
  if (inventoryPosition <= 0) {
    return 1;
  }

  return round(
    clamp(risk)
  );
}

function calcularRiscoExcesso(params: {
  inventoryPosition: number;
  maximumStock: number;
  demandForecast: number;
  daysOfCover: number;
  stagnationScore: number;
}): number {
  const {
    inventoryPosition,
    maximumStock,
    demandForecast,
    daysOfCover,
    stagnationScore,
  } = params;

  if (
    demandForecast <= 0 &&
    inventoryPosition > 0
  ) {
    return 1;
  }

  const excessUnits =
    inventoryPosition -
    maximumStock;

  const stockExcessRatio =
    maximumStock > 0
      ? Math.max(
          0,
          excessUnits / maximumStock
        )
      : inventoryPosition > 0
        ? 1
        : 0;

  const coverageRisk =
    demandForecast > 0
      ? clamp(
          (daysOfCover - 45) / 45
        )
      : 1;

  const risk =
    stockExcessRatio * 0.55 +
    coverageRisk * 0.25 +
    stagnationScore * 0.20;

  return round(
    clamp(risk)
  );
}

function calcularConfianca(params: {
  stats: DemandaStats;
  fornecedor: FornecedorStats;
}): number {
  const {
    stats,
    fornecedor,
  } = params;

  const volumeScore = Math.min(
    100,
    stats.observations * 2
  );

  const historyScore =
    stats.activeDays >= 45
      ? 100
      : stats.activeDays * 2.2;

  const variabilityScore =
    stats.cv <= 0.30
      ? 100
      : stats.cv <= 0.60
        ? 80
        : stats.cv <= 1
          ? 60
          : 35;

  const supplierScore =
    fornecedor.confidence;

  return Math.round(
    volumeScore * 0.30 +
    historyScore * 0.25 +
    variabilityScore * 0.25 +
    supplierScore * 0.20
  );
}

function calcularConfiancaDemanda(
  stats: DemandaStats
): number {
  if (stats.observations <= 0) {
    return 10;
  }

  const volume =
    Math.min(
      100,
      stats.observations * 2
    );

  const regularidade =
    stats.cv <= 0.30
      ? 100
      : stats.cv <= 0.60
        ? 80
        : stats.cv <= 1
          ? 60
          : 35;

  const atividade =
    Math.min(
      100,
      stats.activeDays * 2
    );

  return Math.round(
    volume * 0.40 +
    regularidade * 0.35 +
    atividade * 0.25
  );
}

function calcularEstagnacao(
  stats: DemandaStats,
  produto: Produto
): number {
  if (stats.observations <= 0) {
    return produto.estoque > 0
      ? 1
      : 0;
  }

  const diasSemVenda =
    stats.lastSaleDaysAgo ?? 999;

  const riscoTempo = clamp(
    diasSemVenda / 60
  );

  const riscoIntermitencia =
    stats.zeroDaysRatio;

  return clamp(
    riscoTempo * 0.65 +
    riscoIntermitencia * 0.35
  );
}

function calcularQuantidadeCompra(params: {
  inventoryPosition: number;
  reorderPoint: number;
  maximumStock: number;
  ruptureRisk: number;
  demandForecast: number;
}): number {
  const {
    inventoryPosition,
    reorderPoint,
    maximumStock,
    ruptureRisk,
    demandForecast,
  } = params;

  if (demandForecast <= 0) {
    return 0;
  }

  if (
    inventoryPosition >= reorderPoint &&
    ruptureRisk < 0.60
  ) {
    return 0;
  }

  const alvo =
    ruptureRisk >= 0.85
      ? maximumStock
      : Math.max(
          reorderPoint,
          maximumStock * 0.70
        );

  return Math.max(
    0,
    Math.ceil(
      alvo -
      inventoryPosition
    )
  );
}

function decidirRecomendacao(params: {
  inventoryPosition: number;
  reorderPoint: number;
  maximumStock: number;
  ruptureRisk: number;
  excessRisk: number;
  stagnationScore: number;
  confidenceScore: number;
  demand: number;
}): InventoryEngineResult['recommendation'] {
  const {
    inventoryPosition,
    reorderPoint,
    maximumStock,
    ruptureRisk,
    excessRisk,
    stagnationScore,
    confidenceScore,
    demand,
  } = params;

  if (
    excessRisk >= 0.75 &&
    stagnationScore >= 0.65
  ) {
    return 'SELL_OFF';
  }

  if (
    demand <= 0 &&
    inventoryPosition > 0
  ) {
    return 'SELL_OFF';
  }

  if (
    ruptureRisk >= 0.85 &&
    inventoryPosition < reorderPoint
  ) {
    return 'BUY_NOW';
  }

  if (
    inventoryPosition < reorderPoint &&
    confidenceScore >= 35
  ) {
    return 'BUY_SOON';
  }

  if (
    inventoryPosition > maximumStock &&
    excessRisk >= 0.45
  ) {
    return 'SELL_OFF';
  }

  if (
    ruptureRisk >= 0.45 ||
    excessRisk >= 0.45
  ) {
    return 'WAIT';
  }

  return 'NO_ACTION';
}

function determinarStatus(params: {
  produto: Produto;
  inventoryPosition: number;
  ruptureRisk: number;
  excessRisk: number;
  stagnationScore: number;
  demand: number;
}): InventoryEngineResult['status'] {
  const {
    produto,
    inventoryPosition,
    ruptureRisk,
    excessRisk,
    stagnationScore,
    demand,
  } = params;

  const hasHistory =
    demand > 0 ||
    produto.estoque > 0;

  if (!hasHistory) {
    return 'NEW_PRODUCT';
  }

  if (
    ruptureRisk >= 0.85 ||
    inventoryPosition <= 0
  ) {
    return 'CRITICAL';
  }

  if (
    stagnationScore >= 0.75 &&
    produto.estoque > 0
  ) {
    return 'STAGNATED';
  }

  if (excessRisk >= 0.80) {
    return 'STAGNATED';
  }

  return 'NORMAL';
}

function gerarMotivos(params: {
  stats: DemandaStats;
  fornecedor: FornecedorStats;
  abcClass: 'A' | 'B' | 'C';
  xyzClass: 'X' | 'Y' | 'Z';
  importanceScore: number;
  importanceLevel: number;
  inventoryPosition: number;
  daysOfCover: number;
  safetyStock: number;
  reorderPoint: number;
  maximumStock: number;
  ruptureRisk: number;
  excessRisk: number;
  recommendation: InventoryEngineResult['recommendation'];
  stagnationScore: number;
}): string[] {
  const {
    stats,
    fornecedor,
    abcClass,
    xyzClass,
    importanceScore,
    importanceLevel,
    inventoryPosition,
    daysOfCover,
    safetyStock,
    reorderPoint,
    maximumStock,
    ruptureRisk,
    excessRisk,
    recommendation,
    stagnationScore,
  } = params;

  const reasons: string[] = [];

  if (stats.trend > 0.10) {
    reasons.push(
      `Demanda dos últimos 14 dias está ${Math.round(
        stats.trend * 100
      )}% acima da média de 60 dias`
    );
  } else if (stats.trend < -0.10) {
    reasons.push(
      `Demanda dos últimos 14 dias está ${Math.round(
        Math.abs(stats.trend) * 100
      )}% abaixo da média de 60 dias`
    );
  }

  reasons.push(
    `Demanda média: ${round(
      stats.dailyDemand
    )} un./dia`
  );

  reasons.push(
    `Classificação ABC ${abcClass} e XYZ ${xyzClass}`
  );

  reasons.push(
    `Importância comercial: ${Math.round(
      importanceScore
    )}/100 (nível ${importanceLevel})`
  );

  reasons.push(
    `Lead Time considerado: ${round(
      fornecedor.leadTimeP90,
      1
    )} dias no cenário P90`
  );

  reasons.push(
    `Confiabilidade estimada do fornecedor: ${Math.round(
      fornecedor.reliability * 100
    )}%`
  );

  if (fornecedor.inTransit > 0) {
    reasons.push(
      `${Math.ceil(
        fornecedor.inTransit
      )} unidades em trânsito foram consideradas na posição de estoque`
    );
  }

  reasons.push(
    `Posição de estoque: ${Math.ceil(
      inventoryPosition
    )} un.; cobertura estimada: ${round(
      daysOfCover,
      1
    )} dias`
  );

  reasons.push(
    `Estoque de segurança calculado: ${Math.ceil(
      safetyStock
    )} un.`
  );

  reasons.push(
    `Ponto de pedido: ${Math.ceil(
      reorderPoint
    )} un.; máximo recomendado: ${Math.ceil(
      maximumStock
    )} un.`
  );

  if (ruptureRisk >= 0.70) {
    reasons.push(
      `Risco de ruptura elevado: ${Math.round(
        ruptureRisk * 100
      )}%`
    );
  }

  if (excessRisk >= 0.50) {
    reasons.push(
      `Risco de excesso: ${Math.round(
        excessRisk * 100
      )}%`
    );
  }

  if (stagnationScore >= 0.65) {
    reasons.push(
      'Produto apresenta sinais de estagnação'
    );
  }

  if (
    stats.cv > 1
  ) {
    reasons.push(
      'Demanda altamente variável, exigindo proteção adicional'
    );
  }

  switch (recommendation) {
    case 'BUY_NOW':
      reasons.push(
        'Compra urgente recomendada devido ao risco de ruptura'
      );
      break;

    case 'BUY_SOON':
      reasons.push(
        'Compra recomendada antes que a posição de estoque atinja nível crítico'
      );
      break;

    case 'SELL_OFF':
      reasons.push(
        'Redução de estoque recomendada devido ao excesso ou baixa rotação'
      );
      break;

    case 'WAIT':
      reasons.push(
        'Monitoramento recomendado antes de uma nova compra'
      );
      break;

    case 'NO_ACTION':
      reasons.push(
        'Estoque está dentro da faixa operacional recomendada'
      );
      break;
  }

  return reasons;
}

export async function getInventoryPolicy(
  produto: Produto,
  vendas: Venda[],
  pedidosHistorico: PedidoCompra[],
  lojaId: string,
  catalogo: Produto[] = []
): Promise<InventoryEngineResult> {
  // Mantido no contrato para futuras políticas específicas por loja.
  void lojaId;

  // ---------------------------------------------------------
  // 1. DEMANDA
  // ---------------------------------------------------------

  const demandaBase = Math.max(
    0,
    calcularPrevisaoDemanda(
      produto,
      vendas
    )
  );

  const demandaStats =
    analisarDemanda(
      produto,
      vendas
    );

  /**
   * Calculamos a demanda baseada no histórico limpo de rupturas
   */
  const demanda = Math.max(
    demandaBase,
    demandaStats.dailyDemand,
    calcularDemandaHistorica(produto, vendas)
  );

  // ---------------------------------------------------------
  // 2. CLASSIFICAÇÕES
  // ---------------------------------------------------------

  const abcClass =
    calcularABC(
      produto,
      vendas
    );

  const xyzClass =
    calcularXYZ(
      demandaStats
    );

  // ---------------------------------------------------------
  // 3. FORNECEDOR
  // ---------------------------------------------------------

  const fornecedor =
    analisarFornecedor(
      produto,
      pedidosHistorico
    );

  // ---------------------------------------------------------
  // 4. IMPORTÂNCIA
  // ---------------------------------------------------------

  /**
   * Importance.ts atualmente espera Venda[] no terceiro
   * parâmetro. O engine antigo passava PedidoCompra[],
   * o que estava conceitualmente e tipicamente incorreto.
   *
   * Como a implementação atual de Importance.ts não utiliza
   * efetivamente esse terceiro argumento, usamos vendas.
   */
  const {
    score,
    level,
  } = calcularImportancia(
    produto,
    vendas,
    catalogo
  );

  // ---------------------------------------------------------
  // 5. ESTOQUE DE SEGURANÇA
  // ---------------------------------------------------------

  const safetyStock =
    calcularEstoqueSeguranca({
      stats: {
        ...demandaStats,
        dailyDemand: demanda,
      },
      fornecedor,
      importanceLevel: level,
      abcClass,
      xyzClass,
    });

  // ---------------------------------------------------------
  // 6. PONTO DE PEDIDO
  // ---------------------------------------------------------

  const reorderPoint =
    calcularPontoPedido({
      demand: demanda,
      leadTime: fornecedor.leadTimeP90,
      safetyStock,
    });

  // ---------------------------------------------------------
  // 7. ESTOQUE MÁXIMO
  // ---------------------------------------------------------

  const maximumStock =
    calcularEstoqueMaximo({
      demand: demanda,
      safetyStock,
      importanceLevel: level,
      abcClass,
    });

  // ---------------------------------------------------------
  // 8. POSIÇÃO REAL DE ESTOQUE
  // ---------------------------------------------------------

  const inventoryPosition =
    calcularInventoryPosition({
      estoqueDisponivel:
        Math.max(0, produto.estoque),
      estoqueEmTransito:
        fornecedor.inTransit,
    });

  const daysOfCover =
    demanda > 0
      ? inventoryPosition / demanda
      : Infinity;

  // ---------------------------------------------------------
  // 9. ESTAGNAÇÃO
  // ---------------------------------------------------------

  const stagnationScore =
    calcularEstagnacao(
      demandaStats,
      produto
    );

  // ---------------------------------------------------------
  // 10. RISCO DE RUPTURA
  // ---------------------------------------------------------

  const ruptureRisk =
    calcularRiscoRuptura({
      inventoryPosition,
      reorderPoint,
      demandForecast: demanda,
      daysOfCover,
      leadTimeP90:
        fornecedor.leadTimeP90,
      demandVariability:
        demandaStats.cv,
      supplierReliability:
        fornecedor.reliability,
      importanceScore: score,
    });

  // ---------------------------------------------------------
  // 11. RISCO DE EXCESSO
  // ---------------------------------------------------------

  const excessRisk =
    calcularRiscoExcesso({
      inventoryPosition,
      maximumStock,
      demandForecast: demanda,
      daysOfCover,
      stagnationScore,
    });

  // ---------------------------------------------------------
  // 12. CONFIANÇA
  // ---------------------------------------------------------

  const confidenceScore =
    calcularConfianca({
      stats: demandaStats,
      fornecedor,
    });

  const demandConfidence =
    calcularConfiancaDemanda(
      demandaStats
    );

  // ---------------------------------------------------------
  // 13. RECOMENDAÇÃO
  // ---------------------------------------------------------

  const recommendation =
    decidirRecomendacao({
      inventoryPosition,
      reorderPoint,
      maximumStock,
      ruptureRisk,
      excessRisk,
      stagnationScore,
      confidenceScore,
      demand: demanda,
    });

  // ---------------------------------------------------------
  // 14. QUANTIDADE DE COMPRA
  // ---------------------------------------------------------

  const recommendedPurchaseQty =
    calcularQuantidadeCompra({
      inventoryPosition,
      reorderPoint,
      maximumStock,
      ruptureRisk,
      demandForecast: demanda,
    });

  // ---------------------------------------------------------
  // 15. STATUS
  // ---------------------------------------------------------

  const status =
    determinarStatus({
      produto,
      inventoryPosition,
      ruptureRisk,
      excessRisk,
      stagnationScore,
      demand: demanda,
    });

  // ---------------------------------------------------------
  // 16. EXPLICAÇÃO
  // ---------------------------------------------------------

  const reasons =
    gerarMotivos({
      stats: demandaStats,
      fornecedor,
      abcClass,
      xyzClass,
      importanceScore: score,
      importanceLevel: level,
      inventoryPosition,
      daysOfCover,
      safetyStock,
      reorderPoint,
      maximumStock,
      ruptureRisk,
      excessRisk,
      recommendation,
      stagnationScore,
    });

  // ---------------------------------------------------------
  // 17. RESULTADO
  // ---------------------------------------------------------

  return {
    productId: produto.id,

    demandForecast: round(
      demanda,
      2
    ),

    demandConfidence,

    automaticImportanceScore:
      score,

    automaticImportanceLevel:
      level,

    confidenceScore,

    abcClass,
    xyzClass,

    safetyStock,

    reorderPoint,

    maximumStock,

    daysOfCover:
      Number.isFinite(daysOfCover)
        ? round(daysOfCover, 1)
        : 999,

    ruptureRisk,

    excessRisk,

    recommendedPurchaseQty,

    recommendation,

    status,

    reasons,
  };
}

/** Sugestão leve para a tela de cadastro, baseada em demanda recente e prazo de reposição. */
export function sugerirEstoqueMinimo(produto: Produto, vendas: Venda[], pedidos: PedidoCompra[]): number {
  const demanda = calcularPrevisaoDemanda(produto, vendas);
  if (demanda <= 0) return Math.max(1, produto.estoqueMin || 1);
  const fornecedor = analisarFornecedor(produto, pedidos);
  return Math.max(1, Math.ceil(demanda * Math.max(1, fornecedor.leadTimeP90) + demanda * 2));
}
