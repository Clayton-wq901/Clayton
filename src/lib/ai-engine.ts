// Motor Analítico da IA de Fechamentos (Fase 2)
// Puro / sem I/O — recebe dados crus da API-Football e devolve probabilidades e scores.

import type {
  ApiFixture,
  ApiTeamSeasonStats,
  ApiInjury,
  ApiPrediction,
  ApiTeamStats,
} from "./api-football.functions";

// ============ Pesos (auto-calibrados na Fase 4) ============
export interface AiWeights {
  base_strength: number;
  form: number;
  h2h: number;
  injuries: number;
  predictions_api: number;
  home_advantage: number;
}

export const DEFAULT_WEIGHTS: AiWeights = {
  base_strength: 0.35,
  form: 0.2,
  h2h: 0.1,
  injuries: 0.15,
  predictions_api: 0.1,
  home_advantage: 0.1,
};

// ============ Poisson helpers ============
function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

export function poissonCdf(lambda: number, k: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += poisson(lambda, i);
  return Math.min(1, s);
}

// Correção Dixon-Coles: ajusta a dependência nos placares baixos (0-0, 1-0, 0-1, 1-1),
// onde o Poisson puro subestima a frequência real observada no futebol.
export const DC_RHO = -0.13;

export function dcTau(i: number, j: number, lh: number, la: number, rho = DC_RHO): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

export function scoreMatrix(lh: number, la: number, max = 6): number[][] {
  const m: number[][] = [];
  let total = 0;
  for (let i = 0; i <= max; i++) {
    m[i] = [];
    for (let j = 0; j <= max; j++) {
      const p = poisson(lh, i) * poisson(la, j) * Math.max(0.01, dcTau(i, j, lh, la));
      m[i][j] = p;
      total += p;
    }
  }
  // renormaliza para a matriz voltar a somar ~1 após o ajuste τ
  if (total > 0) for (let i = 0; i <= max; i++) for (let j = 0; j <= max; j++) m[i][j] /= total;
  return m;
}


