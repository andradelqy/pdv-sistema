// src/components/UserManagement.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Mail, User } from 'lucide-react';

type TeamMember = {
  id: string;
  email: string;
  nome?: string;
  role: 'owner' | 'gerente' | 'atendente' | 'entregador';
  status: string;
};

export function UserManagement() {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('atendente');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('perfis').select('id,email,nome,role,status').order('nome');
    if (error) toast(`Erro ao carregar equipe: ${error.message}`, 'danger');
    if (data) setUsers(data as TeamMember[]);
  };

  useEffect(() => { fetchUsers(); }, []);

  const convidarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('convite-usuario', {
        body: { email, role }
      });
      if (error) throw error;
      toast('Convite enviado com sucesso!');
      setEmail('');
    } catch (error: unknown) {
      toast(`Erro ao convidar: ${error instanceof Error ? error.message : String(error)}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Gerenciar Usuários</h2>
      
      <form onSubmit={convidarUsuario} className="bg-white p-6 rounded-xl border space-y-4">
        <h3 className="font-semibold">Convidar novo usuário</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="p-2 border rounded" required />
          <select value={role} onChange={e => setRole(e.target.value)} className="p-2 border rounded">
            <option value="atendente">Atendente</option>
            <option value="gerente">Gerente</option>
            <option value="entregador">Entregador</option>
          </select>
          <button disabled={loading} className="bg-primary text-white p-2 rounded flex items-center justify-center gap-2">
            <Mail size={16}/> Enviar Convite
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Usuário</th>
              <th className="p-3 text-left">Cargo</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t">
                <td className="p-3 flex items-center gap-2"><User size={16}/> {u.email}</td>
                <td className="p-3 capitalize">{u.role}</td>
                <td className="p-3">{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
