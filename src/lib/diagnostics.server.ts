/** Leitura server-only do estado real da plataforma (usada pelo Assistente de Diagnóstico). */
export interface PlatformSnapshot {
  generatedAt: string;
  tickets: { total24h: number; ready: number; skipped: number; pending: number; graded: number; coverage: number };
  performance: { greens: number; reds: number; accuracy: number };
  markets: { market: string; total: number; greens: number; reds: number; accuracy: number }[];
  scanSnapshots48h: number;
  lastRounds: { slot: string; status: string; ran_at: string; fixtures_analyzed: number; api_calls: number }[];
  cache: { entries: number; expired: number };
}

export async function getPlatformSnapshotRaw(): Promise<PlatformSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [ticketsRes, gradedRes, roundsRes, cacheRes, scanRes] = await Promise.all([
    supabaseAdmin.from("auto_tickets").select("status").gte("kickoff", from).lte("kickoff", until).limit(5000),
    supabaseAdmin
      .from("auto_tickets")
      .select("picks, greens, reds")
      .eq("status", "graded")
      .order("graded_at", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from("ai_rounds")
      .select("slot, status, ran_at, fixtures_analyzed, api_calls")
      .order("ran_at", { ascending: false })
      .limit(5),
    supabaseAdmin.from("api_cache").select("expires_at").limit(5000),
    supabaseAdmin
      .from("ai_predictions")
      .select("id", { count: "exact", head: true })
      .eq("market", "scan_snapshot")
      .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
  ]);

  const tRows = (ticketsRes.data ?? []) as { status: string }[];
  const skipped = tRows.filter((r) => r.status === "skipped").length;
  const pending = tRows.filter((r) => r.status === "pending").length;
  const gradedIn24h = tRows.filter((r) => r.status === "graded").length;
  const ready = tRows.length - skipped;

  const gRows = (gradedRes.data ?? []) as {
    picks: { market: string; status?: string }[];
    greens: number;
    reds: number;
  }[];
  const agg = new Map<string, { g: number; r: number; t: number }>();
  let greens = 0;
  let reds = 0;
  for (const row of gRows) {
    greens += row.greens ?? 0;
    reds += row.reds ?? 0;
    for (const p of row.picks ?? []) {
      if (!p?.market) continue;
      const cur = agg.get(p.market) ?? { g: 0, r: 0, t: 0 };
      cur.t++;
      if (p.status === "green") cur.g++;
      else if (p.status === "red") cur.r++;
      agg.set(p.market, cur);
    }
  }

  const cacheRows = (cacheRes.data ?? []) as { expires_at: string }[];
  const now = Date.now();

  return {
    generatedAt: new Date().toISOString(),
    tickets: {
      total24h: tRows.length,
      ready,
      skipped,
      pending,
      graded: gradedIn24h,
      coverage: tRows.length ? Math.round((ready / tRows.length) * 100) : 0,
    },
    performance: { greens, reds, accuracy: greens + reds ? greens / (greens + reds) : 0 },
    markets: [...agg.entries()]
      .map(([market, v]) => ({
        market,
        total: v.t,
        greens: v.g,
        reds: v.r,
        accuracy: v.g + v.r ? v.g / (v.g + v.r) : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total),
    scanSnapshots48h: scanRes.count ?? 0,
    lastRounds: (roundsRes.data ?? []) as PlatformSnapshot["lastRounds"],
    cache: {
      entries: cacheRows.length,
      expired: cacheRows.filter((c) => new Date(c.expires_at).getTime() < now).length,
    },
  };
}
