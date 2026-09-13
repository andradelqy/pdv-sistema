// src/lib/intelligence/forecast.ts

import type {
  Venda,
  Produto,
} from '../store';

const DIAS_HISTORICO = 60;
const DIAS_MEDIO = 30;
const DIAS_RECENTE = 14;

const MS_PER_DAY =
  24 * 60 * 60 * 1000;

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function quantidadeProduto(
  venda: Venda,
  produtoId: string
): number {
  return venda.itens
    .filter(
      item =>
        item.produtoId ===
        produtoId
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

/**
 * Cria uma série diária completa.
 *
 * Dias sem venda permanecem como 0.
 * Isso é fundamental para não confundir:
 *
 * "vendeu muito nos poucos dias em que vendeu"
 *
 * com:
 *
 * "vende muito todos os dias".
 */
function construirSerieDiaria(
  produto: Produto,
  vendas: Venda[],
  dias: number
): number[] {
  const serie =
    Array(dias).fill(0);

  const hoje =
    new Date();

  for (const venda of vendas) {
    const quantidade =
      quantidadeProduto(
        venda,
        produto.id
      );

    if (
      quantidade <= 0
    ) {
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

    const diff =
      Math.floor(
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
          MS_PER_DAY
      );

    if (
      diff < 0 ||
      diff >= dias
    ) {
      continue;
    }

    const index =
      dias -
      1 -
      diff;

    if (
      index >= 0 &&
      index < dias
    ) {
      serie[index] +=
        quantidade;
    }
  }

  return serie;
}

function media(
  valores: number[]
): number {
  if (
    valores.length === 0
  ) {
    return 0;
  }

  return (
    valores.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    valores.length
  );
}

/**
 * Média ponderada por recência.
 *
 * Os dias recentes possuem mais influência,
 * mas os dias antigos continuam participando.
 */
function mediaPonderadaRecencia(
  serie: number[]
): number {
  if (!serie.length) {
    return 0;
  }

  let somaPesos = 0;
  let somaValores = 0;

  for (
    let i = 0;
    i < serie.length;
    i++
  ) {
    const idade =
      serie.length -
      1 -
      i;

    /**
     * Peso decai suavemente com a idade.
     */
    const peso =
      Math.exp(
        -idade / 30
      );

    somaPesos +=
      peso;

    somaValores +=
      serie[i] *
      peso;
  }

  if (
    somaPesos === 0
  ) {
    return 0;
  }

  return (
    somaValores /
    somaPesos
  );
}

/**
 * Suavização exponencial.
 *
 * Reage às mudanças recentes sem permitir
 * que um único pico domine completamente a previsão.
 */
function suavizacaoExponencial(
  serie: number[],
  alpha = 0.20
): number {
  if (!serie.length) {
    return 0;
  }

  let nivel =
    serie[0];

  for (
    let i = 1;
    i < serie.length;
    i++
  ) {
    nivel =
      alpha *
        serie[i] +
      (1 - alpha) *
        nivel;
  }

  return nivel;
}

function limitarOutlier(
  serie: number[]
): number[] {
  if (
    serie.length < 7
  ) {
    return serie;
  }

  // Dias sem venda não são outliers. Incluí-los no percentil fazia o P90 virar
  // zero em produtos de venda intermitente e apagava toda a previsão.
  const valoresPositivos = serie.filter(value => value > 0);
  if (!valoresPositivos.length) {
    return serie;
  }

  const valoresOrdenados =
    valoresPositivos.sort(
      (a, b) => a - b
    );

  const p90Index =
    Math.floor(
      (
        valoresOrdenados.length -
        1
      ) *
        0.90
    );

  const p90 =
    valoresOrdenados[
      p90Index
    ] || 0;

  /**
   * Não eliminamos o pico.
   * Apenas impedimos que ele domine a previsão.
   */
  const limite =
    p90 * 2.5;

  return serie.map(
    value =>
      Math.min(
        value,
        limite
      )
  );
}

/**
 * Calcula a previsão diária.
 */
export function calcularPrevisaoDemanda(
  produto: Produto,
  vendas: Venda[]
): number {
  if (!produto) {
    return 0;
  }

  const serie =
    construirSerieDiaria(
      produto,
      vendas,
      DIAS_HISTORICO
    );

  const serieTratada =
    limitarOutlier(
      serie
    );

  const media60 =
    media(
      serieTratada
    );

  const media30 =
    media(
      serieTratada.slice(
        -DIAS_MEDIO
      )
    );

  const media14 =
    media(
      serieTratada.slice(
        -DIAS_RECENTE
      )
    );

  const mediaRecentePonderada =
    mediaPonderadaRecencia(
      serieTratada
    );

  const suavizada =
    suavizacaoExponencial(
      serieTratada,
      0.20
    );

  /**
   * Combinação de horizontes.
   *
   * 60 dias:
   * estabilidade de longo prazo.
   *
   * 30 dias:
   * comportamento intermediário.
   *
   * 14 dias:
   * comportamento recente.
   *
   * Recência ponderada:
   * reação contínua às mudanças.
   *
   * EWMA:
   * suavização.
   */
  let previsao =
    media60 * 0.20 +
    media30 * 0.25 +
    media14 * 0.30 +
    mediaRecentePonderada * 0.15 +
    suavizada * 0.10;

  const diasComVenda =
    serie.filter(
      value => value > 0
    ).length;

  const total =
    serie.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  /**
   * Sem histórico:
   * não inventamos demanda.
   *
   * O engine poderá classificar como
   * NEW_PRODUCT / baixa confiança.
   */
  if (
    total <= 0 ||
    diasComVenda === 0
  ) {
    return 0;
  }

  /**
   * Pouquíssimos dados:
   * reduzimos a agressividade da previsão.
   *
   * Isso evita que:
   *
   * 1 venda de 20 unidades
   *
   * seja interpretada como:
   *
   * 20 unidades/dia.
   */
  if (
    diasComVenda <= 2
  ) {
    const mediaCalendario =
      total /
      DIAS_HISTORICO;

    previsao =
      previsao * 0.35 +
      mediaCalendario * 0.65;
  } else if (
    diasComVenda <= 5
  ) {
    const mediaCalendario =
      total /
      DIAS_HISTORICO;

    previsao =
      previsao * 0.55 +
      mediaCalendario * 0.45;
  } else if (
    diasComVenda <= 10
  ) {
    const mediaCalendario =
      total /
      DIAS_HISTORICO;

    previsao =
      previsao * 0.75 +
      mediaCalendario * 0.25;
  }

  /**
   * Tendência.
   *
   * Se os 14 dias recentes estão muito acima
   * dos 60 dias, fazemos uma pequena correção.
   */
  if (
    media60 > 0
  ) {
    const tendencia =
      (
        media14 -
        media60
      ) /
      media60;

    /**
     * Limitamos a influência da tendência
     * para evitar explosões artificiais.
     */
    const fator =
      clamp(
        1 +
          tendencia *
            0.30,
        0.80,
        1.30
      );

    previsao *=
      fator;
  }

  /**
   * Proteção final contra valores inválidos.
   */
  if (
    !Number.isFinite(
      previsao
    ) ||
    previsao <= 0
  ) {
    return 0;
  }

  return Math.round(
    previsao * 100
  ) / 100;
}
