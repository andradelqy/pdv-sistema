import { describe, expect, it } from 'vitest';
import { calcularAtrasoRetry, chaveDedupeSync, normalizarFornecedorPedido, normalizarIdPedidoCompra } from './sync';

describe('fila automática de sincronização', () => {
  it('deduplica atualizações do mesmo registro e da mesma loja', () => {
    expect(chaveDedupeSync('upsertProduto', [{ id: 'produto-1' }, 'loja-a']))
      .toBe('upsertProduto:produto-1:loja-a');
    expect(chaveDedupeSync('deleteProduto', ['produto-1', 'loja-a']))
      .toBe('deleteProduto:produto-1:loja-a');
  });

  it('não deduplica lançamentos sem id e evita sobrescrever o caixa', () => {
    expect(chaveDedupeSync('insertCaixaEntrada', [{ valor: 10 }, 'loja-a'])).toBeNull();
    expect(chaveDedupeSync('insertCaixaEntrada', [{ valor: 20 }, 'loja-a'])).toBeNull();
  });

  it('aplica backoff exponencial com limite de um minuto', () => {
    expect(calcularAtrasoRetry(0)).toBe(2_000);
    expect(calcularAtrasoRetry(2)).toBe(8_000);
    expect(calcularAtrasoRetry(10)).toBe(60_000);
  });

  it('não envia placeholder de fornecedor para uma coluna UUID', () => {
    expect(normalizarFornecedorPedido({ fornecedorId: 'Fornecedor a definir' })).toEqual({
      fornecedorId: null,
      fornecedorNome: null,
    });
    expect(normalizarFornecedorPedido({ fornecedorId: 'Distribuidora antiga' })).toEqual({
      fornecedorId: null,
      fornecedorNome: 'Distribuidora antiga',
    });
  });

  it('converte id legado de pedido em UUID estável', async () => {
    const primeiro = await normalizarIdPedidoCompra('ped_67i7cq33q');
    const segundo = await normalizarIdPedidoCompra('ped_67i7cq33q');

    expect(primeiro).toBe(segundo);
    expect(primeiro).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