// ============ Feature extraction ============
function num(v: string | number | null | undefined, def = 0): number {
  const n = typeof v === "number" ? v : v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

function formPct(form: string | null | undefined): number {
  if (!form) return 0.5;
  const last = form.slice(-5).split("");
  if (!last.length) return 0.5;
  const s = last.reduce((a, c) => a + (c === "W" ? 1 : c === "D" ? 0.5 : 0), 0);
  return s / last.length;
}

interface TeamFeatures {
  gfAvg: number;
  gaAvg: number;
  form: number;
  played: number;
  csRate: number;
  ftsRate: number;
}

function extract(stats: ApiTeamSeasonStats | null, side: "home" | "away"): TeamFeatures {
  if (!stats) return { gfAvg: 1.2, gaAvg: 1.2, form: 0.5, played: 0, csRate: 0, ftsRate: 0 };
  const playedSide = stats.fixtures.played[side] || 0;
  const played = stats.fixtures.played.total || 0;
  return {
    gfAvg: num(stats.goals.for.average[side]),
    gaAvg: num(stats.goals.against.average[side]),
    form: formPct(stats.form),
    played,
    csRate: playedSide > 0 ? stats.clean_sheet[side] / playedSide : 0,
    ftsRate: playedSide > 0 ? stats.failed_to_score[side] / playedSide : 0,
  };
}

// ============ Injury factor ============
function injuryFactor(injuries: ApiInjury[] | null): number {
  if (!injuries?.length) return 1.0;
  let severity = 0;
  for (const inj of injuries) {
    const reason = (inj.player?.reason ?? "").toLowerCase();
    const type = (inj.player?.type ?? "").toLowerCase();
    // Missing / injured hard = full weight; doubtful = half
    if (type.includes("missing") || reason.includes("injury")) severity += 1;
    else severity += 0.4;
  }
  // 5+ missing = 15% offense drop
  const drop = Math.min(0.15, severity * 0.025);
  return 1 - drop;
}

// ============ H2H factor ============
interface H2HSignal {
  drawsRate: number; // 0..1
  goalsAvg: number;
  bothScoredRate: number;
  n: number;
}

function h2hSignal(h2h: ApiFixture[] | null, homeId: number): H2HSignal {
  if (!h2h?.length) return { drawsRate: 0.25, goalsAvg: 2.5, bothScoredRate: 0.5, n: 0 };
  const done = h2h.filter((f) => f.goals.home != null && f.goals.away != null);
  if (!done.length) return { drawsRate: 0.25, goalsAvg: 2.5, bothScoredRate: 0.5, n: 0 };
  let draws = 0;
  let goals = 0;
  let bts = 0;
  for (const f of done) {
    const gh = f.goals.home ?? 0;
    const ga = f.goals.away ?? 0;
    if (gh === ga) draws++;
    if (gh > 0 && ga > 0) bts++;
    goals += gh + ga;
  }
  return { drawsRate: draws / done.length, goalsAvg: goals / done.length, bothScoredRate: bts / done.length, n: done.length };
}

// ============ Predictions API factor ============
function predictionsFactor(preds: ApiPrediction[] | null): { home: number; draw: number; away: number } | null {
  const p = preds?.[0]?.predictions?.percent;
  if (!p) return null;
  const h = num(p.home?.replace("%", ""));
  const d = num(p.draw?.replace("%", ""));
  const a = num(p.away?.replace("%", ""));
  const sum = h + d + a;
  if (sum <= 0) return null;
  return { home: h / sum, draw: d / sum, away: a / sum };
}

// ============ Corners Poisson (para B4/B5) ============
export interface CornersStats {
  homeAvgFor: number;
  homeAvgAgainst: number;
  awayAvgFor: number;
  awayAvgAgainst: number;
  n: number;
}

export function cornersFromFixtureStats(statsPerFixture: { homeId: number; awayId: number; teamStats: ApiTeamStats[] }[]): CornersStats {
  const acc = { hf: 0, ha: 0, af: 0, aa: 0, n: 0 };
  for (const row of statsPerFixture) {
    const teamCorners = (t: ApiTeamStats | undefined): number => {
      if (!t?.statistics) return 0;
      const c = t.statistics.find((s) => s.type === "Corner Kicks");
      return num(c?.value ?? 0);
    };
    const ht = row.teamStats.find((t) => t.team.id === row.homeId);
    const at = row.teamStats.find((t) => t.team.id === row.awayId);
    if (!ht || !at) continue;
    acc.hf += teamCorners(ht);
    acc.ha += teamCorners(at);
    acc.n += 1;
  }
  const n = acc.n || 1;
  return { homeAvgFor: acc.hf / n, homeAvgAgainst: acc.ha / n, awayAvgFor: acc.af / n, awayAvgAgainst: acc.aa / n, n: acc.n };
}

// ============ Compute lambdas with weight-aware adjustments ============
export interface EngineInput {
  fixture: ApiFixture;
  homeStats: ApiTeamSeasonStats | null;
  awayStats: ApiTeamSeasonStats | null;
  h2h?: ApiFixture[] | null;
  homeInjuries?: ApiInjury[] | null;
  awayInjuries?: ApiInjury[] | null;
  predictions?: ApiPrediction[] | null;
  weights?: AiWeights;
}

export interface EngineOutput {
  fixtureId: number;
  lambdaHome: number;
  lambdaAway: number;
  matrix: number[][];
  // Placares exatos
  pScore: Record<string, number>; // "1-0", "0-1", etc.
  // Resultados
  pHomeWin: number;
  pDraw: number;
  pAwayWin: number;
  // Totais gols
  pOver05: number;
  pOver15: number;
  pOver25: number;
  pOver35: number;
  pUnder15: number;
  pUnder25: number;
  // BTTS
  pBTTS: number;
  pNoBTTS: number;
  // Meta
  ready: boolean;
  coverage: number; // 0..1 — quão completos os dados foram
  features: Record<string, number | string>;
}

export function runEngine(inp: EngineInput): EngineOutput {
  const w = inp.weights ?? DEFAULT_WEIGHTS;
  const fx = inp.fixture;
  const fxId = fx.fixture.id;

  const H = extract(inp.homeStats, "home");
  const A = extract(inp.awayStats, "away");

  // Cobertura de dados
  const dataOk = (inp.homeStats ? 1 : 0) + (inp.awayStats ? 1 : 0);
  const h2hOk = inp.h2h && inp.h2h.length >= 2 ? 1 : 0;
  const injOk = inp.homeInjuries != null && inp.awayInjuries != null ? 1 : 0;
  const predOk = inp.predictions && inp.predictions.length ? 1 : 0;
  // Cobertura desconsidera H2H (muitos jogos sem confronto direto histórico)
  const coverage = (dataOk * 0.65 + injOk * 0.2 + predOk * 0.15) / 1;

  if (dataOk < 2) {
    // sem stats mínimos, devolve estrutura zerada
    const empty: Record<string, number> = {};
    return {
      fixtureId: fxId,
      lambdaHome: 0,
      lambdaAway: 0,
      matrix: [],
      pScore: empty,
      pHomeWin: 0,
      pDraw: 0,
      pAwayWin: 0,
      pOver05: 0,
      pOver15: 0,
      pOver25: 0,
      pOver35: 0,
      pUnder15: 0,
      pUnder25: 0,
      pBTTS: 0,
      pNoBTTS: 0,
      ready: false,
      coverage,
      features: { home_played: H.played, away_played: A.played },
    };
  }

  // Base lambda (ataque × defesa adversária)
  const baseH = Math.max(0.15, H.gfAvg * Math.max(0.5, A.gaAvg));
  const baseA = Math.max(0.15, A.gfAvg * Math.max(0.5, H.gaAvg));

  // Ajuste por forma (times em alta marcam mais, times em baixa sofrem mais)
  const formAdjH = 1 + (H.form - 0.5) * (w.form * 2); // ±w.form
  const formAdjA = 1 + (A.form - 0.5) * (w.form * 2);

  // Ajuste por lesões
  const injAdjH = injuryFactor(inp.homeInjuries ?? null);
  const injAdjA = injuryFactor(inp.awayInjuries ?? null);

  // Ajuste por mando (bônus casa)
  const homeAdj = 1 + w.home_advantage; // ex: +10%

  // Ajuste por H2H (se h2h médio bem acima/abaixo da média da liga → puxa)
  const h2hS = h2hSignal(inp.h2h ?? null, fx.teams.home.id);
  const h2hAdj = h2hS.n >= 3 ? 1 + (h2hS.goalsAvg / 2.5 - 1) * w.h2h : 1;

  let lh = baseH * formAdjH * injAdjH * homeAdj * h2hAdj;
  let la = baseA * formAdjA * injAdjA * h2hAdj;

  // Cross-check com Predictions API (média ponderada leve nos favoritos)
  const predP = predictionsFactor(inp.predictions ?? null);
  if (predP) {
    // Se predictions dá home muito favorito, empurra lh um pouco pra cima
    const bias = (predP.home - predP.away) * w.predictions_api;
    lh *= 1 + bias;
    la *= 1 - bias;
  }

  lh = Math.max(0.1, Math.min(5, lh));
  la = Math.max(0.1, Math.min(5, la));

  const m = scoreMatrix(lh, la, 6);

  // Placares exatos
  const pScore: Record<string, number> = {};
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) pScore[`${i}-${j}`] = m[i][j];

  // Resultados
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    if (i > j) pH += m[i][j];
    else if (i === j) pD += m[i][j];
    else pA += m[i][j];
  }

  // Totais
  let pOver05 = 0, pOver15 = 0, pOver25 = 0, pOver35 = 0;
  let pBTTS = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const total = i + j;
    const prob = m[i][j];
    if (total >= 1) pOver05 += prob;
    if (total >= 2) pOver15 += prob;
    if (total >= 3) pOver25 += prob;
    if (total >= 4) pOver35 += prob;
    if (i > 0 && j > 0) pBTTS += prob;
  }

  return {
    fixtureId: fxId,
    lambdaHome: lh,
    lambdaAway: la,
    matrix: m,
    pScore,
    pHomeWin: pH,
    pDraw: pD,
    pAwayWin: pA,
    pOver05,
    pOver15,
    pOver25,
    pOver35,
    pUnder15: 1 - pOver15,
    pUnder25: 1 - pOver25,
    pBTTS,
    pNoBTTS: 1 - pBTTS,
    ready: true,
    coverage,
    features: {
      home_form: H.form,
      away_form: A.form,
      home_gf: H.gfAvg,
      home_ga: H.gaAvg,
      away_gf: A.gfAvg,
      away_ga: A.gaAvg,
      inj_h: injAdjH,
      inj_a: injAdjA,
      h2h_n: h2hS.n,
      h2h_goals_avg: h2hS.goalsAvg,
      coverage,
    },
  };
}

