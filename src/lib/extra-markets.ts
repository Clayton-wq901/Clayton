// Mercados extras (padrão Betano) derivados da matriz de placares da IA.
// Puro / client-safe.

import type { OwnPrediction } from "./own-prediction";

export type MarketOption = { selection: string; p: number };
export type MarketBlock = { market: string; hint?: string; options: MarketOption[] };

/** Probabilidade de o mandante marcar o primeiro gol, dado um placar (i,j). */
function pHomeFirst(i: number, j: number, lh: number, la: number): number {
  if (i === 0 && j === 0) return 0;
  if (j === 0) return 1;
  if (i === 0) return 0;
  const t = lh + la;
  return t > 0 ? lh / t : 0.5;
}

function norm(list: MarketOption[]): MarketOption[] {
  return list.filter((o) => o.p > 0.0005).sort((a, b) => b.p - a.p);
}

export function buildExtraMarkets(
  pred: OwnPrediction,
  homeName: string,
  awayName: string,
  cornersOver95?: number,
): MarketBlock[] {
  const m = pred.matrix;
  if (!m?.length) return [];
  const lh = pred.lambdaHome;
  const la = pred.lambdaAway;

  // ---- Evolução do jogo ----
  let hfHw = 0, hfD = 0, hfL = 0, afAw = 0, afD = 0, afL = 0, noGoal = 0;
  // ---- Margem de vitória ----
  let h1 = 0, h2 = 0, h3 = 0, a1 = 0, a2 = 0, a3 = 0, draw = 0;
  const exact: MarketOption[] = [];

  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      const p = m[i][j];
      if (!p) continue;
      const ph = pHomeFirst(i, j, lh, la);
      const pa = i === 0 && j === 0 ? 0 : 1 - ph;

      if (i === 0 && j === 0) noGoal += p;

      if (i > j) {
        hfHw += p * ph;
        afL += p * pa;
      } else if (i === j) {
        hfD += p * ph;
        afD += p * pa;
      } else {
        hfL += p * ph;
        afAw += p * pa;
      }

      const d = i - j;
      if (d === 0) draw += p;
      else if (d === 1) h1 += p;
      else if (d === 2) h2 += p;
      else if (d >= 3) h3 += p;
      else if (d === -1) a1 += p;
      else if (d === -2) a2 += p;
      else a3 += p;

      if (i <= 4 && j <= 4) exact.push({ selection: `${i} - ${j}`, p });
    }
  }

  const blocks: MarketBlock[] = [];

  blocks.push({
    market: "Evolução do Jogo",
    hint: "quem marca primeiro × resultado",
    options: norm([
      { selection: `${homeName} marcar primeiro e ganhar`, p: hfHw },
      { selection: `${homeName} marcar primeiro e empatar`, p: hfD },
      { selection: `${homeName} marcar primeiro e perder`, p: hfL },
      { selection: `${awayName} marcar primeiro e ganhar`, p: afAw },
      { selection: `${awayName} marcar primeiro e empatar`, p: afD },
      { selection: `${awayName} marcar primeiro e perder`, p: afL },
      { selection: `${homeName} ganhar de virada`, p: afL },
      { selection: `${awayName} ganhar de virada`, p: hfL },
      { selection: "Sem gol (0 - 0)", p: noGoal },
    ]).slice(0, 9),
  });

  blocks.push({
    market: "Margem de Vitória",
    hint: "diferença exata de gols",
    options: norm([
      { selection: `${homeName} por 1 gol`, p: h1 },
      { selection: `${homeName} por 2 gols`, p: h2 },
      { selection: `${homeName} por 3+ gols`, p: h3 },
      { selection: "Empate", p: draw },
      { selection: `${awayName} por 1 gol`, p: a1 },
      { selection: `${awayName} por 2 gols`, p: a2 },
      { selection: `${awayName} por 3+ gols`, p: a3 },
    ]),
  });

  // ---- Placar múltiplo exato (padrão Betano) ----
  const cell = (i: number, j: number) => m[i]?.[j] ?? 0;
  const sum = (cells: [number, number][]) => cells.reduce((s, [i, j]) => s + cell(i, j), 0);

  const homeGroups: [number, number][][] = [
    [[1, 0], [2, 0], [3, 0]],
    [[4, 0], [5, 0], [6, 0]],
    [[2, 1], [3, 1], [4, 1]],
    [[3, 2], [4, 2], [4, 3], [5, 1]],
  ];
  const awayGroups: [number, number][][] = [
    [[0, 1], [0, 2], [0, 3]],
    [[0, 4], [0, 5], [0, 6]],
    [[1, 2], [1, 3], [1, 4]],
    [[2, 3], [2, 4], [3, 4], [1, 5]],
  ];

  const listed = new Set<string>();
  for (const g of [...homeGroups, ...awayGroups]) for (const [i, j] of g) listed.add(`${i}-${j}`);

  let homeOther = 0, awayOther = 0, drawGoals = 0;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      const p = m[i][j];
      if (!p) continue;
      if (i === j) { if (i > 0) drawGoals += p; continue; }
      if (listed.has(`${i}-${j}`)) continue;
      if (i > j) homeOther += p; else awayOther += p;
    }
  }

  const fmt = (cells: [number, number][]) => cells.map(([i, j]) => `(${i}-${j})`).join(" ou ");

  blocks.push({
    market: "Placar Múltiplo Exato",
    hint: "faixas combinadas de placares",
    options: [
      ...homeGroups.map((g) => ({ selection: `${homeName}: ${fmt(g)}`, p: sum(g) })),
      { selection: `${homeName} ganhar por qualquer outro placar`, p: homeOther },
      ...awayGroups.map((g) => ({ selection: `${awayName}: ${fmt(g)}`, p: sum(g) })),
      { selection: `${awayName} ganhar por qualquer outro placar`, p: awayOther },
      { selection: "Empate com gols", p: drawGoals },
      { selection: "Sem gol (0-0)", p: cell(0, 0) },
    ].filter((o) => o.p > 0.0005),
  });


  blocks.push({
    market: "Placar Exato Seco",
    hint: "top placares da IA",
    options: norm(exact).slice(0, 8),
  });

  // ---- Aposta montada (combos) ----
  if (typeof cornersOver95 === "number" && cornersOver95 > 0) {
    const co = cornersOver95;
    const cu = 1 - co;
    blocks.push({
      market: "Aposta Montada",
      hint: "combos da mesma partida",
      options: norm([
        { selection: `Empate + Mais de 9.5 escanteios`, p: pred.pDraw * co },
        { selection: `Empate + Menos de 9.5 escanteios`, p: pred.pDraw * cu },
        { selection: `${homeName} vence + Mais de 9.5 escanteios`, p: pred.pHome * co },
        { selection: `${homeName} vence + Menos de 9.5 escanteios`, p: pred.pHome * cu },
        { selection: `${awayName} vence + Mais de 9.5 escanteios`, p: pred.pAway * co },
        { selection: `${awayName} vence + Menos de 9.5 escanteios`, p: pred.pAway * cu },
        { selection: `Menos de 1.5 gols + Menos de 9.5 escanteios`, p: (1 - pred.pOver15) * cu },
        { selection: `Ambas marcam + Mais de 9.5 escanteios`, p: pred.pBTTS * co },
      ]).slice(0, 6),
    });
  }

  return blocks;
}
