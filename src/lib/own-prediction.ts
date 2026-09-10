// Previsão própria por Poisson usando as médias dos últimos jogos de cada time.
// Puro (client-safe). Alimentado pelo getMatchPreview (últimos 5 jogos).

import type { TeamPreviewStats } from "./api-football.functions";

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

// Correção Dixon-Coles nos placares baixos (0-0, 1-0, 0-1, 1-1)
export const DC_RHO = -0.13;
export function dcTau(i: number, j: number, lh: number, la: number, rho = DC_RHO): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}


export interface ScoreProb { label: string; p: number }
export interface OwnPrediction {
  ready: boolean;
  lambdaHome: number;
  lambdaAway: number;
  lambdaCornersTotal: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver05: number;
  pOver15: number;
  pOver25: number;
  pOver35: number;
  pUnder15: number;
  pUnder25: number;
  pBTTS: number;
  pNoBTTS: number;
  pCornersOver85: number;
  pCornersOver95: number;
  pCornersOver105: number;
  topScores: ScoreProb[];
  expectedGoals: number;
  expectedCorners: number;
  // Combos BTTS
  pBttsAndOver25: number;
  pBttsAndHome: number;
  pBttsAndDraw: number;
  pBttsAndAway: number;
  bttsTopScores: ScoreProb[]; // top placares com ambas marcam
  // 1º / 2º tempo (aprox. 45% / 55% dos gols)
  htHome: number; htDraw: number; htAway: number;
  shHome: number; shDraw: number; shAway: number;
  // HT/FT combos (top 4)
  htFt: ScoreProb[];
  /** Matriz de probabilidade de placar [golsCasa][golsFora], 0..6 normalizada */
  matrix: number[][];
}

const EMPTY: OwnPrediction = {
  ready: false,
  lambdaHome: 0, lambdaAway: 0, lambdaCornersTotal: 0,
  pHome: 0, pDraw: 0, pAway: 0,
  pOver05: 0, pOver15: 0, pOver25: 0, pOver35: 0,
  pUnder15: 0, pUnder25: 0,
  pBTTS: 0, pNoBTTS: 0,
  pCornersOver85: 0, pCornersOver95: 0, pCornersOver105: 0,
  topScores: [], expectedGoals: 0, expectedCorners: 0,
  pBttsAndOver25: 0, pBttsAndHome: 0, pBttsAndDraw: 0, pBttsAndAway: 0,
  bttsTopScores: [],
  htHome: 0, htDraw: 0, htAway: 0,
  shHome: 0, shDraw: 0, shAway: 0,
  htFt: [],
  matrix: [],
};

// Home advantage suave (+8%) — mesma linha do ai-engine
const HOME_ADV = 0.08;
// Distribuição temporal aproximada dos gols em uma partida de futebol
const HT_SHARE = 0.45;
const SH_SHARE = 0.55;

function halfResult(lh: number, la: number): { pH: number; pD: number; pA: number } {
  const MAX = 5;
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= MAX; i++) {
    for (let j = 0; j <= MAX; j++) {
      const p = poisson(lh, i) * poisson(la, j);
      if (i > j) pH += p;
      else if (i === j) pD += p;
      else pA += p;
    }
  }
  return { pH, pD, pA };
}

