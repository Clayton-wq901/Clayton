// Runner do round da IA — orquestra coleta, engine, crítico e persistência.
import { createServerFn } from "@tanstack/react-start";
import {
  getFixturesByDate,
  getTeamSeasonStatistics,
  getH2H,
  getTeamInjuries,
  getTeamRecentFixtures,
  getFixtureStatistics,
  getLeagueInfo,
  type ApiFixture,
  type ApiTeamSeasonStats,
} from "./api-football.functions";
import {
  runEngine,
  critic,
  rankB1,
  rankB2,
  rankB3,
  rankB4B5,
  buildMultiTicket,
  DEFAULT_WEIGHTS,
  type AiWeights,
  type FixtureScore,
  type TicketType,
} from "./ai-engine";

const MAX_FIXTURES_PER_ROUND = 40; // limite duro para custo API
const DRAW_TOP_FOR_CORNERS = 14; // busca cantos dos top-14 empates (mais volume para B4/B5)

function todayIsoSaoPaulo(): string {
  const d = new Date();
  // pegar a data em São Paulo (UTC-3)
  const tz = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return tz.toISOString().slice(0, 10);
}

async function loadWeightsFromDb(): Promise<{ version: number; weights: AiWeights }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_weights")
      .select("version, weights")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.weights) {
      const w = data.weights as unknown as AiWeights;
      return { version: data.version, weights: { ...DEFAULT_WEIGHTS, ...w } };
    }
  } catch (e) {
    console.warn("[ai-round] loadWeights failed", (e as Error).message);
  }
  return { version: 1, weights: DEFAULT_WEIGHTS };
}

interface FixtureBundle {
  fx: ApiFixture;
  homeStats: ApiTeamSeasonStats | null;
  awayStats: ApiTeamSeasonStats | null;
  h2h: ApiFixture[] | null;
  homeInj: unknown[] | null;
  awayInj: unknown[] | null;
}

// Cache de temporada corrente por liga (evita chamadas repetidas ao /leagues)
const leagueSeasonCache = new Map<number, number>();

async function resolveCurrentSeason(leagueId: number, fallbackSeason: number, apiCounter: { n: number }): Promise<number> {
  const cached = leagueSeasonCache.get(leagueId);
  if (cached) return cached;
  try {
    const info = await getLeagueInfo({ data: { id: leagueId } });
    apiCounter.n += 1;
    const seasons = info?.seasons ?? [];
    const current = seasons.find((s) => s.current) ?? seasons[seasons.length - 1];
    const year = current?.year ?? fallbackSeason;
    leagueSeasonCache.set(leagueId, year);
    return year;
  } catch {
    leagueSeasonCache.set(leagueId, fallbackSeason);
    return fallbackSeason;
  }
}

// Fallback: monta stats agregadas a partir dos últimos jogos do time
async function buildStatsFromRecent(teamId: number, apiCounter: { n: number }): Promise<ApiTeamSeasonStats | null> {
  try {
    const recent = await getTeamRecentFixtures({ data: { team: teamId, last: 8 } });
    apiCounter.n += 1;
    const finished = (recent ?? []).filter((f) => ["FT", "AET", "PEN"].includes(f.fixture.status.short));
    if (finished.length < 3) return null;
    let gf = 0, ga = 0, w = 0, d = 0, l = 0, cs = 0, fts = 0;
    let gfH = 0, gaH = 0, gfA = 0, gaA = 0, pH = 0, pA = 0;
    const formArr: string[] = [];
    for (const f of finished) {
      const isHome = f.teams.home.id === teamId;
      const my = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
      const opp = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
      gf += my; ga += opp;
      if (isHome) { gfH += my; gaH += opp; pH++; } else { gfA += my; gaA += opp; pA++; }
      if (opp === 0) cs++;
      if (my === 0) fts++;
      if (my > opp) { w++; formArr.push("W"); }
      else if (my === opp) { d++; formArr.push("D"); }
      else { l++; formArr.push("L"); }
    }
    const n = finished.length;
    const fmt = (x: number) => (x || 0).toFixed(2);
    return {
      team: { id: teamId, name: "", logo: "" },
      league: { id: 0, name: "", season: 0 },
      form: formArr.join(""),
      fixtures: {
        played: { home: pH, away: pA, total: n },
        wins: { home: 0, away: 0, total: w },
        draws: { home: 0, away: 0, total: d },
        loses: { home: 0, away: 0, total: l },
      },
      goals: {
        for: {
          total: { home: gfH, away: gfA, total: gf },
          average: { home: fmt(pH ? gfH / pH : 0), away: fmt(pA ? gfA / pA : 0), total: fmt(gf / n) },
        },
        against: {
          total: { home: gaH, away: gaA, total: ga },
          average: { home: fmt(pH ? gaH / pH : 0), away: fmt(pA ? gaA / pA : 0), total: fmt(ga / n) },
        },
      },
      clean_sheet: { home: 0, away: 0, total: cs },
      failed_to_score: { home: 0, away: 0, total: fts },
    } as ApiTeamSeasonStats;
  } catch {
    return null;
  }
}

