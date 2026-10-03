import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function planoNormalizado(valor?: string) {
  const plano = valor?.trim().toLowerCase();
  if (plano === 'basico') return 'basico';
  if (plano === 'pro' || plano === 'teste' || plano === 'trial') return 'pro';
  return 'empresarial';
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || Deno.env.get('MY_PROJECT_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('MY_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !serviceKey) return json({ error: 'Configuração do servidor incompleta.' }, 500);
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sessão inválida.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authorization.slice('Bearer '.length);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

  try {
    const body = await req.json() as { email?: string; nome?: string; role?: string };
    const email = body.email?.trim().toLowerCase();
    const nome = body.nome?.trim();
    const role = body.role?.trim().toLowerCase();
    if (!email || !nome || !role) return json({ error: 'Informe nome, e-mail e cargo.' }, 400);
    if (!['gerente', 'atendente', 'entregador'].includes(role)) return json({ error: 'Cargo inválido.' }, 400);

    const { data: gestor, error: gestorError } = await admin
      .from('perfis').select('id,loja_id,role,status').eq('id', authData.user.id).single();
    if (gestorError || !gestor?.loja_id || gestor.status !== 'ativo') return json({ error: 'Perfil do gestor não encontrado.' }, 403);
    if (gestor.role !== 'owner') return json({ error: 'Somente o proprietário pode convidar usuários.' }, 403);

    const { data: assinatura, error: assinaturaError } = await admin
      .from('assinaturas_lojas').select('plano').eq('loja_id', gestor.loja_id).single();
    if (assinaturaError) return json({ error: 'Não foi possível validar o plano da loja.' }, 409);

    const plano = planoNormalizado(assinatura.plano);
    const limite = plano === 'basico' ? 2 : plano === 'pro' ? 7 : 20;
    if (plano === 'basico' && role !== 'atendente') {
      return json({ error: 'O plano Básico permite apenas owner e atendente.' }, 409);
    }

    const { count, error: countError } = await admin
      .from('perfis').select('id', { head: true, count: 'exact' })
      .eq('loja_id', gestor.loja_id).eq('status', 'ativo');
    if (countError) return json({ error: 'Não foi possível conferir o limite da equipe.' }, 500);
    if ((count || 0) >= limite) return json({ error: `O plano ${plano} permite até ${limite} usuários ativos.` }, 409);

    const redirectTo = Deno.env.get('SITE_URL');
    const { data: convite, error: conviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome, role, loja_id: gestor.loja_id },
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (conviteError || !convite.user) return json({ error: conviteError?.message || 'Não foi possível enviar o convite.' }, 400);

    const { error: perfilError } = await admin.from('perfis').upsert({
      id: convite.user.id,
      email,
      nome,
      role,
      loja_id: gestor.loja_id,
      status: 'ativo',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (perfilError) {
      await admin.auth.admin.deleteUser(convite.user.id);
      return json({ error: `Convite cancelado: ${perfilError.message}` }, 409);
    }

    return json({ ok: true, usuario_id: convite.user.id, limite, usuarios_ativos: (count || 0) + 1 });
  } catch (error) {
    console.error('convite-usuario', error);
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado ao convidar.' }, 400);
  }
});
