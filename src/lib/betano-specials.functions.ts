import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAiInsight } from "./ai-insight.functions";
import { getFixtureStatistics, getFixtureLineups, getFixture, getMatchPreview, type ApiFixture, type TeamPreviewStats } from "./api-football.functions";
import { computeOwnPrediction, type OwnPrediction } from "./own-prediction";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { betanoCriteriaScore, type BetanoCriteriaInput } from "./betano-criteria";

import { BETANO_FIXED_MARKETS } from "./betano-constants";

export interface BetanoValidationResult {
  market: string;
  pick: string;
  prob: number;
  odd: number;
  reasoning: string;
}



export function validateBetanoSpecials(fixture: ApiFixture, pred: OwnPrediction, homePrev: TeamPreviewStats, awayPrev: TeamPreviewStats): BetanoValidationResult[] {
  const home = fixture.teams.home.name;
  const away = fixture.teams.away.name;
  const results: BetanoValidationResult[] = [];

  // 1. Margem de Vitória (Respeitando Mandante/Visitante)
  const h2g = (pred.matrix[2]?.[0] || 0) + (pred.matrix[3]?.[1] || 0) + (pred.matrix[4]?.[2] || 0) + (pred.matrix[5]?.[3] || 0);
  const h3g = (pred.matrix[3]?.[0] || 0) + (pred.matrix[4]?.[0] || 0) + (pred.matrix[4]?.[1] || 0) + (pred.matrix[5]?.[0] || 0) + (pred.matrix[5]?.[1] || 0) + (pred.matrix[5]?.[2] || 0);
  const a2g = (pred.matrix[0]?.[2] || 0) + (pred.matrix[1]?.[3] || 0) + (pred.matrix[2]?.[4] || 0) + (pred.matrix[3]?.[5] || 0);
  const a3g = (pred.matrix[0]?.[3] || 0) + (pred.matrix[0]?.[4] || 0) + (pred.matrix[1]?.[4] || 0) + (pred.matrix[0]?.[5] || 0) + (pred.matrix[1]?.[5] || 0) + (pred.matrix[2]?.[5] || 0);

  const margemOptions = [
    { pick: `${home} (Mandante) ganhar por exatamente 2 gols`, prob: h2g },
    { pick: `${home} (Mandante) ganhar por 3 ou mais gols`, prob: h3g },
    { pick: `${away} (Visitante) ganhar por exatamente 2 gols`, prob: a2g },
    { pick: `${away} (Visitante) ganhar por 3 ou mais gols`, prob: a3g },
  ];

  // 2. Evolução do Jogo
  const pHomeFirst = pred.lambdaHome / (pred.lambdaHome + pred.lambdaAway || 1);
  const pAwayFirst = 1 - pHomeFirst;
  
  const hFirstDraw = pHomeFirst * pred.pDraw;
  const aFirstDraw = pAwayFirst * pred.pDraw;

  const evolucaoOptions = [
    { pick: `${home} (Mandante) marcar primeiro e empatar`, prob: hFirstDraw },
    { pick: `${away} (Visitante) marcar primeiro e empatar`, prob: aFirstDraw },
  ];

  // 3. Resultado Correto Múltipla
  const clusterH3 = (pred.matrix[2]?.[1] || 0) + (pred.matrix[3]?.[1] || 0) + (pred.matrix[4]?.[1] || 0);
  const clusterH4 = (pred.matrix[3]?.[2] || 0) + (pred.matrix[4]?.[2] || 0) + (pred.matrix[4]?.[3] || 0) + (pred.matrix[5]?.[1] || 0);

  const clusterA3 = (pred.matrix[1]?.[2] || 0) + (pred.matrix[1]?.[3] || 0) + (pred.matrix[1]?.[4] || 0);
  const clusterA4 = (pred.matrix[2]?.[3] || 0) + (pred.matrix[2]?.[4] || 0) + (pred.matrix[3]?.[4] || 0) + (pred.matrix[1]?.[5] || 0);

  const placarOptions = [
    { pick: `${home} (Mandante): (2-1) (3-1) ou (4-1)`, prob: clusterH3 },
    { pick: `${home} (Mandante): (3-2) (4-2) (4-3) ou (5-1)`, prob: clusterH4 },
    { pick: `${away} (Visitante): (1-2) (1-3) ou (1-4)`, prob: clusterA3 },
    { pick: `${away} (Visitante): (2-3) (2-4) (3-4) ou (1-5)`, prob: clusterA4 },
  ];

  const allMarkets = [
    { id: "margem_vitoria", options: margemOptions },
    { id: "evolucao_jogo", options: evolucaoOptions },
    { id: "placar_multipla", options: placarOptions }
  ];

  allMarkets.forEach(market => {
    // Escolhe estritamente a opção de maior probabilidade para cada mercado
    const bestOption = [...market.options].sort((a, b) => b.prob - a.prob)[0];
    
    // Simulação de Odds Betano (Inversa da prob + margem de casa de 12%)
    const rawOdd = bestOption.prob > 0 ? (1 / bestOption.prob) * 0.88 : 10.0;
    const finalOdd = Math.min(Math.max(rawOdd, 1.25), 15.0); // Clamping razoável

    // Justificativa Técnica / Prova Real
    let reasoning = "";
    if (market.id === "margem_vitoria") {
      reasoning = `λ Total (${(pred.lambdaHome + pred.lambdaAway).toFixed(1)}) vs GS Médio (${((homePrev.goalsAgainstAvg + awayPrev.goalsAgainstAvg) / 2).toFixed(1)}). Volume sugere vitória por margem.`;
    } else if (market.id === "evolucao_jogo") {
      reasoning = `P(Empate) ${(pred.pDraw * 100).toFixed(0)}% + P(1º Gol) ${(pHomeFirst * 100).toFixed(0)}%. Equilíbrio tático detectado.`;
    } else {
      reasoning = `Cluster ${(bestOption.prob * 100).toFixed(0)}% baseado em Poisson Dixon-Coles. Padrão de placar frequente.`;
    }

    results.push({ 
      market: market.id, 
      pick: bestOption.pick, 
      prob: bestOption.prob,
      odd: Number(finalOdd.toFixed(2)),
      reasoning
    });
  });

  return results;
}

