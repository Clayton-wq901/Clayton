import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";



const PROMPTS: Record<string, string> = {
  match:
    "Você é um analista de futebol objetivo. Receberá números já calculados (Poisson/Dixon-Coles e médias dos últimos 5 jogos). " +
    "Escreva em português do Brasil um resumo tático de no máximo 120 palavras: cenário provável do jogo, ritmo de gols, escanteios/cartões e 2 apostas com melhor fundamento. " +
    "Não invente dados que não estejam no contexto. Sem títulos, use frases curtas.",
  bingao:
    "Você é um analista de apostas especializado em Under 1.5. Receberá as regras do filtro, os sinais medidos de cada jogo aprovado (λ total, Δλ, GM/GS, U1.5, nota) e a lista de jogos bloqueados com o motivo do veto. " +
    "Responda em português do Brasil, até 220 palavras, exatamente neste formato:\n" +
    "APROVADOS:\n• Time A x Time B — sinal decisivo em 1 frase citando os números (λ, Δλ, GM/GS, U1.5).\n" +
    "BLOQUEADOS:\n• Time C x Time D — qual veto disparou e por que era risco de goleada.\n" +
    "RISCO DO DIA: 1 frase com o elo mais frágil dos bilhetes.\n" +
    "Use apenas números do contexto, uma linha por jogo, frases curtas, sem inventar dados.",

  radar:
    "Você é um analista ao vivo. Receberá jogos em andamento com projeções de escanteios e gols. " +
    "Em português do Brasil, até 100 palavras, aponte as 3 melhores oportunidades ao vivo e o motivo. Frases curtas.",
};

export const getAiInsight = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.enum(["match", "bingao", "radar"]),
      context: z.string().min(10).max(12000),
    }),
  )
  .handler(async ({ data }) => {
    const { geminiChat } = await import("./ai-provider.server");
    const text = await geminiChat({
      system: [PROMPTS[data.kind]!],
      messages: [{ role: "user", content: data.context }],
    });
    return { text };
  });

