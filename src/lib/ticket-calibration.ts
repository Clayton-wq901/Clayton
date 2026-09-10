import type { Fechamento } from "@/lib/fechamentos";

/** Média geométrica das probabilidades dos jogos do bilhete (0..1). */
export function geoMean(ps: number[]): number {
  if (ps.length === 0) return 0;
  return Math.pow(ps.reduce((acc, p) => acc * Math.max(p, 0.0001), 1), 1 / ps.length);
}

export type ConfLevel = "ALTA" | "MÉDIA" | "BAIXA";

export type Confidence = {
  score: number;
  level: ConfLevel;
  cls: string;
  source: "calibrado" | "modelo";
  sample: number;
};

const CLS: Record<ConfLevel, string> = {
  ALTA: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  MÉDIA: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  BAIXA: "bg-white/5 text-muted-foreground border-white/15",
};

function levelFor(score: number): ConfLevel {
  return score >= 65 ? "ALTA" : score >= 40 ? "MÉDIA" : "BAIXA";
}

/** Faixas de geo usadas para agrupar o histórico. */
const BANDS: [number, number][] = [
  [0, 0.1],
  [0.1, 0.15],
  [0.15, 0.2],
  [0.2, 0.25],
  [0.25, 0.35],
  [0.35, 1],
];

export type Calibration = {
  /** total de bilhetes conferidos com geo registrado */
  sample: number;
  bands: { min: number; max: number; n: number; green: number; rate: number }[];
};

type SavedMarket = { market: string; geo?: number; games?: { p?: number }[] };
type SavedCheck = { tickets?: { market: string; green: boolean; pending: boolean; voided?: boolean }[] };

/** Lê os fechamentos já conferidos e mede o acerto real por faixa de probabilidade. */
export function buildCalibration(list: Fechamento[]): Calibration {
  const bands = BANDS.map(([min, max]) => ({ min, max, n: 0, green: 0, rate: 0 }));
  let sample = 0;

  for (const f of list) {
    const summary = f.summary as { markets?: SavedMarket[]; check?: SavedCheck } | null;
    const markets = summary?.markets;
    const check = summary?.check;
    if (!Array.isArray(markets) || !check?.tickets) continue;

    for (const m of markets) {
      const tc = check.tickets.find((t) => t.market === m.market);
      if (!tc || tc.pending || tc.voided) continue;
      const geo = typeof m.geo === "number" ? m.geo : geoMean((m.games ?? []).map((g) => g.p ?? 0));
      if (!(geo > 0)) continue;
      const band = bands.find((b) => geo >= b.min && geo < b.max);
      if (!band) continue;
      band.n += 1;
      if (tc.green) band.green += 1;
      sample += 1;
    }
  }

  for (const b of bands) b.rate = b.n > 0 ? b.green / b.n : 0;
  return { sample, bands };
}

/** Mínimo de bilhetes conferidos para confiar na calibração histórica. */
export const MIN_CALIBRATION_SAMPLE = 20;
const MIN_BAND_SAMPLE = 5;

/**
 * Nível de confiança do bilhete.
 * Com histórico suficiente usa a taxa real de green da faixa; senão usa a
 * escala do modelo (geo × 2.4), que só ordena os bilhetes entre si.
 */
export function ticketConfidenceFromGeo(geo: number, calib?: Calibration | null): Confidence {
  if (calib && calib.sample >= MIN_CALIBRATION_SAMPLE) {
    const band = calib.bands.find((b) => geo >= b.min && geo < b.max);
    if (band && band.n >= MIN_BAND_SAMPLE) {
      const score = Math.round(Math.min(99, band.rate * 100));
      return { score, level: levelFor(score), cls: CLS[levelFor(score)], source: "calibrado", sample: band.n };
    }
  }
  const score = Math.round(Math.min(99, geo * 100 * 2.4));
  return { score, level: levelFor(score), cls: CLS[levelFor(score)], source: "modelo", sample: 0 };
}