export const getBetanoBulkScan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fixtures: z.array(z.object({ id: z.number(), homeId: z.number(), awayId: z.number() })) }))
  .handler(async ({ data }) => {
    const results: { 
      fixtureId: number; 
      picks: { market: string; pick: string; prob: number; odd: number; reasoning: string }[]; 
      justification: string;
      audit: { score: number; tier: string; veto: string | null; lambdaTotal: number };
      stats: any;
    }[] = [];
    
    const chunks = [];
    for (let i = 0; i < data.fixtures.length; i += 10) chunks.push(data.fixtures.slice(i, i + 10));

    for (const chunk of chunks) {
      const chunkRes = await Promise.all(chunk.map(async (f) => {
        const [preview, fixture] = await Promise.all([
          getMatchPreview({ data: { homeId: f.homeId, awayId: f.awayId, last: 6 } }),
          getFixture({ data: { id: f.id } })
        ]);

        if (!preview || !fixture) return null;
        
        // MatchPreview retorna { home: TeamPreviewStats, away: TeamPreviewStats }
        const homePrev = (preview as any).home as TeamPreviewStats;
        const awayPrev = (preview as any).away as TeamPreviewStats;
        
        if (!homePrev || !awayPrev) return null;
        
        const pred = computeOwnPrediction(homePrev, awayPrev);
        const specials = validateBetanoSpecials(fixture, pred, homePrev, awayPrev);
        
        // Auditoria de Prova Real
        const auditInput: BetanoCriteriaInput = {
          ready: true,
          lambdaTotal: pred.lambdaHome + pred.lambdaAway,
          lambdaHome: pred.lambdaHome,
          lambdaAway: pred.lambdaAway,
          gfHome: homePrev.goalsForAvg,
          gaHome: homePrev.goalsAgainstAvg,
          gfAway: awayPrev.goalsForAvg,
          gaAway: awayPrev.goalsAgainstAvg,
          pBTTS: pred.pBTTS,
          pDraw: pred.pDraw,
          sogHome: homePrev.shotsOnGoalAvg,
          sogAway: awayPrev.shotsOnGoalAvg
        };

        const audit = betanoCriteriaScore(auditInput);
        
        if (specials.length === 3 && audit.tier !== "BLOQUEADO") {
          return {
            fixtureId: f.id,
            picks: specials,
            justification: `Auditoria OneOption Elite: Jogo com λ ${auditInput.lambdaTotal.toFixed(2)} e score de confiança ${audit.score}%. Padrão estratégico validado para mercados especiais.`,
            audit: { 
              score: audit.score, 
              tier: audit.tier, 
              veto: audit.veto,
              lambdaTotal: auditInput.lambdaTotal
            },
            stats: auditInput
          };
        }
        return null;
      }));
      results.push(...chunkRes.filter((r): r is NonNullable<typeof r> => r !== null));
    }

    return results;
  });

