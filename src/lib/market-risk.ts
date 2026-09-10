/**
 * Mercados de baixa conversão histórica (assertividade real medida nos bilhetes conferidos).
 * Usado para sinalizar risco crítico na UI e para a trava de montagem de bilhetes.
 */
export const RISK_THRESHOLD = 0.2;

export const MARKET_HISTORIC_ACCURACY: Record<string, number> = {
  "Aposta Montada": 0.035,
  "Placar Exato Seco": 0.09,
  "Evolução do Jogo": 0.167,
  "Placar Múltiplo Exato": 0.183,
};

export function marketRisk(market: string): number | null {
  return MARKET_HISTORIC_ACCURACY[market] ?? null;
}

export function isRiskyMarket(market: string): boolean {
  const a = marketRisk(market);
  return a != null && a < RISK_THRESHOLD;
}

const KEY = "auto-tickets:hide-risky-markets";

export function getHideRisky(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function setHideRisky(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, v ? "1" : "0");
}