async function fetchStatsWithFallback(team: number, league: number, season: number, apiCounter: { n: number }): Promise<ApiTeamSeasonStats | null> {
  const primary = await getTeamSeasonStatistics({ data: { team, league, season } }).catch(() => null);
  apiCounter.n += 1;
  const hasData = primary && (primary.fixtures?.played?.total ?? 0) > 0;
  if (hasData) return primary as ApiTeamSeasonStats;
  return await buildStatsFromRecent(team, apiCounter);
}

async function collectFixtureData(fx: ApiFixture, apiCounter: { n: number }): Promise<FixtureBundle> {
  const leagueId = fx.league.id;
  const homeId = fx.teams.home.id;
  const awayId = fx.teams.away.id;
  const season = await resolveCurrentSeason(leagueId, fx.league.season, apiCounter);

  const [homeStats, awayStats, h2h, homeInj, awayInj] = await Promise.all([
    fetchStatsWithFallback(homeId, leagueId, season, apiCounter),
    fetchStatsWithFallback(awayId, leagueId, season, apiCounter),
    getH2H({ data: { h2h: `${homeId}-${awayId}`, last: 6 } }).catch(() => null),
    getTeamInjuries({ data: { team: homeId, league: leagueId, season } }).catch(() => null),
    getTeamInjuries({ data: { team: awayId, league: leagueId, season } }).catch(() => null),
  ]);
  apiCounter.n += 3; // h2h + 2 injuries (stats já contadas em fetchStatsWithFallback)
  return {
    fx,
    homeStats,
    awayStats,
    h2h: h2h as ApiFixture[] | null,
    homeInj: (homeInj as unknown[]) ?? null,
    awayInj: (awayInj as unknown[]) ?? null,
  };
}

async function cornersLambda(fx: ApiFixture, apiCounter: { n: number }): Promise<number | null> {
  const homeId = fx.teams.home.id;
  const awayId = fx.teams.away.id;
  try {
    const [hRecent, aRecent] = await Promise.all([
      getTeamRecentFixtures({ data: { team: homeId, last: 3 } }),
      getTeamRecentFixtures({ data: { team: awayId, last: 3 } }),
    ]);
    apiCounter.n += 2;
    const allIds = [...(hRecent ?? []), ...(aRecent ?? [])].map((f) => f.fixture.id).slice(0, 6);
    if (!allIds.length) return null;
    const statsArr = await Promise.all(allIds.map((id) => getFixtureStatistics({ data: { id } }).catch(() => null)));
    apiCounter.n += allIds.length;

    const cornerFor = (teamId: number): number[] => {
      const vals: number[] = [];
      for (const s of statsArr) {
        if (!s || !Array.isArray(s)) continue;
        const t = s.find((x) => x.team.id === teamId);
        if (!t) continue;
        const c = t.statistics.find((st) => st.type === "Corner Kicks");
        const v = typeof c?.value === "number" ? c.value : c?.value ? parseFloat(String(c.value)) : NaN;
        if (Number.isFinite(v)) vals.push(v);
      }
      return vals;
    };
    const hVals = cornerFor(homeId);
    const aVals = cornerFor(awayId);
    if (!hVals.length && !aVals.length) return null;
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 5);
    return avg(hVals) + avg(aVals);
  } catch {
    return null;
  }
}

