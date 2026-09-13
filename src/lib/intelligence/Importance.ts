// src/lib/intelligence/Importance.ts

import type { Produto, Venda } from '../store';

const PESOS = {
  frequency: 0.20,
  revenue: 0.20,
  profit: 0.15,
  rupture: 0.15,
  demand: 0.10,
  recurrence: 0.10,
  trend: 0.05,
  turnover: 0.05,
};

const DIAS_ANALISE = 60;
const DIAS_RECENTES = 14;

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function normalizar(
  value: number,
  max: number
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return clamp(
    (value / max) * 100
  );
}

function diasDesde(data: string): number {
  const timestamp =
    new Date(data).getTime();

  if (!Number.isFinite(timestamp)) {
    return Infinity;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) /
        (24 * 60 * 60 * 1000)
    )
  );
}

function quantidadeProduto(
  venda: Venda,
  produtoId: string
): number {
  return venda.itens
    .filter(
      item =>
        item.produtoId === produtoId
    )
    .reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          item.quantidade
        ),
      0
    );
}

function faturamentoProduto(
  venda: Venda,
  produtoId: string
): number {
  return venda.itens
    .filter(
      item =>
        item.produtoId === produtoId
    )
    .reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          item.quantidade
        ) *
        Math.max(
          0,
          item.precoUnit
        ),
      0
    );
}

function construirSerieDiaria(
  produtoId: string,
  vendas: Venda[],
  dias: number
): number[] {
  const serie = Array(
    dias
  ).fill(0);

  const hoje = new Date();

  for (const venda of vendas) {
    const quantidade =
      quantidadeProduto(
        venda,
        produtoId
      );

    if (quantidade <= 0) {
      continue;
    }

    const data =
      new Date(venda.data);

    if (
      !Number.isFinite(
        data.getTime()
      )
    ) {
      continue;
    }

    const diff = Math.floor(
      (
        Date.UTC(
          hoje.getFullYear(),
          hoje.getMonth(),
          hoje.getDate()
        ) -
        Date.UTC(
          data.getFullYear(),
          data.getMonth(),
          data.getDate()
        )
      ) /
        (24 * 60 * 60 * 1000)
    );

    if (
      diff < 0 ||
      diff >= dias
    ) {
      continue;
    }

    const index =
      dias - 1 - diff;

    serie[index] += quantidade;
  }

  return serie;
}

function calcularMetricasProduto(
  produto: Produto,
  vendas: Venda[]
): {
  totalUnits: number;
  revenue: number;
  activeDays: number;
  recentUnits: number;
  oldUnits: number;
  dailyDemand: number;
  recentDemand: number;
  trend: number;
  recurrence: number;
  frequency: number;
  turnover: number;
  lastSaleDaysAgo: number | null;
} {
  const serie60 =
    construirSerieDiaria(
      produto.id,
      vendas,
      DIAS_ANALISE
    );

  const serie14 =
    serie60.slice(
      -DIAS_RECENTES
    );

  const serieAnterior =
    serie60.slice(
      0,
      DIAS_ANALISE -
        DIAS_RECENTES
    );

  const totalUnits =
    serie60.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const recentUnits =
    serie14.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const oldUnits =
    serieAnterior.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const activeDays =
    serie60.filter(
      value => value > 0
    ).length;

  const dailyDemand =
    totalUnits /
    DIAS_ANALISE;

  const recentDemand =
    recentUnits /
    DIAS_RECENTES;

  const oldDemand =
    oldUnits /
    Math.max(
      1,
      serieAnterior.length
    );

  const trend =
    oldDemand > 0
      ? (recentDemand -
          oldDemand) /
        oldDemand
      : recentDemand > 0
        ? 1
        : 0;

  const recurrence =
    activeDays /
    DIAS_ANALISE;

  const frequency =
    activeDays >= 60
      ? 100
      : recurrence * 100;

  const revenue = vendas.reduce(
    (sum, venda) =>
      sum +
      faturamentoProduto(
        venda,
        produto.id
      ),
    0
  );

  const averageStock =
    Math.max(
      1,
      produto.estoque
    );

  const turnover =
    totalUnits /
    averageStock;

  let lastSaleDaysAgo:
    | number
    | null = null;

  const vendasProduto =
    vendas
      .filter(
        venda =>
          quantidadeProduto(
            venda,
            produto.id
          ) > 0
      )
      .sort(
        (a, b) =>
          new Date(b.data).getTime() -
          new Date(a.data).getTime()
      );

  if (vendasProduto.length) {
    const dias =
      diasDesde(
        vendasProduto[0].data
      );

    if (Number.isFinite(dias)) {
      lastSaleDaysAgo = dias;
    }
  }

  return {
    totalUnits,
    revenue,
    activeDays,
    recentUnits,
    oldUnits,
    dailyDemand,
    recentDemand,
    trend,
    recurrence,
    frequency,
    turnover,
    lastSaleDaysAgo,
  };
}

function margemProduto(
  produto: Produto
): number {
  if (
    produto.precoVenda <= 0
  ) {
    return 0;
  }

  const imposto =
    (produto.imposto || 0) /
    100;

  const comissao =
    (produto.comissao || 0) /
    100;

  const custo =
    (produto.precoCompra || 0) +
    (produto.frete || 0) +
    (produto.precoCompra || 0) *
      imposto +
    produto.precoVenda *
      comissao;

  return clamp(
    (
      (
        produto.precoVenda -
        custo
      ) /
      produto.precoVenda
    ) *
      100,
    0,
    100
  );
}