// ============ Camada 3 — Supervisora (Critic) ============
export interface CriticResult {
  vetoed: boolean;
  reason: string | null;
  scoreMultiplier: number; // 0..1
}

export function critic(fx: ApiFixture, out: EngineOutput, homeStats: ApiTeamSeasonStats | null, awayStats: ApiTeamSeasonStats | null, market: string): CriticResult {
  if (!out.ready) return { vetoed: true, reason: "sem estatísticas mínimas", scoreMultiplier: 0 };
  if (out.coverage < 0.4) return { vetoed: true, reason: `cobertura de dados baixa (${(out.coverage * 100).toFixed(0)}%)`, scoreMultiplier: 0 };

  // Filtro de forma desativado — pré-temporada tem forma baixa por natureza,
  // deixamos o score/probabilidade decidirem sozinhos.


  let mult = 1;
  // Clássico regional / mesma cidade → penalidade em placares
  const homeVenueCity = fx.fixture.venue?.city?.toLowerCase();
  if (homeVenueCity && market.startsWith("EXACT_")) {
    // sem lista de rivalidades formal, penaliza levemente jogos com desvio de gols muito alto
    if (out.pOver25 > 0.85) mult *= 0.85;
  }

  return { vetoed: false, reason: null, scoreMultiplier: mult };
}

