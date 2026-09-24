import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { criptografarToken } from "../_shared/whatsapp-token.ts";

type Acao = "configuracao_publica" | "trocar_codigo" | "desconectar";

function envObrigatoria(nome: string, alternativa?: string) {
  const valor = Deno.env.get(nome) || (alternativa ? Deno.env.get(alternativa) : undefined);
  if (!valor) throw new Error(`${nome} não configurado nos Secrets do Supabase.`);
  return valor;
}

function mensagemSegura(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a conexão com a Meta.";
}

async function metaJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `A Meta respondeu HTTP ${response.status}.`);
  }
  return body;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });

    const userId = ctx.userClaims?.sub;
    const { data: perfil, error: perfilError } = await ctx.supabase
      .from("perfis").select("loja_id,role").eq("id", userId).single();
    if (perfilError || !perfil?.loja_id) {
      return Response.json({ error: "Não foi possível identificar a loja desta conta." }, { status: 403 });
    }
    if (perfil.role !== "owner") {
      return Response.json({ error: "Somente o proprietário da loja pode conectar ou remover o WhatsApp." }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({})) as {
      acao?: Acao;
      codigo?: string;
      businessAccountId?: string;
      phoneNumberId?: string;
      metaBusinessId?: string;
      pinRegistro?: string;
    };
    const acao = payload.acao;
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v25.0";

    if (acao === "configuracao_publica") {
      try {
        return Response.json({
          appId: envObrigatoria("META_APP_ID"),
          configId: envObrigatoria("META_EMBEDDED_SIGNUP_CONFIG_ID"),
          graphVersion,
        });
      } catch (error) {
        return Response.json({ error: mensagemSegura(error) }, { status: 503 });
      }
    }

    if (acao === "desconectar") {
      const { error: deleteError } = await ctx.supabaseAdmin.from("whatsapp_credenciais")
        .delete().eq("loja_id", perfil.loja_id);
      if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });
      await ctx.supabaseAdmin.from("whatsapp_configuracoes").upsert({
        loja_id: perfil.loja_id,
        phone_number_id: null,
        business_account_id: null,
        nome_exibicao: null,
        meta_business_id: null,
        status_conexao: "desconectado",
        conectado_em: null,
        ultimo_erro: null,
        ativo: false,
        atualizado_por: userId,
      });
      return Response.json({ ok: true });
    }

    if (acao !== "trocar_codigo") {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    const codigo = payload.codigo?.trim();
    const businessAccountId = payload.businessAccountId?.trim();
    const phoneNumberId = payload.phoneNumberId?.trim();
    const pinRegistro = payload.pinRegistro?.trim();
    if (!/^\d{6}$/.test(pinRegistro || "")) {
      return Response.json({ error: "Crie um PIN numérico de 6 dígitos para registrar o número." }, { status: 400 });
    }
    if (!codigo || !businessAccountId || !phoneNumberId ||
      !/^\d+$/.test(businessAccountId) || !/^\d+$/.test(phoneNumberId)) {
      return Response.json({ error: "A Meta não retornou todos os dados necessários da conta." }, { status: 400 });
    }

    await ctx.supabaseAdmin.from("whatsapp_configuracoes").upsert({
      loja_id: perfil.loja_id,
      status_conexao: "conectando",
      ultimo_erro: null,
      atualizado_por: userId,
    });

    try {
      const appId = envObrigatoria("META_APP_ID");
      const appSecret = envObrigatoria("META_APP_SECRET", "WHATSAPP_APP_SECRET");
      const encryptionKey = envObrigatoria("WHATSAPP_TOKEN_ENCRYPTION_KEY");
      const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code: codigo });
      const redirectUri = Deno.env.get("META_OAUTH_REDIRECT_URI");
      if (redirectUri) params.set("redirect_uri", redirectUri);

      const tokenResult = await metaJson(
        `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`,
      );
      const accessToken = String(tokenResult.access_token || "");
      if (!accessToken) throw new Error("A Meta não retornou o token da conta.");

      const authHeaders = { Authorization: `Bearer ${accessToken}` };
      const [telefone, numeros] = await Promise.all([
        metaJson(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`, { headers: authHeaders }),
        metaJson(`https://graph.facebook.com/${graphVersion}/${businessAccountId}/phone_numbers?fields=id&limit=100`, { headers: authHeaders }),
      ]);
      const pertenceAConta = Array.isArray(numeros?.data) && numeros.data.some((item: { id?: string }) => String(item.id) === phoneNumberId);
      if (!pertenceAConta || String(telefone?.id) !== phoneNumberId) {
        throw new Error("O número selecionado não pertence à conta empresarial autorizada.");
      }

      await metaJson(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/register`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin: pinRegistro }),
      });

      await metaJson(`https://graph.facebook.com/${graphVersion}/${businessAccountId}/subscribed_apps`, {
        method: "POST", headers: authHeaders,
      });

      const tokenCriptografado = await criptografarToken(accessToken, encryptionKey);
      const tokenExpiraEm = Number(tokenResult.expires_in) > 0
        ? new Date(Date.now() + Number(tokenResult.expires_in) * 1000).toISOString()
        : null;
      const { error: credencialError } = await ctx.supabaseAdmin.from("whatsapp_credenciais").upsert({
        loja_id: perfil.loja_id,
        access_token_ciphertext: tokenCriptografado.ciphertext,
        access_token_iv: tokenCriptografado.iv,
        token_expira_em: tokenExpiraEm,
        business_account_id: businessAccountId,
        phone_number_id: phoneNumberId,
      });
      if (credencialError) throw new Error(credencialError.message);

      const { error: configError } = await ctx.supabaseAdmin.from("whatsapp_configuracoes").upsert({
        loja_id: perfil.loja_id,
        phone_number_id: phoneNumberId,
        business_account_id: businessAccountId,
        meta_business_id: payload.metaBusinessId?.trim() || null,
        nome_exibicao: telefone?.verified_name || telefone?.display_phone_number || null,
        status_conexao: "conectado",
        conectado_em: new Date().toISOString(),
        ultimo_erro: null,
        ativo: true,
        webhook_verificado: true,
        atualizado_por: userId,
      });
      if (configError) throw new Error(configError.message);

      return Response.json({
        ok: true,
        nomeExibicao: telefone?.verified_name || "WhatsApp Business",
        telefone: telefone?.display_phone_number || null,
      });
    } catch (error) {
      const mensagem = mensagemSegura(error).slice(0, 1000);
      await ctx.supabaseAdmin.from("whatsapp_configuracoes").upsert({
        loja_id: perfil.loja_id,
        status_conexao: "erro",
        ultimo_erro: mensagem,
        ativo: false,
        atualizado_por: userId,
      });
      return Response.json({ error: mensagem }, { status: 400 });
    }
  }),
};
