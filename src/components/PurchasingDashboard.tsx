import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fmtR } from '../lib/store';
import { TrendingUp, BarChart } from 'lucide-react';

export function PurchasingDashboard({ onModeChange }: { onModeChange: (m: string) => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [modo, setModo] = useState('recommendation');

  const atualizarModo = async (novoModo: string) => {
      setModo(novoModo);
      onModeChange(novoModo);
      await supabase.from('config_agente').upsert({ loja_id: 'chegoudrinks', modo: novoModo });
  }

  // ... (dentro do JSX)
  <select value={modo} onChange={e => atualizarModo(e.target.value)} className="border p-2 rounded">
      <option value="recommendation">Recomendação</option>
      <option value="controlled">Controlado</option>
      <option value="autonomous">Autônomo</option>
  </select>

  useEffect(() => {
    supabase.from('log_decisoes_compra')
      .select('*')
      .order('data_decisao', { ascending: false })
      .limit(10)
      .then(({ data }) => setLogs(data || []));
  }, []);

  const totalVec = logs.reduce((acc, log) => acc + (log.confianca_score > 80 ? log.detalhes_decisao.vec || 0 : 0), 0);

  return (
    <div className="p-6 bg-white rounded-xl border space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Painel de Auditoria do Agente</h2>
        <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg font-bold">
          Potencial Retorno (VEC): {fmtR(totalVec)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-xl bg-slate-50">
            <h4 className="flex items-center gap-2 font-bold"><TrendingUp size={18}/> Dinheiro na Mesa</h4>
            <p className="text-sm text-slate-600">Representa o lucro que seria gerado se o estoque estivesse otimizado conforme a sugestão do agente.</p>
        </div>
        <div className="p-4 border rounded-xl bg-slate-50">
            <h4 className="flex items-center gap-2 font-bold"><BarChart size={18}/> Risco Global</h4>
            <p className="text-sm text-slate-600">Baseado na confiança das previsões e volatilidade dos SKUs.</p>
        </div>
      </div>

      <div className="overflow-hidden border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Decisão</th>
              <th className="p-3">Confiança</th>
              <th className="p-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-t">
                <td className="p-3">{new Date(log.data_decisao).toLocaleDateString()}</td>
                <td className="p-3 font-semibold">{log.decisao_tomada}</td>
                <td className="p-3 text-center">{log.confianca_score}%</td>
                <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">{JSON.stringify(log.detalhes_decisao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
