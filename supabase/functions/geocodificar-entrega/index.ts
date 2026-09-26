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

type LocalizacaoEncontrada = {
  lat: number;
  lng: number;
  enderecoEncontrado?: string;
  provedor: "nominatim" | "photon";
};

async function fetchComTimeout(url: string, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function enderecoDoPhoton(properties: Record<string, unknown>) {
  const rua = [properties.street, properties.housenumber].filter(Boolean).join(", ");
  const partes = [rua, properties.district, properties.city, properties.state, properties.postcode, properties.country]
    .filter((parte) => typeof parte === "string" || typeof parte === "number")
    .map((parte) => String(parte).trim())
    .filter(Boolean);
  return [...new Set(partes)].join(", ");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
    const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!userId) return Response.json({ error: "Sessão inválida. Entre novamente no sistema." }, { status: 401 });

    // A autenticação já foi validada pelo gateway. As consultas internas usam o
    // cliente administrativo e continuam estritamente limitadas ao usuário e à
    // loja identificados aqui, evitando que uma policy RLS recursiva interrompa
    // a geocodificação.
    const { data: perfil, error: perfilError } = await ctx.supabaseAdmin
      .from("perfis")
      .select("loja_id,role,status")
      .eq("id", userId)
      .maybeSingle();
    if (perfilError) {
      console.error("geocodificar-entrega: falha ao consultar perfil", perfilError.code);
      return Response.json({ error: "Não foi possível identificar a loja desta conta." }, { status: 500 });
    }
    if (!perfil?.loja_id || perfil.status !== "ativo" || !["owner", "gerente", "atendente"].includes(perfil.role)) {
      return Response.json({ error: "Usuário sem permissão para calcular a entrega." }, { status: 403 });
    }
    const payload = await req.json().catch(() => ({})) as { endereco?: string; contexto?: string };
    const endereco = payload.endereco?.trim();
    if (!endereco || endereco.length < 5 || endereco.length > 300) {
      return Response.json({ error: "Informe um endereço válido." }, { status: 400 });
    }
    const { data: config, error: configError } = await ctx.supabaseAdmin
      .from("config_entregas")
      .select("latitude_origem,longitude_origem,contexto_geocodificacao,velocidade_media_kmh")
      .eq("loja_id", perfil.loja_id)
      .maybeSingle();
    if (configError) return Response.json({ error: "Não foi possível ler a configuração desta loja." }, { status: 500 });

    const contextoInformado = payload.contexto?.trim();
    if (contextoInformado && contextoInformado.length > 160) {
      return Response.json({ error: "O contexto de busca é muito longo." }, { status: 400 });
    }
    const contexto = contextoInformado || String(config?.contexto_geocodificacao || "Brasil");
    const chave = normalizar(`${endereco} | ${contexto}`);
    const { data: cache, error: cacheError } = await ctx.supabaseAdmin
      .from("geocodificacao_cache")
      .select("lat,lng,atualizado_em")
      .eq("loja_id", perfil.loja_id)
      .eq("endereco_normalizado", chave)
      .maybeSingle();
    if (cacheError) return Response.json({ error: "Não foi possível consultar o cache de endereços." }, { status: 500 });
    let lat = cache ? Number(cache.lat) : NaN;
    let lng = cache ? Number(cache.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const textoBusca = `${endereco}, ${contexto}`;
      const query = new URLSearchParams({ format: "jsonv2", q: `${endereco}, ${contexto}`, countrycodes: "br", limit: "1", addressdetails: "1" });
      const appContact = Deno.env.get("GEOCODING_CONTACT") || "suporte@orbita.app";
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(appContact)) query.set("email", appContact);
      let localizacao: LocalizacaoEncontrada | null = null;
      let algumProvedorRespondeu = false;

      try {
        const response = await fetchComTimeout(`https://nominatim.openstreetmap.org/search?${query}`, {
          headers: {
            "User-Agent": `Orbita-PDV/2.0 (${appContact})`,
            "Accept": "application/json",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
        });
        if (response.ok) {
          algumProvedorRespondeu = true;
          const result = await response.json().catch(() => []) as Array<{ lat: string; lon: string; display_name?: string }>;
          const primeiro = result[0];
          if (primeiro) {
            localizacao = {
              lat: Number(primeiro.lat),
              lng: Number(primeiro.lon),
              enderecoEncontrado: primeiro.display_name,
              provedor: "nominatim",
            };
          }
        } else {
          console.warn("geocodificar-entrega: nominatim respondeu", response.status);
        }
      } catch (error) {
        console.warn("geocodificar-entrega: falha no nominatim", error instanceof Error ? error.name : "unknown");
      }

      // O Nominatim pode bloquear IPs compartilhados de datacenter. O Photon
      // usa a mesma base OpenStreetMap e mantém a busca disponível sem expor
      // credenciais ou retirar a autenticação da nossa Edge Function.
      if (!localizacao) {
        const photonQuery = new URLSearchParams({ q: textoBusca, limit: "1" });
        try {
          const response = await fetchComTimeout(`https://photon.komoot.io/api/?${photonQuery}`, {
            headers: { "User-Agent": "Orbita-PDV/2.0", "Accept": "application/json" },
          });
          if (response.ok) {
            algumProvedorRespondeu = true;
            const result = await response.json().catch(() => null) as {
              features?: Array<{
                geometry?: { coordinates?: unknown[] };
                properties?: Record<string, unknown>;
              }>;
            } | null;
            const primeiro = result?.features?.[0];
            const coordinates = primeiro?.geometry?.coordinates;
            const properties = primeiro?.properties ?? {};
            if (coordinates?.length && (!properties.countrycode || String(properties.countrycode).toUpperCase() === "BR")) {
              localizacao = {
                lat: Number(coordinates[1]),
                lng: Number(coordinates[0]),
                enderecoEncontrado: enderecoDoPhoton(properties),
                provedor: "photon",
              };
            }
          } else {
            console.warn("geocodificar-entrega: photon respondeu", response.status);
          }
        } catch (error) {
          console.warn("geocodificar-entrega: falha no photon", error instanceof Error ? error.name : "unknown");
        }
      }

      if (!localizacao) {
        return algumProvedorRespondeu
          ? Response.json({ error: `Endereço não encontrado em ${contexto}. Complete rua, número, bairro e cidade.` }, { status: 404 })
          : Response.json({ error: "Os serviços de mapas estão temporariamente indisponíveis. Tente novamente em instantes." }, { status: 503 });
      }
      lat = localizacao.lat;
      lng = localizacao.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return Response.json({ error: "O provedor retornou coordenadas inválidas." }, { status: 502 });
      }
      const { error: cacheWriteError } = await ctx.supabaseAdmin.from("geocodificacao_cache").upsert({
        loja_id: perfil.loja_id, endereco_normalizado: chave, lat, lng, provedor: localizacao.provedor, atualizado_em: new Date().toISOString(),
      });
      if (cacheWriteError) console.error("geocodificar-entrega: falha ao atualizar cache", cacheWriteError.code);
      const origemLat = Number(config?.latitude_origem);
      const origemLng = Number(config?.longitude_origem);
      const km = Number.isFinite(origemLat) && Number.isFinite(origemLng) ? Math.max(0.5, distanciaKm(origemLat, origemLng, lat, lng)) : null;
      const velocidade = Math.max(5, Number(config?.velocidade_media_kmh || 25));
      return Response.json({ lat, lng, enderecoEncontrado: localizacao.enderecoEncontrado, distanciaKm: km == null ? null : Number(km.toFixed(1)), etaMinutos: km == null ? null : Math.ceil(km / velocidade * 60 + 5), cache: false, provedor: localizacao.provedor });
    }
    const origemLat = Number(config?.latitude_origem);
    const origemLng = Number(config?.longitude_origem);
    const km = Number.isFinite(origemLat) && Number.isFinite(origemLng) ? Math.max(0.5, distanciaKm(origemLat, origemLng, lat, lng)) : null;
    const velocidade = Math.max(5, Number(config?.velocidade_media_kmh || 25));
    return Response.json({ lat, lng, distanciaKm: km == null ? null : Number(km.toFixed(1)), etaMinutos: km == null ? null : Math.ceil(km / velocidade * 60 + 5), cache: true });
  }),
};
