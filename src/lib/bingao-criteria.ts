// Critérios anti-goleada da etapa 1 do Bingão (seleção Under 1.5).
// Centralizados aqui para que o painel e a tela de detalhes usem os mesmos limites.

export const MAX_LAMBDA_TOTAL = 1.50; // Trava obrigatória: só passa jogo com gols esperados < 1,50
export const MAX_TEAM_FOR = 2.10; // média de gols marcados por time (ajustado para rigor)
export const MAX_TEAM_AGAINST = 2.10; // média de gols sofridos por time (ajustado para rigor)
export const MAX_LAMBDA_GAP = 1.2; // desequilíbrio entre os lados (ajustado para rigor)
export const MIN_U15 = 0.58; // piso de probabilidade de Under 1.5 (ajustado para rigor)

// ---- Perfil "jogo travado" (últimos 6 jogos) ----
export const MAX_SOG = 5.2; // finalizações no gol por jogo (flexibilizado de 4.5)
export const MAX_RECENT_GA = 1.3; // gols sofridos recentes por time (flexibilizado de 1.1)
export const MAX_RECENT_GF = 1.5; // gols marcados recentes por time (flexibilizado de 1.3)
export const MIN_CS_PCT = 35; // % de jogos sem sofrer gol que salva a defesa (flexibilizado de 40)

export interface CriteriaInput {
  ready: boolean;
  lambdaTotal: number;
  lambdaHome: number;
  lambdaAway: number;
  gfHome: number;
  gaHome: number;
  gfAway: number;
  gaAway: number;
  pUnder15: number;
  /** Sinais dos últimos jogos (etapa 2). Ausentes = ainda não medidos. */
  sogHome?: number;
  sogAway?: number;
  recentGfHome?: number;
  recentGfAway?: number;
  recentGaHome?: number;
  recentGaAway?: number;
  csHome?: number;
  csAway?: number;
}

/** true quando os sinais dos últimos jogos já foram medidos. */
export function hasRecent(r: CriteriaInput): boolean {
  return typeof r.recentGaHome === "number" && typeof r.recentGaAway === "number";
}

/** Falha nos critérios de perfil (finalização, defesa, ataque recente). */
export function recentFailure(r: CriteriaInput): string | null {
  if (!hasRecent(r)) return null;
  const sogH = r.sogHome ?? 0;
  const sogA = r.sogAway ?? 0;
  if (sogH > MAX_SOG && sogA > MAX_SOG) return `finalizações altas (${sogH.toFixed(1)}/${sogA.toFixed(1)})`;
  const gaH = r.recentGaHome ?? 0;
  const gaA = r.recentGaAway ?? 0;
  const csH = r.csHome ?? 0;
  const csA = r.csAway ?? 0;
  if (gaH > MAX_RECENT_GA && csH < MIN_CS_PCT) return `defesa Mandante fraca (GS ${gaH.toFixed(2)})`;
  if (gaA > MAX_RECENT_GA && csA < MIN_CS_PCT) return `defesa Visitante fraca (GS ${gaA.toFixed(2)})`;
  const gfH = r.recentGfHome ?? 0;
  const gfA = r.recentGfAway ?? 0;
  if (gfH > MAX_RECENT_GF && gfA > MAX_RECENT_GF) return `ataques em alta (${gfH.toFixed(2)}/${gfA.toFixed(2)})`;
  return null;
}


/** Vetos absolutos — risco real de goleada, o jogo nunca entra. */
export const VETO_LAMBDA_TOTAL = 1.51; // Trava absoluta anti-goleada
export const VETO_TEAM_FOR = 2.2; 
export const VETO_TEAM_AGAINST = 2.2; 
export const VETO_LAMBDA_GAP = 1.3; 
export const VETO_U15 = 0.45;

export const SCORE_SAFE = 70; // SEGURO
export const SCORE_MEDIUM = 50; // MÉDIO (reserva)

