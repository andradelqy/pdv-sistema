// src/components/UserManagement.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

export function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('perfis').select('*').then(({ data }) => setUsers(data || []));
  }, []);

  // NOTA: Esta função não funcionará no frontend diretamente sem uma Edge Function
  // pois requer service_role_key. O correto é chamar uma Edge Function aqui.
  const convidarUsuario = async (email: string, role: string) => {
    toast('Integre com uma Supabase Edge Function para envio seguro de e-mails.', 'warning');
    console.log('Chamar Edge Function para convidar:', email, role);
  };

  return (
    <div className="p-6 bg-card rounded-xl border">
      <h2 className="text-xl font-bold mb-4">Usuários</h2>
      <div className="space-y-4">
        {users.map(u => (
          <div key={u.id} className="flex justify-between p-3 border rounded">
            <span>{u.email} - {u.role}</span>
            <span className={u.status === 'ativo' ? 'text-green-500' : 'text-red-500'}>{u.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