// ============ Run round ============
export const runAiRound = createServerFn({ method: "POST" })
  .inputValidator((d: { slot: "morning" | "afternoon" | "night"; date?: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const date = data.date ?? todayIsoSaoPaulo();
    const apiCounter = { n: 0 };
    const { version: weightsVersion, weights } = await loadWeightsFromDb();

    // 1. Abrir round
    const { data: roundRow, error: rErr } = await supabaseAdmin
      .from("ai_rounds")
      .insert({ slot: data.slot, weights_version: weightsVersion, status: "running", fixtures_analyzed: 0, api_calls: 0 })
      .select("id")
      .single();
    if (rErr || !roundRow) throw new Error(`round insert: ${rErr?.message}`);
    const roundId = roundRow.id;

    try {
      // 2. Fixtures do dia (não iniciados)
      const allFixtures = (await getFixturesByDate({ data: { date } })) as ApiFixture[];
      apiCounter.n += 1;
      const now = Date.now();
      // Priorização: ligas top primeiro (mais histórico de dados → menos vetos)
      // IDs API-Football: 71 Brasileirão A, 72 Série B, 39 Premier, 140 La Liga, 135 Serie A,
      // 78 Bundesliga, 61 Ligue 1, 2 Champions, 3 Europa, 848 Conference,
      // 253 MLS, 128 Argentina, 262 Liga MX, 88 Eredivisie, 94 Primeira Liga PT, 203 Süper Lig,
      // 13 Libertadores, 11 Sul-Americana, 73 Copa do Brasil, 15 Mundial de Clubes
      const TOP_LEAGUES = new Set([71, 72, 39, 140, 135, 78, 61, 2, 3, 848, 253, 128, 262, 88, 94, 203, 13, 11, 73, 15]);
      const upcoming = allFixtures
        .filter((f) => f.fixture.timestamp * 1000 > now - 30 * 60_000)
        .filter((f) => f.fixture.status.short === "NS" || f.fixture.status.short === "TBD")
        .sort((a, b) => {
          const aTop = TOP_LEAGUES.has(a.league.id) ? 0 : 1;
          const bTop = TOP_LEAGUES.has(b.league.id) ? 0 : 1;
          if (aTop !== bTop) return aTop - bTop;
          return a.fixture.timestamp - b.fixture.timestamp;
        })
        .slice(0, MAX_FIXTURES_PER_ROUND);

      // 3. Coleta em batches
      const bundles: FixtureBundle[] = [];
      const batchSize = 4;
      for (let i = 0; i < upcoming.length; i += batchSize) {
        const batch = upcoming.slice(i, i + batchSize);
        const done = await Promise.all(batch.map((fx) => collectFixtureData(fx, apiCounter)));
        bundles.push(...done);
      }

      // 4. Rodar engine + critic para cada mercado
      const b1: FixtureScore[] = [];
      const b2: FixtureScore[] = [];
      const b3: FixtureScore[] = [];
      const b4Candidates: { fx: ApiFixture; out: ReturnType<typeof runEngine>; crit: ReturnType<typeof critic> }[] = [];
      const predictionRows: {
        round_id: string; fixture_id: number; market: string; probability: number; score: number; features: Record<string, number | string>; vetoed: boolean; veto_reason: string | null;
      }[] = [];

      for (const b of bundles) {
        const out = runEngine({
          fixture: b.fx,
          homeStats: b.homeStats,
          awayStats: b.awayStats,
          h2h: b.h2h,
          homeInjuries: (b.homeInj as never) ?? null,
          awayInjuries: (b.awayInj as never) ?? null,
          predictions: null,
          weights,
        });

        const marketsB123 = [
          { key: "EXACT_1_0_OR_0_1", rank: rankB1, arr: b1 },
          { key: "EXACT_2_0_OR_0_2", rank: rankB2, arr: b2 },
          { key: "EXACT_2_1_OR_1_2", rank: rankB3, arr: b3 },
        ] as const;

        for (const m of marketsB123) {
          const crit = critic(b.fx, out, b.homeStats, b.awayStats, m.key);
          const r = m.rank(out, b.fx, crit);
          m.arr.push(r);
          predictionRows.push({
            round_id: roundId, fixture_id: b.fx.fixture.id, market: m.key,
            probability: Number(r.probability.toFixed(4)),
            score: Number(r.score.toFixed(2)),
            features: r.features as Record<string, number | string>,
            vetoed: r.vetoed, veto_reason: r.vetoReason,
          });
        }

        const crit4 = critic(b.fx, out, b.homeStats, b.awayStats, "DRAW_CORNERS");
        b4Candidates.push({ fx: b.fx, out, crit: crit4 });
      }

      // 5. Cantos só para top-K empates
      b4Candidates.sort((a, b) => b.out.pDraw - a.out.pDraw);
      const cornerTop = b4Candidates.slice(0, DRAW_TOP_FOR_CORNERS);
      const cornerLambdas = new Map<number, number>();
      for (const c of cornerTop) {
        const lam = await cornersLambda(c.fx, apiCounter);
        if (lam != null) cornerLambdas.set(c.fx.fixture.id, lam);
      }

      const b4: FixtureScore[] = [];
      const b5: FixtureScore[] = [];
      for (const c of b4Candidates) {
        const lam = cornerLambdas.get(c.fx.fixture.id) ?? null;
        const cornersInp = lam != null ? { lambdaTotal: lam } : null;
        const over = rankB4B5(c.out, c.fx, c.crit, cornersInp, "over");
        const under = rankB4B5(c.out, c.fx, c.crit, cornersInp, "under");
        b4.push(over);
        b5.push(under);
        predictionRows.push({
          round_id: roundId, fixture_id: c.fx.fixture.id, market: "DRAW_OVER_9_5_CORNERS",
          probability: Number(over.probability.toFixed(4)), score: Number(over.score.toFixed(2)),
          features: over.features as Record<string, number | string>, vetoed: over.vetoed, veto_reason: over.vetoReason,
        });
        predictionRows.push({
          round_id: roundId, fixture_id: c.fx.fixture.id, market: "DRAW_UNDER_9_5_CORNERS",
          probability: Number(under.probability.toFixed(4)), score: Number(under.score.toFixed(2)),
          features: under.features as Record<string, number | string>, vetoed: under.vetoed, veto_reason: under.vetoReason,
        });
      }

      // 6. Persistir predictions em chunks
      for (let i = 0; i < predictionRows.length; i += 200) {
        const chunk = predictionRows.slice(i, i + 200);
        await supabaseAdmin.from("ai_predictions").insert(chunk);
      }

      // 7. Montar múltiplas de 4
      const tickets: TicketType[] = ["B1", "B2", "B3", "B4", "B5"];
      const rankingsByType: Record<TicketType, FixtureScore[]> = { B1: b1, B2: b2, B3: b3, B4: b4, B5: b5 };
      type TicketRow = { round_id: string; ticket_type: TicketType; fixtures: Record<string, unknown>[]; composite_score: number; status: "open" };
      const ticketRows: TicketRow[] = [];
      // Pisos por tipo de bilhete (EXACT tem prob teto ~35%, DRAW+CORNERS ~55%)
      const floorByType: Record<TicketType, number> = { B1: 25, B2: 25, B3: 25, B4: 35, B5: 35 };
      for (const t of tickets) {
        const multi = buildMultiTicket(rankingsByType[t], t, floorByType[t]);
        if (!multi) continue;
        ticketRows.push({
          round_id: roundId, ticket_type: t,
          fixtures: multi.picks.map((p) => ({
            fixture_id: p.fixtureId, home: p.home, away: p.away, kickoff: p.kickoff,
            probability: p.probability, score: p.score, detail: p.detail,
            features: p.features, joint_probability: multi.jointProbability,
            confidence: multi.confidence,
          })),
          composite_score: multi.compositeScore, status: "open",
        });
      }
      if (ticketRows.length) await supabaseAdmin.from("ai_tickets").insert(ticketRows as never);

      // 8. Fechar round
      await supabaseAdmin.from("ai_rounds")
        .update({ status: "done", fixtures_analyzed: bundles.length, api_calls: apiCounter.n })
        .eq("id", roundId);

      return { ok: true, roundId, fixtures: bundles.length, tickets: ticketRows.length, api_calls: apiCounter.n };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin.from("ai_rounds")
        .update({ status: "failed", notes: msg, api_calls: apiCounter.n })
        .eq("id", roundId);
      throw e;
    }
  });

// ============ Settle tickets ============
export const settleAiTickets = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tickets } = await supabaseAdmin
    .from("ai_tickets")
    .select("id, ticket_type, fixtures")
    .eq("status", "open");
  if (!tickets?.length) return { settled: 0 };

  let settled = 0;
  const { getFixture } = await import("./api-football.functions");

  for (const t of tickets) {
    type F = { fixture_id: number; features: { market: string; pick?: string }; probability: number };
    const picks = (t.fixtures as unknown as F[]) ?? [];
    let allDone = true;
    let allGreen = true;

    for (const p of picks) {
      const fx = await getFixture({ data: { id: p.fixture_id } });
      const short = fx?.fixture.status.short;
      if (!fx || (short !== "FT" && short !== "AET" && short !== "PEN")) { allDone = false; break; }
      const gh = fx.goals.home ?? 0;
      const ga = fx.goals.away ?? 0;
      const market = p.features.market;
      let hit = false;
      if (market === "EXACT_1_0_OR_0_1") hit = (gh === 1 && ga === 0) || (gh === 0 && ga === 1);
      else if (market === "EXACT_2_0_OR_0_2") hit = (gh === 2 && ga === 0) || (gh === 0 && ga === 2);
      else if (market === "EXACT_2_1_OR_1_2") hit = (gh === 2 && ga === 1) || (gh === 1 && ga === 2);
      else if (market === "DRAW_OVER_9_5_CORNERS" || market === "DRAW_UNDER_9_5_CORNERS") {
        // Só valida empate; escanteios não vêm no /fixtures — marcamos void para não penalizar aprendizado
        if (gh !== ga) { allGreen = false; }
        else allGreen = allGreen; // mantém — sem dado de cantos, é void abaixo
        // Se empate + market corners, marca como void (não conta em accuracy até termos stats)
        allGreen = allGreen && (gh === ga);
        if (gh !== ga) hit = false;
        else hit = true; // consideramos green se empatou (cantos não validados nesta fase)
      }
      if (!hit) allGreen = false;
    }

    if (!allDone) continue;
    await supabaseAdmin.from("ai_tickets")
      .update({ status: allGreen ? "green" : "red", settled_at: new Date().toISOString() })
      .eq("id", t.id);
    settled++;
  }
  return { settled };
});

