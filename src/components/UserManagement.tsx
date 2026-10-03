import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Mail, ShieldCheck, User, Users } from 'lucide-react';
import type { AssinaturaLoja } from '../lib/assinatura';
import { configuracaoDoPlano, planoPermitePapel } from '../lib/plans';
import type { Role } from '../lib/rbac';

type TeamMember = {
  id: string;
  email: string;
  nome?: string;
  role: Role;
  status: string;
};

async function mensagemDaFuncao(error: unknown) {
  const contexto = (error as { context?: Response })?.context;
  if (contexto && typeof contexto.clone === 'function') {
    try {
      const corpo = await contexto.clone().json() as { error?: string };
      if (corpo.error) return corpo.error;
    } catch { /* usa a mensagem padrão */ }
  }
  return error instanceof Error ? error.message : String(error);
}

export function UserManagement({ assinatura }: { assinatura?: AssinaturaLoja }) {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [role, setRole] = useState<Role>('atendente');
  const [loading, setLoading] = useState(false);
  const plano = configuracaoDoPlano(assinatura?.plano);
  const ativos = useMemo(() => users.filter(user => user.status === 'ativo').length, [users]);
  const limiteAtingido = ativos >= plano.limiteUsuarios;

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from('perfis').select('id,email,nome,role,status').order('nome');
    if (error) toast(`Erro ao carregar equipe: ${error.message}`, 'danger');
    if (data) setUsers(data as TeamMember[]);
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    if (!planoPermitePapel(plano.id, role)) setRole('atendente');
  }, [plano.id, role]);

  const convidarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (limiteAtingido) {
      toast(`O plano ${plano.nome} permite até ${plano.limiteUsuarios} usuários ativos.`, 'danger');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('convite-usuario', { body: { email, nome, role } });
      if (error) throw error;
      toast('Convite enviado e usuário vinculado à loja.');
      setEmail('');
      setNome('');
      await fetchUsers();
    } catch (error: unknown) {
      toast(`Erro ao convidar: ${await mensagemDaFuncao(error)}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2"><Users className="text-cyan-600" /><h2 className="text-2xl font-bold">Equipe</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">Convide colaboradores sem compartilhar a senha do proprietário.</p>
        </div>
        <div className="rounded-xl border bg-muted/40 px-5 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano {plano.nome}</p>
          <p className="mt-1 text-xl font-bold">{ativos} de {plano.limiteUsuarios} ativos</p>
        </div>
      </section>

      <form onSubmit={convidarUsuario} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div>
          <h3 className="font-semibold">Convidar novo usuário</h3>
          <p className="mt-1 text-xs text-muted-foreground">O novo perfil receberá automaticamente a loja e o papel selecionado.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <input type="text" placeholder="Nome" value={nome} onChange={event => setNome(event.target.value)} className="rounded-lg border bg-background p-2.5 text-sm" required />
          <input type="email" placeholder="E-mail" value={email} onChange={event => setEmail(event.target.value)} className="rounded-lg border bg-background p-2.5 text-sm" required />
          <select value={role} onChange={event => setRole(event.target.value as Role)} className="rounded-lg border bg-background p-2.5 text-sm">
            <option value="atendente">Atendente</option>
            {planoPermitePapel(plano.id, 'gerente') && <option value="gerente">Gerente</option>}
            {planoPermitePapel(plano.id, 'entregador') && <option value="entregador">Entregador</option>}
          </select>
          <button disabled={loading || limiteAtingido} className="flex items-center justify-center gap-2 rounded-lg bg-primary p-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <Mail size={16} /> {loading ? 'Enviando…' : limiteAtingido ? 'Limite atingido' : 'Enviar convite'}
          </button>
        </div>
        {limiteAtingido && <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Para adicionar outro usuário, desative um perfil ou mude de plano.</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4"><h3 className="font-semibold">Usuários da loja</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="p-3 text-left">Usuário</th><th className="p-3 text-left">Cargo</th><th className="p-3 text-left">Status</th></tr></thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-t">
                  <td className="p-3"><span className="flex items-center gap-2"><User size={16} className="text-muted-foreground" /><span><strong className="block font-medium">{user.nome || 'Sem nome'}</strong><span className="text-xs text-muted-foreground">{user.email}</span></span></span></td>
                  <td className="p-3 capitalize"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} />{user.role}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>{user.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
