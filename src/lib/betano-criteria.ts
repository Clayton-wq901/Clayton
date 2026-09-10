export interface BetanoCriteriaInput {
  ready: boolean;
  lambdaTotal: number;
  lambdaHome: number;
  lambdaAway: number;
  gfHome: number;
  gaHome: number;
  gfAway: number;
  gaAway: number;
  pBTTS: number;
  pDraw: number;
  sogHome: number;
  sogAway: number;
}

export interface BetanoAuditResult {
  score: number;
  tier: "ELITE" | "POTENCIAL" | "BLOQUEADO";
  veto: string | null;
}

export function betanoCriteriaScore(input: BetanoCriteriaInput): BetanoAuditResult {
  let score = 70; // Base score
  
  // Rule 1: High Offensive Volume (Good for specials)
  if (input.lambdaTotal > 2.8) score += 10;
  if (input.lambdaTotal > 3.5) score += 5;
  
  // Rule 2: Shots on Goal (SOG)
  if (input.sogHome + input.sogAway > 9.5) score += 10;
  
  // Rule 3: Defensive Fragility (Good for multiple goals)
  if (input.gaHome > 1.5 || input.gaAway > 1.5) score += 5;

  // Veto Rules
  if (input.lambdaTotal < 1.2) {
    return { score: 30, tier: "BLOQUEADO", veto: "Volume ofensivo insuficiente para mercados especiais" };
  }

  const tier = score >= 85 ? "ELITE" : score >= 60 ? "POTENCIAL" : "BLOQUEADO";
  return { score: Math.min(score, 100), tier, veto: null };
}