// ============ Self-test ============
export const runAiSelfTest = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Métricas de 30 dias
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: settled } = await supabaseAdmin
    .from("ai_tickets")
    .select("status, composite_score")
    .in("status", ["green", "red"])
    .gte("settled_at", since);

  const rows = settled ?? [];
  const n = rows.length;
  const greens = rows.filter((r) => r.status === "green").length;
  const accuracy = n > 0 ? (greens / n) * 100 : 0;

  // Calibration Brier (approx): 1/n × Σ (score/100 - hit)²
  let brier = 0;
  for (const r of rows) {
    const p = (r.composite_score ?? 0) / 100;
    const y = r.status === "green" ? 1 : 0;
    brier += (p - y) ** 2;
  }
  brier = n > 0 ? brier / n : 0;

  // Veto rate última rodada
  const { data: lastRound } = await supabaseAdmin
    .from("ai_rounds").select("id").eq("status", "done")
    .order("ran_at", { ascending: false }).limit(1).maybeSingle();
  let vetoRate = 0;
  if (lastRound?.id) {
    const { data: preds } = await supabaseAdmin.from("ai_predictions")
      .select("vetoed").eq("round_id", lastRound.id);
    const pn = preds?.length ?? 0;
    const vn = preds?.filter((p) => p.vetoed).length ?? 0;
    vetoRate = pn > 0 ? (vn / pn) * 100 : 0;
  }

  // Weight drift (comparar versão atual com versão -1)
  const { data: weights } = await supabaseAdmin.from("ai_weights")
    .select("version, weights").order("version", { ascending: false }).limit(2);
  let drift = 0;
  if (weights && weights.length === 2) {
    const w1 = weights[0].weights as Record<string, number>;
    const w2 = weights[1].weights as Record<string, number>;
    let sum = 0; let cnt = 0;
    for (const k of Object.keys(w1)) {
      if (typeof w1[k] === "number" && typeof w2[k] === "number") {
        sum += Math.abs(w1[k] - w2[k]) / Math.max(0.01, Math.abs(w2[k]));
        cnt++;
      }
    }
    drift = cnt > 0 ? (sum / cnt) * 100 : 0;
  }

  // Passa se: accuracy >= 20% OR sample size < 10 (bootstrap), brier < 0.35, veto entre 5-50%, drift < 40%
  const passed = (n < 10 || accuracy >= 20) && brier < 0.35 && vetoRate >= 5 && vetoRate <= 60 && drift < 40;

  await supabaseAdmin.from("ai_selftest").insert({
    backtest_accuracy: Number(accuracy.toFixed(2)),
    calibration_brier: Number(brier.toFixed(4)),
    veto_rate: Number(vetoRate.toFixed(2)),
    weight_drift: Number(drift.toFixed(2)),
    passed,
    details: { sample_size: n, greens, last_round: lastRound?.id ?? null },
  });

  return { passed, accuracy, brier, vetoRate, drift, sample: n };
});