// ============ Ticket builders (B1..B5) ============
export type TicketType = "B1" | "B2" | "B3" | "B4" | "B5";

export interface FixtureScore {
  fixtureId: number;
  home: string;
  away: string;
  kickoff: string;
  probability: number; // prob agregada do mercado (0..1)
  score: number; // 0..100
  detail: string;
  vetoed: boolean;
  vetoReason: string | null;
  features: Record<string, number | string>;
}

function score01(p: number, cov: number, mult: number): number {
  // Mapeia prob → 0..100 com peso por cobertura e crítica
  const base = Math.max(0, Math.min(1, p));
  return Math.round(base * 100 * (0.6 + 0.4 * cov) * mult);
}

export function rankB1(out: EngineOutput, fx: ApiFixture, crit: CriticResult): FixtureScore {
  const p10 = out.pScore["1-0"] ?? 0;
  const p01 = out.pScore["0-1"] ?? 0;
  const best = p10 >= p01 ? { label: "1-0", p: p10 } : { label: "0-1", p: p01 };
  return {
    fixtureId: fx.fixture.id,
    home: fx.teams.home.name,
    away: fx.teams.away.name,
    kickoff: fx.fixture.date,
    probability: best.p,
    score: score01(best.p, out.coverage, crit.scoreMultiplier),
    detail: `Placar exato ${best.label}`,
    vetoed: crit.vetoed,
    vetoReason: crit.reason,
    features: { ...out.features, market: "EXACT_1_0_OR_0_1", pick: best.label },
  };
}

