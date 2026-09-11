/**
 * Assistente IA de Diagnóstico & Melhorias.
 * Lê o estado real da plataforma no banco e conversa com o modelo para gerar
 * o diagnóstico + o prompt técnico pronto para copiar para onde quiser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Varredura completa do site (rotas, tabelas e integrações). */
export const scanSite = createServerFn({ method: "GET" }).handler(async () => {
  const { runSiteScan } = await import("./site-scan.server");
  return await runSiteScan();
});


export type { PlatformSnapshot } from "./diagnostics.server";

/** Raio-X do banco: bilhetes, cobertura, assertividade por mercado, cache e rodadas. */
export const getPlatformSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { getPlatformSnapshotRaw } = await import("./diagnostics.server");
  return await getPlatformSnapshotRaw();
});

const SYSTEM = `Você é o "Engenheiro de IA Residente" do OneOptionIA — um app TanStack Start + Supabase de análise de futebol.
Contexto do produto: abas Dashboard Clayton, Bingão (Under 1.5, Prova Real, 4 jogos), Lotéca IA, Radar, Beta, Alfha, Artilheiros, Especiais Betano e Bilhetes Auto (robô de 11 mercados salvos na tabela auto_tickets, com conferência automática e ranking de assertividade).
Você recebe um SNAPSHOT REAL do banco a cada mensagem. Use SOMENTE esses números ao falar de estado atual — nunca invente métricas.

Responda SEMPRE em português do Brasil, neste formato exato em markdown:

## Diagnóstico
2 a 5 bullets objetivos citando os números do snapshot e a causa provável.

## Verificação de integridade
Bullets curtos: o que está saudável e o que está degradado (cobertura, assertividade por mercado, cache, rodadas, snapshots de varredura).

## Prompt técnico pronto
Um bloco de código \`\`\`text contendo um comando técnico, cirúrgico e autossuficiente (arquivos prováveis, comportamento esperado, regras de negócio, critérios de aceite). Nada de "verifique se" genérico — instrução executável.

Seja direto, sem enrolação e sem repetir o snapshot cru.`;

export const diagnosticChat = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(6000),
            /** Anexos (prints, imagens, PDFs, vídeos ou áudios) em data URL base64. */
            attachments: z
              .array(
                z.object({
                  name: z.string().max(200),
                  mime: z.string().max(100),
                  dataUrl: z.string().max(28_000_000),
                }),
              )
              .max(4)
              .optional(),
          }),
        )
        .min(1)
        .max(24),
    }),
  )
  .handler(async ({ data }) => {
    const { geminiChat } = await import("./ai-provider.server");
    const { getPlatformSnapshotRaw } = await import("./diagnostics.server");
    const { runSiteScan } = await import("./site-scan.server");
    const [snapshot, scan] = await Promise.all([getPlatformSnapshotRaw(), runSiteScan()]);

    const text = await geminiChat({
      system: [
        SYSTEM,
        `SNAPSHOT REAL DO BANCO (JSON):\n${JSON.stringify(snapshot)}`,
        `VARREDURA AO VIVO DO SITE (JSON):\n${JSON.stringify(scan)}`,
      ],
      messages: data.messages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      })),
      maxOutputTokens: 4096,
    });
    return { text, snapshot, scan };
  });


/* ------------------------------------------------------------------ *
 * Histórico permanente do chat (tabela assistant_messages)            *
 * ------------------------------------------------------------------ */

export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assistant_messages")
      .select("id, role, content, created_at")
      .order("created_at", { ascending: true })
      .limit(400);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; role: "user" | "assistant"; content: string; created_at: string }[];
  });

export const saveChatTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      messages: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20000) }))
        .min(1)
        .max(4),
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assistant_messages")
      .insert(data.messages.map((m) => ({ ...m, user_id: context.userId })));
    if (error) throw new Error(error.message);
    return { saved: data.messages.length };
  });

export const clearChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("assistant_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Mensagem de abertura: o assistente lê o banco e se apresenta dizendo o que
 * encontrou, cruzando com o mapa das abas/estratégias do site.
 */
export const introMessage = createServerFn({ method: "GET" }).handler(async () => {
  const { getPlatformSnapshotRaw } = await import("./diagnostics.server");
  const { runSiteScan } = await import("./site-scan.server");
  const { geminiChat } = await import("./ai-provider.server");
  const [snapshot, scan] = await Promise.all([getPlatformSnapshotRaw(), runSiteScan()]);

  const text = await geminiChat({
    system: [
      SYSTEM,
      `SNAPSHOT REAL DO BANCO (JSON):\n${JSON.stringify(snapshot)}`,
      `VARREDURA AO VIVO DO SITE (JSON):\n${JSON.stringify(scan)}`,
    ],
    messages: [
      {
        role: "user",
        content:
          "Esta é a abertura da sessão. Ignore o formato padrão de diagnóstico e responda assim:\n" +
          "## Mapeamento do sistema\nBullets curtos mostrando que você leu o banco AGORA: cobertura das próximas 24h (prontos/skipped/pendentes), assertividade global, os 3 melhores e os 3 piores mercados com % e volume, estado do cache e das últimas rodadas, snapshots de varredura.\n" +
          "## Varredura do site\nBullets com o resultado real da varredura: rotas que responderam ou falharam (com tempo), tabelas acessíveis e com quantas linhas, integrações sem chave.\n" +
          "## Leitura das abas\n1 bullet por área relevante (Dashboard Clayton, Bingão Prova Real, Lotéca IA, Radar, Beta, Alfha, Artilheiros, Especiais Betano, Bilhetes Auto) dizendo como ela está sendo afetada pelos números acima.\n" +
          "## O que atacamos agora?\n3 sugestões numeradas de otimização priorizadas pelo impacto, e termine perguntando o que eu quero analisar ou otimizar.\n" +
          "NÃO gere bloco de prompt nesta mensagem.",
      },
    ],
    maxOutputTokens: 4096,
  });
  return { text, snapshot, scan };

});
