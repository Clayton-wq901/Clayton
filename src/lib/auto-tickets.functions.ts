/**
 * Módulo 3 — Server functions dos Bilhetes Automáticos.
 * Client-safe: só o corpo dos handlers roda no servidor.
 */
import { createServerFn } from "@tanstack/react-start";

export interface AutoTicketRow {
  id: string;
  fixture_id: number;
  kickoff: string;
  league: string | null;
  home: string;
  away: string;
  home_logo: string | null;
  away_logo: string | null;
  picks: {
    market: string;
    selection: string;
    prob: number;
    odd: number;
    status?: "green" | "red" | "void";
    evidence?: string;
  }[];
  meta: (Record<string, number | string | undefined> & { headline?: string; flow?: string }) | null;
  result_snapshot: {
    home_score: number;
    away_score: number;
    ht_home_score: number | null;
    ht_away_score: number | null;
    total_corners: number | null;
    total_cards: number | null;
    first_goal: "home" | "away" | "none" | null;
    reason: string;
  } | null;
  status: string;
  greens: number;
  reds: number;
  accuracy: number | null;
}

/** Processa um lote pequeno e espaçado (carga inicial e incremental). */
export const runAutoTickets = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { runAutoTicketsBatch } = await import("./auto-tickets.server");
    const limit = Math.min(Math.max(data.limit ?? 5, 1), 10);
    return await runAutoTicketsBatch(limit);
  });

/** Conferência manual: liquida bilhetes de jogos já encerrados (lote maior). */
export const gradeAutoTickets = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { gradePending, overduePendingCount, purgeExpiredCache } = await import("./auto-tickets.server");
    const limit = Math.min(Math.max(data.limit ?? 400, 50), 800);
    const graded = await gradePending(limit);
    await purgeExpiredCache().catch(() => 0);
    return { ok: true, graded, backlog: await overduePendingCount() };
  });

/** Status compacto da carga das próximas 24h (mini painel + selo "IA Pronta"). */
export const autoTicketStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("auto_tickets")
    .select("fixture_id, status")
    .gte("kickoff", from)
    .lte("kickoff", until)
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { fixture_id: number; status: string }[];
  const ready = rows.filter((r) => r.status !== "skipped");
  const processed = rows.length;
  const coverage = processed ? Math.round((ready.length / processed) * 100) : 0;
  return {
    ready: ready.length,
    total: processed,
    coverage,
    ids: ready.map((r) => Number(r.fixture_id)),
  };
});

/** Lista TODOS os bilhetes salvos (sem teto artificial) — paginação interna. */
export const listAutoTickets = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const cols =
    "id, fixture_id, kickoff, league, home, away, home_logo, away_logo, picks, meta, result_snapshot, status, greens, reds, accuracy";
  const out: AutoTicketRow[] = [];
  const page = 500;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin
      .from("auto_tickets")
      .select(cols)
      .gte("kickoff", from)
      .neq("status", "skipped")
      .order("kickoff", { ascending: true })
      .range(i * page, i * page + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as AutoTicketRow[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
});

export interface MarketAccuracyRow {
  market: string;
  total: number;
  greens: number;
  reds: number;
  voids: number;
  accuracy: number;
}

/** Ranking histórico de assertividade por mercado (todos os bilhetes conferidos). */
export const marketAccuracy = createServerFn({ method: "GET" }).handler(async (): Promise<MarketAccuracyRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agg = new Map<string, { g: number; r: number; v: number }>();
  const page = 500;
  for (let i = 0; i < 40; i++) {
    const { data, error } = await supabaseAdmin
      .from("auto_tickets")
      .select("picks")
      .eq("status", "graded")
      .order("graded_at", { ascending: false })
      .range(i * page, i * page + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { picks: { market: string; status?: string }[] }[];
    for (const row of rows) {
      for (const p of row.picks ?? []) {
        if (!p?.market) continue;
        const cur = agg.get(p.market) ?? { g: 0, r: 0, v: 0 };
        if (p.status === "green") cur.g++;
        else if (p.status === "red") cur.r++;
        else cur.v++;
        agg.set(p.market, cur);
      }
    }
    if (rows.length < page) break;
  }
  return [...agg.entries()]
    .map(([market, v]) => ({
      market,
      total: v.g + v.r + v.v,
      greens: v.g,
      reds: v.r,
      voids: v.v,
      accuracy: v.g + v.r ? v.g / (v.g + v.r) : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
});
