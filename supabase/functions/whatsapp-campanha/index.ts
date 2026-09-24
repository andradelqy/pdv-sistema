import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { descriptografarToken } from "../_shared/whatsapp-token.ts";

type Destinatario = { id: string; nome: string; telefone_e164: string };
type Campanha = {
  id: string;
  loja_id: string;
  mensagem: string;
  template_nome: string;
  template_idioma: string;
  ofertas: null | { nome: string; titulo: string; descricao: string; imagem_url: string | null; validade_fim: string | null };
};

function personalizar(texto: string, destinatario: Destinatario, campanha: Campanha) {
  const oferta = campanha.ofertas;
  const validade = oferta?.validade_fim
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(oferta.validade_fim))
    : "enquanto durarem os estoques";
  return texto
    .replaceAll("{nome}", destinatario.nome)
    .replaceAll("{oferta}", oferta?.titulo || oferta?.nome || "oferta especial")
    .replaceAll("{descricao}", oferta?.descricao || "")
    .replaceAll("{validade}", validade);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
    const { campanhaId } = await req.json().catch(() => ({ campanhaId: "" })) as { campanhaId?: string };
    if (!campanhaId) return Response.json({ error: "campanhaId é obrigatório." }, { status: 400 });

    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v25.0";
    const encryptionKey = Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY");
    if (!encryptionKey) return Response.json({ error: "Criptografia do WhatsApp não configurada na plataforma." }, { status: 503 });

    const userId = ctx.userClaims?.sub;
    const { data: perfil } = await ctx.supabase.from("perfis").select("loja_id,role").eq("id", userId).single();
    if (!perfil || !["owner", "gerente"].includes(perfil.role)) {
      return Response.json({ error: "Somente owner ou gerente pode enviar campanhas." }, { status: 403 });
    }

    const { data: campanhaData, error: campanhaError } = await ctx.supabase
      .from("campanhas_whatsapp")
      .select("id,loja_id,mensagem,template_nome,template_idioma,ofertas(nome,titulo,descricao,imagem_url,validade_fim)")
      .eq("id", campanhaId).eq("loja_id", perfil.loja_id).single();
    if (campanhaError || !campanhaData) return Response.json({ error: "Campanha não encontrada nesta loja." }, { status: 404 });
    const campanha = campanhaData as unknown as Campanha;

    const { data: config } = await ctx.supabase.from("whatsapp_configuracoes")
      .select("phone_number_id,ativo").eq("loja_id", perfil.loja_id).single();
    if (!config?.ativo || !config.phone_number_id) {
      return Response.json({ error: "Conecte o WhatsApp Business desta loja antes de enviar campanhas." }, { status: 409 });
    }

    const { data: credencial, error: credencialError } = await ctx.supabaseAdmin
      .from("whatsapp_credenciais")
      .select("access_token_ciphertext,access_token_iv,token_expira_em,phone_number_id")
      .eq("loja_id", perfil.loja_id).maybeSingle();
    if (credencialError || !credencial) {
      return Response.json({ error: "A conexão desta loja não possui uma credencial válida. Reconecte o WhatsApp." }, { status: 409 });
    }
    if (credencial.phone_number_id !== config.phone_number_id) {
      return Response.json({ error: "A identificação do WhatsApp está inconsistente. Reconecte a conta." }, { status: 409 });
    }
    if (credencial.token_expira_em && new Date(credencial.token_expira_em).getTime() <= Date.now()) {
      return Response.json({ error: "A autorização da Meta expirou. Reconecte o WhatsApp desta loja." }, { status: 409 });
    }
    let token: string;
    try {
      token = await descriptografarToken(credencial.access_token_ciphertext, credencial.access_token_iv, encryptionKey);
    } catch {
      return Response.json({ error: "Não foi possível abrir a credencial desta loja. Reconecte o WhatsApp." }, { status: 409 });
    }

    const { data: destinatariosData, error: destinatariosError } = await ctx.supabase
      .from("campanha_destinatarios").select("id,nome,telefone_e164")
      .eq("campanha_id", campanha.id).eq("status", "pendente").limit(50);
    if (destinatariosError) return Response.json({ error: destinatariosError.message }, { status: 400 });
    const destinatarios = (destinatariosData || []) as Destinatario[];
    if (!destinatarios.length) return Response.json({ error: "A campanha não possui destinatários pendentes." }, { status: 409 });

    await ctx.supabaseAdmin.from("campanhas_whatsapp").update({
      status: "processando", iniciado_em: new Date().toISOString(),
    }).eq("id", campanha.id);

    let enviados = 0;
    let falhas = 0;
    for (const destinatario of destinatarios) {
      await ctx.supabaseAdmin.from("campanha_destinatarios").update({ status: "enviando", erro: null }).eq("id", destinatario.id);
      const components: Array<Record<string, unknown>> = [];
      if (campanha.ofertas?.imagem_url) {
        components.push({ type: "header", parameters: [{ type: "image", image: { link: campanha.ofertas.imagem_url } }] });
      }
      components.push({
        type: "body",
        parameters: [{ type: "text", text: personalizar(campanha.mensagem, destinatario, campanha).slice(0, 1024) }],
      });

      try {
        const response = await fetch(`https://graph.facebook.com/${graphVersion}/${config.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", recipient_type: "individual",
            to: destinatario.telefone_e164.replace("+", ""), type: "template",
            template: { name: campanha.template_nome, language: { code: campanha.template_idioma }, components },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || `Meta respondeu HTTP ${response.status}`);
        await ctx.supabaseAdmin.from("campanha_destinatarios").update({
          status: "enviado", whatsapp_message_id: result?.messages?.[0]?.id || null,
          enviado_em: new Date().toISOString(), erro: null,
        }).eq("id", destinatario.id);
        enviados += 1;
      } catch (error) {
        await ctx.supabaseAdmin.from("campanha_destinatarios").update({
          status: "falhou", erro: error instanceof Error ? error.message.slice(0, 1000) : "Falha desconhecida na Meta.",
        }).eq("id", destinatario.id);
        falhas += 1;
      }
    }

    const { data: todos } = await ctx.supabaseAdmin.from("campanha_destinatarios").select("status").eq("campanha_id", campanha.id);
    const status = (todos || []).map((item: { status: string }) => item.status);
    const pendentes = status.filter((item: string) => item === "pendente" || item === "enviando").length;
    const totalEnviados = status.filter((item: string) => ["enviado", "entregue", "lido"].includes(item)).length;
    const totalFalhas = status.filter((item: string) => item === "falhou").length;
    await ctx.supabaseAdmin.from("campanhas_whatsapp").update({
      status: pendentes > 0 || totalFalhas > 0 ? "concluida_parcial" : "concluida",
      total_enviados: totalEnviados, total_falhas: totalFalhas,
      concluido_em: pendentes > 0 ? null : new Date().toISOString(),
    }).eq("id", campanha.id);

    return Response.json({ ok: true, processados: destinatarios.length, enviados, falhas, pendentes });
  }),
};