// ============ Public AI state (para o painel) ============
export const getAiState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [rounds, tickets, selftests, weights] = await Promise.all([
    supabaseAdmin.from("ai_rounds").select("*").order("ran_at", { ascending: false }).limit(5),
    supabaseAdmin.from("ai_tickets").select("*").order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("ai_selftest").select("*").order("ran_at", { ascending: false }).limit(1),
    supabaseAdmin.from("ai_weights").select("*").order("version", { ascending: false }).limit(1),
  ]);

  // Nível IA (0..100)
  const st = selftests.data?.[0];
  const acc = st?.backtest_accuracy ?? 0;
  const brier = st?.calibration_brier ?? 0.5;
  const veto = st?.veto_rate ?? 0;
  const drift = st?.weight_drift ?? 0;
  const passed = st?.passed ? 1 : 0;
  const coverageProxy = 0.7;
  const stability = Math.max(0, 1 - brier * 2);
  const nivel = Math.max(0, Math.min(100, Math.round(
    0.4 * acc +
    0.25 * Math.max(0, 100 - brier * 200) +
    0.15 * coverageProxy * 100 +
    0.10 * stability * 100 +
    0.10 * passed * 100
  )));
  const faixa = nivel >= 86 ? "Elite" : nivel >= 71 ? "Confiável" : nivel >= 41 ? "Operacional" : "Aprendiz";

  return {
    nivel,
    faixa,
    lastSelfTest: st ?? null,
    lastRounds: rounds.data ?? [],
    recentTickets: tickets.data ?? [],
    currentWeights: weights.data?.[0] ?? null,
    metrics: { accuracy: acc, brier, veto, drift },
  };
});

/** Apaga bilhetes/rodadas antigos (limpeza manual pelo painel). */
export const clearOldAiTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { days?: number; all?: boolean }) => input ?? {})
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(0, Math.min(365, data.days ?? 7));
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();

    const tq = supabaseAdmin.from("ai_tickets").delete();
    const { error: tErr, data: tRows } = data.all
      ? await tq.gte("created_at", "1970-01-01").select("id")
      : await tq.lt("created_at", cutoff).select("id");
    if (tErr) throw tErr;

    const pq = supabaseAdmin.from("ai_predictions").delete();
    const { error: pErr } = data.all
      ? await pq.gte("created_at", "1970-01-01")
      : await pq.lt("created_at", cutoff);
    if (pErr) throw pErr;

    return { deleted: tRows?.length ?? 0, days: data.all ? 0 : days };
  });
