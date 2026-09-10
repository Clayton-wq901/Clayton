/** Montagem de bilhetes de artilheiros: 3 bilhetes x 4 jogadores com maior chance de marcar. */
import type { ApiFixture, ApiPlayerStatRow } from "@/lib/api-football.functions";

export interface ScorerCandidate {
  playerId: number;
  name: string;
  photo: string;
  teamId: number;
  teamName: string;
  teamLogo: string;
  opponent: string;
  isHome: boolean;
  fixtureId: number;
  kickoff: string;
  leagueName: string;
  goals: number;
  games: number;
  rate: number;      // gols por jogo
  penalties: number;
  prob: number;      // prob. de marcar pelo menos 1 gol
}

export interface ScorerTicket {
  n: number;
  label: string;
  picks: ScorerCandidate[];
  combined: number;  // prob. de todos marcarem
}

/** Janela de 24h a partir de agora, com 15 min de folga. */
export function isWithin24h(fx: ApiFixture, now = Date.now()): boolean {
  const ts = fx.fixture.timestamp * 1000;
  return fx.fixture.status.short === "NS" && ts > now + 15 * 60_000 && ts <= now + 24 * 60 * 60_000;
}

const HOME_BOOST = 1.1;
const AWAY_BOOST = 0.9;

/** Constrói candidatos a marcador para um jogo, usando os artilheiros da liga. */
export function candidatesForFixture(fx: ApiFixture, scorers: ApiPlayerStatRow[]): ScorerCandidate[] {
  const out: ScorerCandidate[] = [];
  const homeId = fx.teams.home.id;
  const awayId = fx.teams.away.id;

  for (const row of scorers) {
    const st = row.statistics.find((s) => s.team?.id === homeId || s.team?.id === awayId);
    if (!st) continue;
    const goals = st.goals.total ?? 0;
    const games = st.games.appearences ?? 0;
    if (goals <= 0 || games < 3) continue;
    const isHome = st.team.id === homeId;
    const rate = goals / games;
    const lambda = rate * (isHome ? HOME_BOOST : AWAY_BOOST);
    const prob = 1 - Math.exp(-lambda);
    out.push({
      playerId: row.player.id,
      name: row.player.name,
      photo: row.player.photo,
      teamId: st.team.id,
      teamName: st.team.name,
      teamLogo: st.team.logo,
      opponent: isHome ? fx.teams.away.name : fx.teams.home.name,
      isHome,
      fixtureId: fx.fixture.id,
      kickoff: fx.fixture.date,
      leagueName: fx.league.name,
      goals,
      games,
      rate,
      penalties: st.penalty.scored ?? 0,
      prob,
    });
  }
  return out;
}

const TICKET_LABELS = ["Mais seguro", "Equilibrado", "Valor"];

/**
 * Ranqueia os candidatos e monta 3 bilhetes de 4 jogadores.
 * Regras: no máx. 1 jogador por time e no máx. 1 jogador por jogo dentro do mesmo bilhete.
 */
export function buildScorerTickets(all: ScorerCandidate[]): ScorerTicket[] {
  const bestPerPlayer = new Map<number, ScorerCandidate>();
  for (const c of all) {
    const prev = bestPerPlayer.get(c.playerId);
    if (!prev || c.prob > prev.prob) bestPerPlayer.set(c.playerId, c);
  }
  const ranked = [...bestPerPlayer.values()].sort((a, b) => b.prob - a.prob);

  const tickets: ScorerTicket[] = [];
  const used = new Set<number>();

  for (let n = 1; n <= 3; n++) {
    const picks: ScorerCandidate[] = [];
    const fixturesInTicket = new Set<number>();
    const teamsInTicket = new Set<number>();
    for (const c of ranked) {
      if (picks.length >= 4) break;
      if (used.has(c.playerId)) continue;
      if (fixturesInTicket.has(c.fixtureId) || teamsInTicket.has(c.teamId)) continue;
      picks.push(c);
      fixturesInTicket.add(c.fixtureId);
      teamsInTicket.add(c.teamId);
    }
    if (picks.length === 0) break;
    for (const p of picks) used.add(p.playerId);
    tickets.push({
      n,
      label: TICKET_LABELS[n - 1] ?? `Bilhete ${n}`,
      picks,
      combined: picks.reduce((acc, p) => acc * p.prob, 1),
    });
  }
  return tickets;
}

/** Ligas com dados confiáveis de artilharia (evita amistosos, sub-20 e regionais). */
export const SCORER_LEAGUES: number[] = [
  // América do Sul
  71, 72, 73, 13, 11, 128, 129, 130, 239, 240, 242, 250, 265, 268, 281, 299, 344,
  // América do Norte / Central
  253, 262, 263, 22,
  // Europa principais
  2, 3, 39, 40, 61, 62, 78, 79, 88, 94, 106, 113, 119, 135, 136, 140, 141, 144, 179, 197, 203, 207, 218, 235, 271, 283, 286, 333, 345,
  // Ásia / Oceania / África
  98, 169, 188, 292, 307, 233, 200,
];
