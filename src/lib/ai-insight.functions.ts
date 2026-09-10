import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";

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
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("IA indisponível: configure a variável OPENAI_API_KEY.");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPTS[data.kind] },
          { role: "user", content: data.context },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Muitas requisições à IA. Tente em instantes.");
      if (res.status === 402) throw new Error("Cota da OpenAI esgotada. Verifique o saldo da sua conta.");
      throw new Error(`Falha na IA [${res.status}]: ${body.slice(0, 200)}`);
    }

    const textRes = await res.text();
    let json;
    try {
      json = JSON.parse(textRes);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", textRes);
      throw new Error("Resposta da IA inválida: formato não reconhecido.");
    }

    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error("AI Response Content Missing:", json);
      throw new Error("A IA não retornou uma análise válida.");
    }
    return { text };
  });