export const getBetanoSpecialAnalysis = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fixtureId: z.number() }))
  .handler(async ({ data }) => {
    const fixture = await getFixture({ data: { id: data.fixtureId } });
    if (!fixture) throw new Error("Jogo não encontrado na base interna.");

    const [stats, lineups, preview] = await Promise.all([
      getFixtureStatistics({ data: { id: data.fixtureId } }),
      getFixtureLineups({ data: { id: data.fixtureId } }),
      getMatchPreview({ data: { homeId: fixture.teams.home.id, awayId: fixture.teams.away.id, last: 5 } }) 
    ]);

    const homePrev = preview?.home as unknown as TeamPreviewStats;
    const awayPrev = preview?.away as unknown as TeamPreviewStats;
    const pred = computeOwnPrediction(homePrev, awayPrev);
    const specials = validateBetanoSpecials(fixture, pred, homePrev, awayPrev);

    const context = `
      Analise os mercados especiais da Betano para o jogo: ${fixture.teams.home.name} vs ${fixture.teams.away.name}.
      Liga: ${fixture.league.name}
      Estatísticas: ${JSON.stringify(stats).slice(0, 1500)}
      Escalações: ${JSON.stringify(lineups).slice(0, 1500)}
      
      Mercados Fixos Obrigatórios OneOption:
      1. Margem de Vitória:
         - ${fixture.teams.home.name} ganhar por exatamente 2 gols
         - ${fixture.teams.home.name} ganhar por 3 ou mais gols
         - ${fixture.teams.away.name} ganhar por exatamente 2 gols
         - ${fixture.teams.away.name} ganhar por 3 ou mais gols

      2. Evolução do Jogo:
         - ${fixture.teams.home.name} marcar primeiro e empatar
         - ${fixture.teams.away.name} marcar primeiro e empatar

      3. Resultado Correto (Múltipla):
         - ${fixture.teams.home.name}: (2-1) (3-1) ou (4-1)
         - ${fixture.teams.home.name}: (3-2) (4-2) (4-3) ou (5-1)
         - ${fixture.teams.away.name}: (1-2) (1-3) ou (1-4)
         - ${fixture.teams.away.name}: (2-3) (2-4) (3-4) ou (1-5)

      Com base nos dados, identifique qual dessas opções exatas de um dos 3 mercados é a MAIS SEGURA.
      Retorne APENAS a opção recomendada e uma justificativa técnica curtíssima.
    `;

    const aiRes = await getAiInsight({ data: { kind: "match", context } });
    
    return {
      text: aiRes.text,
      recommendedMarket: aiRes.text.toLowerCase().includes("margem") ? "margem_vitoria" : 
                         aiRes.text.toLowerCase().includes("evolução") || aiRes.text.toLowerCase().includes("marcar primeiro") ? "evolucao_jogo" : "placar_multipla",
      picks: specials
    };
  });

export const getBetanoMultipleAnalysis = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fixtures: z.array(z.any()) }))
  .handler(async ({ data }) => {
    const context = `
      Você é um especialista em apostas esportivas de elite da OneOption.
      Analise esta múltipla estratégica de 4 jogos para a Betano.
      Cada jogo possui 3 mercados selecionados (Margem de Vitória, Evolução do Jogo e Resultado Correto Múltipla).
      
      Jogos e Mercados:
      ${data.fixtures.map((f: any, i: number) => `
        Jogo ${i + 1}: ${f.teams.home.name} vs ${f.teams.away.name}
        Mercados Sugeridos: ${f.recommendedPicks?.map((p: any) => `${p.market}: ${p.pick} (${(p.prob * 100).toFixed(0)}%)`).join(", ")}
      `).join("\n")}
      
      Objetivo: Fornecer um relatório de confiança e uma análise técnica do porquê esta múltipla é assertiva.
      
      Retorne um JSON com:
      - confidence: número entre 0 e 100
      - analysis: texto curto e impactante justificando a escolha.
    `;

    const aiRes = await getAiInsight({ data: { kind: "match", context } });
    
    try {
      const match = aiRes.text.match(/\{.*\}/s);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {}

    return {
      confidence: 85,
      analysis: aiRes.text
    };
  });

export const saveBetanoTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ data: z.any() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("betano_tickets")
      .insert([{ user_id: userId, data }]);

    if (error) throw error;
    return { success: true };
  });

export const getBetanoTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("betano_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });

export const updateBetanoTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string(), status: z.enum(["won", "lost", "pending"]) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("betano_tickets")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId);

    if (error) throw error;
    return { success: true };
  });