export function vetoReason(r: CriteriaInput): string | null {
  if (!r.ready) return "sem estatística";
  // Trava obrigatória: só passa jogo com gols esperados abaixo de 1,50
  if (!(r.lambdaTotal < VETO_LAMBDA_TOTAL)) return `λ ${r.lambdaTotal.toFixed(2)} acima de ${VETO_LAMBDA_TOTAL.toFixed(2)}`;
  if (r.gfHome >= VETO_TEAM_FOR || r.gfAway >= VETO_TEAM_FOR) return "ataque goleador";
  if (r.gaHome >= VETO_TEAM_AGAINST || r.gaAway >= VETO_TEAM_AGAINST) return "defesa muito vazada";
  if (Math.abs(r.lambdaHome - r.lambdaAway) > VETO_LAMBDA_GAP) return "favorito folgado";
  if (r.pUnder15 < VETO_U15) return `U1.5 ${Math.round(r.pUnder15 * 100)}% baixo`;
  return recentFailure(r);
}

function band(value: number, best: number, worst: number): number {
  if (worst === best) return value <= best ? 1 : 0;
  return Math.max(0, Math.min(1, (worst - value) / (worst - best)));
}

export type CriteriaTier = "SEGURO" | "MÉDIO" | "CORTADO";
export interface CriteriaScore { score: number; tier: CriteriaTier; veto: string | null }

/** Nota 0–100 combinando λ total, Under 1.5, ataque, defesa e equilíbrio. */
export function criteriaScore(r: CriteriaInput): CriteriaScore {
  const veto = vetoReason(r);
  if (veto) return { score: 0, tier: "CORTADO", veto };
  const gap = Math.abs(r.lambdaHome - r.lambdaAway);
  const parts = [
    { w: 0.28, v: band(r.lambdaTotal, 0.9, VETO_LAMBDA_TOTAL) },
    { w: 0.26, v: band(1 - r.pUnder15, 1 - 0.72, 1 - VETO_U15) },
    { w: 0.12, v: band(Math.max(r.gfHome, r.gfAway), 1.0, VETO_TEAM_FOR) },
    { w: 0.12, v: band(Math.max(r.gaHome, r.gaAway), 1.0, VETO_TEAM_AGAINST) },
    { w: 0.07, v: band(gap, 0.2, VETO_LAMBDA_GAP) },
  ];
  if (hasRecent(r)) {
    parts.push(
      { w: 0.06, v: band(Math.max(r.sogHome ?? 0, r.sogAway ?? 0), 2.5, MAX_SOG + 2) },
      { w: 0.05, v: band(Math.max(r.recentGaHome ?? 0, r.recentGaAway ?? 0), 0.5, MAX_RECENT_GA + 0.8) },
      { w: 0.04, v: band(Math.max(r.recentGfHome ?? 0, r.recentGfAway ?? 0), 0.5, MAX_RECENT_GF + 0.8) },
    );
  } else {
    // sem dados recentes o jogo não pode valer nota cheia
    parts.push({ w: 0.15, v: 0.45 });
  }
  const totalW = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / totalW) * 100);
  const tier: CriteriaTier = score >= SCORE_SAFE ? "SEGURO" : score >= SCORE_MEDIUM ? "MÉDIO" : "CORTADO";
  return { score, tier, veto: null };
}

/** Motivo do corte (null = aprovado, incluindo reservas MÉDIO). */
export function blockReason(r: CriteriaInput): string | null {
  const s = criteriaScore(r);
  if (s.veto) return s.veto;
  if (s.tier === "CORTADO") return `nota ${s.score} baixa`;
  return null;
}


export interface CriteriaCheck {
  key: string;
  label: string;
  /** valor medido, já formatado */
  value: string;
  /** regra exigida, já formatada */
  rule: string;
  pass: boolean;
  hint: string;
}