export function computeOwnPrediction(home: TeamPreviewStats, away: TeamPreviewStats): OwnPrediction {
  if (!home.played || !away.played) return EMPTY;

  // Respeitar rigorosamente a ordem Mandante (home) vs Visitante (away)
  const lhBase = (home.goalsForAvg + away.goalsAgainstAvg) / 2;
  const laBase = (away.goalsForAvg + home.goalsAgainstAvg) / 2;
  const lh = Math.max(0.1, Math.min(5, lhBase * (1 + HOME_ADV)));
  const la = Math.max(0.1, Math.min(5, laBase * (1 - HOME_ADV / 1.5))); // Penalidade visitante

  const MAX = 6;
  const m: number[][] = [];
  let mTotal = 0;
  for (let i = 0; i <= MAX; i++) {
    m[i] = [];
    for (let j = 0; j <= MAX; j++) {
      const p = poisson(lh, i) * poisson(la, j) * Math.max(0.01, dcTau(i, j, lh, la));
      m[i][j] = p;
      mTotal += p;
    }
  }
  if (mTotal > 0) for (let i = 0; i <= MAX; i++) for (let j = 0; j <= MAX; j++) m[i][j] /= mTotal;


  let pH = 0, pD = 0, pA = 0;
  let pO05 = 0, pO15 = 0, pO25 = 0, pO35 = 0, pBTTS = 0;
  let pBttsO25 = 0, pBttsH = 0, pBttsD = 0, pBttsA = 0;
  const scoresList: ScoreProb[] = [];
  const bttsScores: ScoreProb[] = [];
  for (let i = 0; i <= MAX; i++) {
    for (let j = 0; j <= MAX; j++) {
      const p = m[i][j];
      if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
      const t = i + j;
      if (t >= 1) pO05 += p;
      if (t >= 2) pO15 += p;
      if (t >= 3) pO25 += p;
      if (t >= 4) pO35 += p;
      const btts = i > 0 && j > 0;
      if (btts) {
        pBTTS += p;
        if (t >= 3) pBttsO25 += p;
        if (i > j) pBttsH += p;
        else if (i === j) pBttsD += p;
        else pBttsA += p;
        if (i <= 4 && j <= 4) bttsScores.push({ label: `${i}-${j}`, p });
      }
      if (i <= 4 && j <= 4) scoresList.push({ label: `${i}-${j}`, p });
    }
  }
  const topScores = scoresList.sort((a, b) => b.p - a.p).slice(0, 5);
  const bttsTopScores = bttsScores.sort((a, b) => b.p - a.p).slice(0, 4);

  // 1º/2º tempo
  const ht = halfResult(lh * HT_SHARE, la * HT_SHARE);
  const sh = halfResult(lh * SH_SHARE, la * SH_SHARE);

  // HT/FT: assume independência entre metades → junta HT × 2H para gerar resultado final
  const labels: [keyof typeof ht, string][] = [["pH", "1"], ["pD", "X"], ["pA", "2"]];
  const htFtAll: ScoreProb[] = [];
  // Precisamos do FT resultante da combinação — como as metades são independentes,
  // simulamos: para cada par HT/SH, o FT é decidido pela soma dos gols de cada lado.
  // Aproximação leve: usa produto marginal e distribui por probabilidade condicional dos resultados.
  // Como as marginais FT já foram calculadas (pH/pD/pA), condicionamos: P(HT=x, FT=y) ≈ P(HT=x) * P(FT=y | HT=x)
  // Aqui aproximamos P(FT=y|HT=x) por P(SH leads to y given start x). Para simplicidade prática usamos
  // a heurística: se HT = FT o combo é reforçado; se HT ≠ FT, penalizado.
  const ftMap = { "1": pH, "X": pD, "2": pA };
  for (const [k, htLbl] of labels) {
    const pHt = ht[k];
    for (const ftLbl of ["1", "X", "2"] as const) {
      const pFt = ftMap[ftLbl];
      // reforço quando HT casa com FT (estabilidade estatística)
      const same = htLbl === ftLbl ? 1.25 : 0.85;
      htFtAll.push({ label: `${htLbl}/${ftLbl}`, p: pHt * pFt * same });
    }
  }
  // normaliza para somar 1
  const totalHtFt = htFtAll.reduce((a, b) => a + b.p, 0) || 1;
  const htFt = htFtAll.map((h) => ({ label: h.label, p: h.p / totalHtFt })).sort((a, b) => b.p - a.p).slice(0, 4);

  const lCorners = (home.cornersTotalAvg + away.cornersTotalAvg) / 2 || 0;

  return {
    ready: true,
    lambdaHome: +lh.toFixed(2),
    lambdaAway: +la.toFixed(2),
    lambdaCornersTotal: +lCorners.toFixed(2),
    pHome: pH, pDraw: pD, pAway: pA,
    pOver05: pO05, pOver15: pO15, pOver25: pO25, pOver35: pO35,
    pUnder15: 1 - pO15, pUnder25: 1 - pO25,
    pBTTS, pNoBTTS: 1 - pBTTS,
    pCornersOver85: lCorners > 0 ? 1 - poissonCdf(lCorners, 8) : 0,
    pCornersOver95: lCorners > 0 ? 1 - poissonCdf(lCorners, 9) : 0,
    pCornersOver105: lCorners > 0 ? 1 - poissonCdf(lCorners, 10) : 0,
    topScores,
    expectedGoals: +(lh + la).toFixed(2),
    expectedCorners: +lCorners.toFixed(1),
    pBttsAndOver25: pBttsO25,
    pBttsAndHome: pBttsH,
    pBttsAndDraw: pBttsD,
    pBttsAndAway: pBttsA,
    bttsTopScores,
    htHome: ht.pH, htDraw: ht.pD, htAway: ht.pA,
    shHome: sh.pH, shDraw: sh.pD, shAway: sh.pA,
    htFt,
    matrix: m,
  };
}

export function pctFmt(p: number): string {
  return `${Math.round(p * 100)}%`;
}