export function rankB2(out: EngineOutput, fx: ApiFixture, crit: CriticResult): FixtureScore {
  const p20 = out.pScore["2-0"] ?? 0;
  const p02 = out.pScore["0-2"] ?? 0;
  const best = p20 >= p02 ? { label: "2-0", p: p20 } : { label: "0-2", p: p02 };
  return {
    fixtureId: fx.fixture.id,
    home: fx.teams.home.name,
    away: fx.teams.away.name,
    kickoff: fx.fixture.date,
    probability: best.p,
    score: score01(best.p, out.coverage, crit.scoreMultiplier),
    detail: `Placar exato ${best.label}`,
    vetoed: crit.vetoed,
    vetoReason: crit.reason,
    features: { ...out.features, market: "EXACT_2_0_OR_0_2", pick: best.label },
  };
}

export function rankB3(out: EngineOutput, fx: ApiFixture, crit: CriticResult): FixtureScore {
  const p21 = out.pScore["2-1"] ?? 0;
  const p12 = out.pScore["1-2"] ?? 0;
  const best = p21 >= p12 ? { label: "2-1", p: p21 } : { label: "1-2", p: p12 };
  return {
    fixtureId: fx.fixture.id,
    home: fx.teams.home.name,
    away: fx.teams.away.name,
    kickoff: fx.fixture.date,
    probability: best.p,
    score: score01(best.p, out.coverage, crit.scoreMultiplier),
    detail: `Placar exato ${best.label}`,
    vetoed: crit.vetoed,
    vetoReason: crit.reason,
    features: { ...out.features, market: "EXACT_2_1_OR_1_2", pick: best.label },
  };
}

export function rankB4B5(out: EngineOutput, fx: ApiFixture, crit: CriticResult, corners: { lambdaTotal: number } | null, side: "over" | "under"): FixtureScore {
  const pDraw = out.pDraw;
  const pCorner = corners ? (side === "over" ? 1 - poissonCdf(corners.lambdaTotal, 9) : poissonCdf(corners.lambdaTotal, 9)) : 0.5;
  const p = pDraw * pCorner;
  return {
    fixtureId: fx.fixture.id,
    home: fx.teams.home.name,
    away: fx.teams.away.name,
    kickoff: fx.fixture.date,
    probability: p,
    score: score01(p, out.coverage, crit.scoreMultiplier * (corners ? 1 : 0.6)),
    detail: `Empate + ${side === "over" ? "Over" : "Under"} 9.5 escanteios${corners ? ` (λ=${corners.lambdaTotal.toFixed(1)})` : " (média estimada)"}`,
    vetoed: crit.vetoed || !corners,
    vetoReason: crit.reason ?? (!corners ? "sem histórico de escanteios" : null),
    features: { ...out.features, market: side === "over" ? "DRAW_OVER_9_5_CORNERS" : "DRAW_UNDER_9_5_CORNERS", corners_lambda: corners?.lambdaTotal ?? 0 },
  };
}

// Múltipla de 4 jogos: probabilidade conjunta = produto; score composto = média
export function buildMultiTicket(
  rankings: FixtureScore[],
  type: TicketType,
  minScore = 55,
  allowFallback = true,
): { picks: FixtureScore[]; jointProbability: number; compositeScore: number; confidence: "alta" | "media" | "baixa" } | null {
  const valid = rankings.filter((r) => !r.vetoed).sort((a, b) => b.score - a.score);
  if (valid.length < 4) return null;

  const above = valid.filter((r) => r.score >= minScore);
  let picks: FixtureScore[];
  let confidence: "alta" | "media" | "baixa";

  if (above.length >= 4) {
    picks = above.slice(0, 4);
    confidence = "alta";
  } else {
    if (!allowFallback) return null;
    picks = valid.slice(0, 4);
    const avg = picks.reduce((a, p) => a + p.score, 0) / 4;
    confidence = avg >= minScore * 0.7 ? "media" : "baixa";
  }

  const jointProbability = picks.reduce((acc, p) => acc * p.probability, 1);
  const compositeScore = Math.round(picks.reduce((a, p) => a + p.score, 0) / picks.length);
  return { picks, jointProbability, compositeScore, confidence };
}