export function criteriaChecks(r: CriteriaInput): CriteriaCheck[] {
  const gap = Math.abs(r.lambdaHome - r.lambdaAway);
  return [
    {
      key: "stats",
      label: "Estatística disponível",
      value: r.ready ? "sim" : "não",
      rule: "obrigatório",
      pass: r.ready,
      hint: "Sem médias da temporada o jogo não pode ser modelado.",
    },
    {
      key: "lambdaTotal",
      label: "λ total (gols esperados)",
      value: r.lambdaTotal.toFixed(2),
      rule: `< ${MAX_LAMBDA_TOTAL.toFixed(2)} (obrigatório)`,
      pass: r.lambdaTotal < MAX_LAMBDA_TOTAL,
      hint: "Soma dos gols esperados dos dois times pelo modelo Poisson + Dixon‑Coles. Acima de 1.50 o jogo é cortado.",
    },
    {
      key: "gm",
      label: "GM — gols marcados (casa/fora)",
      value: `${r.gfHome.toFixed(2)} / ${r.gfAway.toFixed(2)}`,
      rule: `ambos < ${MAX_TEAM_FOR.toFixed(1)}`,
      pass: r.gfHome < MAX_TEAM_FOR && r.gfAway < MAX_TEAM_FOR,
      hint: "Time com ataque produtivo aumenta muito o risco de passar de 1.5 gol.",
    },
    {
      key: "gs",
      label: "GS — gols sofridos (casa/fora)",
      value: `${r.gaHome.toFixed(2)} / ${r.gaAway.toFixed(2)}`,
      rule: `ambos < ${MAX_TEAM_AGAINST.toFixed(1)}`,
      pass: r.gaHome < MAX_TEAM_AGAINST && r.gaAway < MAX_TEAM_AGAINST,
      hint: "Defesa vazada é o principal gatilho de goleada.",
    },
    {
      key: "gap",
      label: "Δλ — desequilíbrio entre os lados",
      value: gap.toFixed(2),
      rule: `≤ ${MAX_LAMBDA_GAP.toFixed(2)}`,
      pass: gap <= MAX_LAMBDA_GAP,
      hint: "Diferença grande entre λ casa e λ fora indica favorito folgado (candidato a goleada).",
    },
    {
      key: "under_focus",
      label: "Foco Estratégico",
      value: "Under 1.5",
      rule: "Prioridade Máxima",
      pass: true,
      hint: "O sistema OneOption prioriza o mercado Under 1.5 pela consistência estatística de λ < 1.50.",
    },
    {
      key: "u15",
      label: "Probabilidade de Under 1.5",
      value: `${Math.round(r.pUnder15 * 100)}%`,
      rule: `≥ ${Math.round(MIN_U15 * 100)}%`,
      pass: r.pUnder15 >= MIN_U15,
      hint: "Piso mínimo para o jogo entrar na lista de comparação.",
    },
    {
      key: "sog",
      label: "Finalizações no gol (últimos 6)",
      value: hasRecent(r) ? `${(r.sogHome ?? 0).toFixed(1)} / ${(r.sogAway ?? 0).toFixed(1)}` : "—",
      rule: `pelo menos um ≤ ${MAX_SOG.toFixed(1)}`,
      pass: !hasRecent(r) || (r.sogHome ?? 0) <= MAX_SOG || (r.sogAway ?? 0) <= MAX_SOG,
      hint: "Dois ataques com muito volume de finalização derrubam o Under 1.5.",
    },
    {
      key: "recentGa",
      label: "Gols sofridos recentes (últimos 6)",
      value: hasRecent(r) ? `${(r.recentGaHome ?? 0).toFixed(2)} / ${(r.recentGaAway ?? 0).toFixed(2)}` : "—",
      rule: `≤ ${MAX_RECENT_GA.toFixed(2)} (ou ${MIN_CS_PCT}% de jogos sem sofrer)`,
      pass:
        !hasRecent(r) ||
        (((r.recentGaHome ?? 0) <= MAX_RECENT_GA || (r.csHome ?? 0) >= MIN_CS_PCT) &&
          ((r.recentGaAway ?? 0) <= MAX_RECENT_GA || (r.csAway ?? 0) >= MIN_CS_PCT)),
      hint: "Defesa sólida na fase atual é o sinal mais forte de jogo travado.",
    },
    {
      key: "recentGf",
      label: "Gols marcados recentes (últimos 6)",
      value: hasRecent(r) ? `${(r.recentGfHome ?? 0).toFixed(2)} / ${(r.recentGfAway ?? 0).toFixed(2)}` : "—",
      rule: `pelo menos um ≤ ${MAX_RECENT_GF.toFixed(2)}`,
      pass: !hasRecent(r) || (r.recentGfHome ?? 0) <= MAX_RECENT_GF || (r.recentGfAway ?? 0) <= MAX_RECENT_GF,
      hint: "Times que vêm marcando muito tendem a estourar a linha de 1.5 gol.",
    },
  ];
}