/**
 * Calcula a importância comercial do produto
 * comparando-o com os demais produtos do catálogo.
 */
export function calcularImportancia(
  produto: Produto,
  vendas: Venda[],
  catalogo: Produto[] = []
): {
  score: number;
  level: number;
} {
  const todasVendas = vendas;

  /**
   * Descobrimos todos os produtos que aparecem
   * no histórico para criar uma base comparável.
   */
  const produtoIds = new Set(catalogo.map(item => item.id));

  for (const venda of todasVendas) {
    for (const item of venda.itens) {
      produtoIds.add(
        item.produtoId
      );
    }
  }

  produtoIds.add(
    produto.id
  );

  const produtosMetricas =
    Array.from(
      produtoIds
    ).map(produtoId => {
      const produtoCatalogo = catalogo.find(item => item.id === produtoId) ?? produto;

      return {
        id: produtoId,
        ...calcularMetricasProduto(
          produtoCatalogo,
          todasVendas
        ),
      };
    });

  const atual =
    produtosMetricas.find(
      item =>
        item.id === produto.id
    );

  if (!atual) {
    return {
      score: 0,
      level: 1,
    };
  }

  const maxRevenue =
    Math.max(
      ...produtosMetricas.map(
        item => item.revenue
      ),
      0
    );

  const maxDemand =
    Math.max(
      ...produtosMetricas.map(
        item =>
          item.dailyDemand
      ),
      0
    );

  const maxFrequency =
    Math.max(
      ...produtosMetricas.map(
        item =>
          item.frequency
      ),
      0
    );

  const maxTurnover =
    Math.max(
      ...produtosMetricas.map(
        item =>
          item.turnover
      ),
      0
    );

  // ---------------------------------------------
  // 1. FREQUÊNCIA
  // ---------------------------------------------

  const frequencyScore =
    normalizar(
      atual.frequency,
      maxFrequency || 100
    );

  // ---------------------------------------------
  // 2. FATURAMENTO
  // ---------------------------------------------

  const revenueScore =
    normalizar(
      atual.revenue,
      maxRevenue
    );

  // ---------------------------------------------
  // 3. RENTABILIDADE
  // ---------------------------------------------

  const profitScore =
    margemProduto(
      produto
    );

  // ---------------------------------------------
  // 4. DEMANDA
  // ---------------------------------------------

  const demandScore =
    normalizar(
      atual.dailyDemand,
      maxDemand
    );

  // ---------------------------------------------
  // 5. RECORRÊNCIA
  // ---------------------------------------------

  const recurrenceScore =
    clamp(
      atual.recurrence *
        100
    );

  // ---------------------------------------------
  // 6. TENDÊNCIA
  // ---------------------------------------------

  /**
   * Tendência positiva aumenta importância.
   * Tendência negativa reduz.
   *
   * -50% → 25
   * 0%   → 50
   * +50% → 75
   * +100% ou mais → 100
   */
  const trendScore =
    clamp(
      50 +
        atual.trend *
          50
    );

  // ---------------------------------------------
  // 7. GIRO
  // ---------------------------------------------

  const turnoverScore =
    normalizar(
      atual.turnover,
      maxTurnover
    );

  // ---------------------------------------------
  // 8. RISCO DE RUPTURA
  // ---------------------------------------------

  /**
   * O Produto não possui histórico de estoque diário.
   * Portanto não podemos inventar "3 rupturas".
   *
   * Criamos um proxy baseado em:
   * - estoque atual;
   * - ponto de pedido;
   * - demanda;
   * - lead time.
   *
   * Produtos próximos/abaixo do ponto recebem maior
   * importância operacional.
   */
  let ruptureScore = 0;

  if (
    atual.dailyDemand > 0
  ) {
    const cobertura =
      produto.estoque /
      atual.dailyDemand;

    const leadTime =
      Math.max(
        1,
        produto.leadTime || 1
      );

    ruptureScore =
      clamp(
        (
          1 -
          cobertura /
            (
              leadTime +
              1
            )
        ) *
          100
      );
  }

  // ---------------------------------------------
  // SCORE FINAL
  // ---------------------------------------------

  const score =
    frequencyScore *
      PESOS.frequency +
    revenueScore *
      PESOS.revenue +
    profitScore *
      PESOS.profit +
    ruptureScore *
      PESOS.rupture +
    demandScore *
      PESOS.demand +
    recurrenceScore *
      PESOS.recurrence +
    trendScore *
      PESOS.trend +
    turnoverScore *
      PESOS.turnover;

  const finalScore =
    Math.round(
      clamp(score)
    );

  // ---------------------------------------------
  // NÍVEL 1–5
  // ---------------------------------------------

  let level = 1;

  if (finalScore >= 80) {
    level = 5;
  } else if (
    finalScore >= 60
  ) {
    level = 4;
  } else if (
    finalScore >= 40
  ) {
    level = 3;
  } else if (
    finalScore >= 20
  ) {
    level = 2;
  }

  return {
    score: finalScore,
    level,
  };
}
