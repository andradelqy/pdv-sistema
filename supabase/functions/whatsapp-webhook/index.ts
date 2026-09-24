import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

async function assinaturaValida(raw: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = `sha256=${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const valido = url.searchParams.get("hub.mode") === "subscribe"
        && url.searchParams.get("hub.verify_token") === Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
      return valido ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Verificação inválida.", { status: 403 });
    }
    if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });

    const appSecret = Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET");
    if (!appSecret) return new Response("META_APP_SECRET não configurado.", { status: 503 });
    const raw = await req.text();
    if (!(await assinaturaValida(raw, req.headers.get("x-hub-signature-256"), appSecret))) return new Response("Assinatura inválida.", { status: 401 });

    const payload = JSON.parse(raw);
    const atualizados = new Set<string>();
    for (const entry of payload?.entry || []) for (const change of entry?.changes || []) for (const statusMeta of change?.value?.statuses || []) {
      const mapa: Record<string, string> = { sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou" };
      const novoStatus = mapa[statusMeta.status];
      if (!novoStatus || !statusMeta.id) continue;
      const agora = new Date(Number(statusMeta.timestamp || Date.now() / 1000) * 1000).toISOString();
      const patch: Record<string, unknown> = { status: novoStatus };
      if (novoStatus === "entregue") patch.entregue_em = agora;
      if (novoStatus === "lido") patch.lido_em = agora;
      if (novoStatus === "falhou") patch.erro = statusMeta.errors?.[0]?.title || "Falha informada pela Meta.";
      const { data } = await ctx.supabaseAdmin.from("campanha_destinatarios").update(patch)
        .eq("whatsapp_message_id", statusMeta.id).select("campanha_id").maybeSingle();
      if (data?.campanha_id) atualizados.add(data.campanha_id);
    }

    for (const campanhaId of atualizados) {
      const { data } = await ctx.supabaseAdmin.from("campanha_destinatarios").select("status").eq("campanha_id", campanhaId);
      const status = (data || []).map((item: { status: string }) => item.status);
      await ctx.supabaseAdmin.from("campanhas_whatsapp").update({
        total_enviados: status.filter((item: string) => ["enviado", "entregue", "lido"].includes(item)).length,
        total_entregues: status.filter((item: string) => ["entregue", "lido"].includes(item)).length,
        total_lidos: status.filter((item: string) => item === "lido").length,
        total_falhas: status.filter((item: string) => item === "falhou").length,
      }).eq("id", campanhaId);
    }
    return Response.json({ received: true });
  }),
};
