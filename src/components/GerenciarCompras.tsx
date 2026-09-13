import { useStore, fmtR } from '../lib/store';
import { CheckCircle, Send, XCircle } from 'lucide-react';

const statusLabel = {
  draft: 'Aguardando aprovação',
  pending: 'Aprovado / aguardando envio',
  in_transit: 'Em trânsito',
  received: 'Recebido',
  cancelled: 'Cancelado',
} as const;

export function GerenciarCompras() {
  const { pedidosCompra, atualizarStatusPedidoCompra, receberPedidoCompra } = useStore();
  const pedidosAtivos = pedidosCompra.filter(p => p.status !== 'received' && p.status !== 'cancelled');

  function cancelar(id: string) {
    if (!confirm('Cancelar este pedido? Ele deixará de contar como estoque em reposição.')) return;
    atualizarStatusPedidoCompra(id, 'cancelled');
  }

  return (
    <div className="p-6 bg-white rounded-xl border">
      <h2 className="text-xl font-bold mb-4">Pedidos de Compra</h2>
      {pedidosAtivos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum pedido pendente.</p>
      ) : (
        <div className="space-y-4">
          {pedidosAtivos.map(p => {
            const total = p.itens.reduce((soma, item) => soma + item.quantidade * item.precoCusto, 0);
            return (
              <div key={p.id} className="p-4 border rounded-lg flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold">Pedido #{p.id.slice(-4)} · {p.fornecedorId}</p>
                  <p className="text-sm text-slate-600">{statusLabel[p.status]} · {p.itens.length} item(ns) · {fmtR(total)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.status === 'draft' && (
                    <button onClick={() => atualizarStatusPedidoCompra(p.id, 'pending')} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg">
                      <Send size={16}/> Aprovar pedido
                    </button>
                  )}
                  {p.status !== 'draft' && (
                    <button onClick={() => receberPedidoCompra(p.id)} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg">
                      <CheckCircle size={16}/> Confirmar recebimento
                    </button>
                  )}
                  <button onClick={() => cancelar(p.id)} className="flex items-center gap-2 border border-destructive text-destructive px-4 py-2 rounded-lg hover:bg-destructive/10">
                    <XCircle size={16}/> Cancelar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
