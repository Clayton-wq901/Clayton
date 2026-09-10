/**
 * Persistência blindada dos resultados da varredura (selos/probabilidades por jogo).
 * Grava no banco (ai_predictions, market = "scan_snapshot") assim que a varredura roda
 * e relê tudo ao abrir o site — sem gastar nenhuma requisição da API-Football.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ScanPrediction } from "./market-filter";

const MARKET_KEY = "scan_snapshot";
const WINDOW_MS = 48 * 60 * 60 * 1000;

export const saveScanPredictions = createServerFn({ method: "POST" })
  .inputValidator((d: { predictions: ScanPrediction[] }) => d)
  .handler(async ({ data }) => {
    const rows = (data.predictions ?? []).filter((p) => p && Number.isFinite(p.fixtureId));
    if (!rows.length) return { saved: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = rows.map((p) => p.fixtureId);

    // Substitui o snapshot anterior de cada jogo (upsert manual — sem chave única na tabela)
    await supabaseAdmin.from("ai_predictions").delete().eq("market", MARKET_KEY).in("fixture_id", ids);

    const { error } = await supabaseAdmin.from("ai_predictions").insert(
      rows.map((p) => ({
        fixture_id: p.fixtureId,
        market: MARKET_KEY,
        probability: Math.round((p.bestProb ?? 0) * 100),
        score: 0,
        features: p as unknown as never,
      })),
    );
    if (error) throw new Error(error.message);
    return { saved: rows.length };
  });

/** Lê os selos já calculados (últimas 48h) direto do banco — leitura instantânea. */
export const loadScanPredictions = createServerFn({ method: "GET" }).handler(async (): Promise<ScanPrediction[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("ai_predictions")
    .select("fixture_id, features, created_at")
    .eq("market", MARKET_KEY)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const seen = new Set<number>();
  const out: ScanPrediction[] = [];
  for (const row of data ?? []) {
    const id = Number(row.fixture_id);
    if (seen.has(id)) continue;
    const f = row.features as unknown as ScanPrediction | null;
    if (!f || typeof f !== "object") continue;
    seen.add(id);
    out.push({ ...f, fixtureId: id });
  }
  return out;
});
