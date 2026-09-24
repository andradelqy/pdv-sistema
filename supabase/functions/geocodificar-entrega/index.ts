import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

function normalizar(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
    const userId = ctx.userClaims?.sub;
    const { data: perfil } = await ctx.supabase.from("perfis").select("loja_id,role").eq("id", userId).single();
    if (!perfil?.loja_id || !["owner", "gerente", "atendente"].includes(perfil.role)) {
      return Response.json({ error: "Usuário sem permissão para calcular a entrega." }, { status: 403 });
    }
    const payload = await req.json().catch(() => ({})) as { endereco?: string };
    const endereco = payload.endereco?.trim();
    if (!endereco || endereco.length < 5 || endereco.length > 300) {
      return Response.json({ error: "Informe um endereço válido." }, { status: 400 });
    }
    const chave = normalizar(endereco);
    const [{ data: config }, { data: cache }] = await Promise.all([
      ctx.supabase.from("config_entregas").select("latitude_origem,longitude_origem,contexto_geocodificacao,velocidade_media_kmh").eq("loja_id", perfil.loja_id).maybeSingle(),
      ctx.supabase.from("geocodificacao_cache").select("lat,lng,atualizado_em").eq("loja_id", perfil.loja_id).eq("endereco_normalizado", chave).maybeSingle(),
    ]);
    let lat = cache ? Number(cache.lat) : NaN;
    let lng = cache ? Number(cache.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const contexto = String(config?.contexto_geocodificacao || "Brasil");
      const query = new URLSearchParams({ format: "jsonv2", q: `${endereco}, ${contexto}`, countrycodes: "br", limit: "1" });
      const appContact = Deno.env.get("GEOCODING_CONTACT") || "suporte@orbita.app";
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
        headers: { "User-Agent": `Orbita-PDV/2.0 (${appContact})`, "Accept-Language": "pt-BR" },
      });
      if (!response.ok) return Response.json({ error: "O serviço de endereços está indisponível." }, { status: 503 });
      const result = await response.json() as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!result.length) return Response.json({ error: "Endereço não encontrado. Complete rua, número, bairro e cidade." }, { status: 404 });
      lat = Number(result[0].lat);
      lng = Number(result[0].lon);
      await ctx.supabaseAdmin.from("geocodificacao_cache").upsert({
        loja_id: perfil.loja_id, endereco_normalizado: chave, lat, lng, provedor: "nominatim", atualizado_em: new Date().toISOString(),
      });
    }
    const origemLat = Number(config?.latitude_origem);
    const origemLng = Number(config?.longitude_origem);
    const km = Number.isFinite(origemLat) && Number.isFinite(origemLng) ? Math.max(0.5, distanciaKm(origemLat, origemLng, lat, lng)) : null;
    const velocidade = Math.max(5, Number(config?.velocidade_media_kmh || 25));
    return Response.json({ lat, lng, distanciaKm: km == null ? null : Number(km.toFixed(1)), etaMinutos: km == null ? null : Math.ceil(km / velocidade * 60 + 5), cache: Boolean(cache) });
  }),
};
