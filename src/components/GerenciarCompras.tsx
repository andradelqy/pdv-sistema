import { useStore } from '../lib/store';
import { CheckCircle } from 'lucide-react';

export function GerenciarCompras() {
  const { pedidosCompra, receberPedidoCompra } = useStore();

  return (
    <div className="p-6 bg-white rounded-xl border">
      <h2 className="text-xl font-bold mb-4">Pedidos em Trânsito</h2>
      <div className="space-y-4">
        {pedidosCompra.filter(p => p.status !== 'received').map(p => (
          <div key={p.id} className="p-4 border rounded-lg flex justify-between items-center">
            <div>
              <p className="font-bold">Pedido #{p.id.slice(-4)}</p>
              <p className="text-sm">Itens: {p.itens.length}</p>
            </div>
            <button
              onClick={() => receberPedidoCompra(p.id)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg"
            >
              <CheckCircle size={18}/> Confirmar Recebimento
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
