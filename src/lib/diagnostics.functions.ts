/**
 * Assistente IA de Diagnóstico & Melhorias.
 * Lê o estado real da plataforma no banco e conversa com o modelo para gerar
 * o diagnóstico + o prompt técnico pronto para colar no Lovable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3.7-flash";

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

## Prompt pronto para o Lovable
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
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("IA indisponível: chave não configurada.");

    const { getPlatformSnapshotRaw } = await import("./diagnostics.server");
    const snapshot = await getPlatformSnapshotRaw();

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "system",
            content: `SNAPSHOT REAL DO BANCO (JSON):\n${JSON.stringify(snapshot)}`,
          },
          ...data.messages.map((m) => {
          if (!m.attachments?.length) return { role: m.role, content: m.content };
          const parts: Record<string, unknown>[] = [{ type: "text", text: m.content }];
          for (const a of m.attachments) {
            if (a.mime.startsWith("image/")) {
              parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
            } else if (a.mime.startsWith("video/")) {
              parts.push({ type: "video_url", video_url: { url: a.dataUrl } });
            } else if (a.mime.startsWith("audio/")) {
              const base64 = a.dataUrl.split(",")[1] ?? "";
              const sub = a.mime.split("/")[1]?.split(";")[0] ?? "webm";
              const format = sub === "mpeg" ? "mp3" : sub === "mp4" || sub === "x-m4a" ? "m4a" : sub;
              parts.push({ type: "input_audio", input_audio: { data: base64, format } });
            } else {
              parts.push({ type: "file", file: { filename: a.name, file_data: a.dataUrl } });
            }
          }
          return { role: m.role, content: parts };
        }),
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Muitas requisições à IA. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha na IA [${res.status}]: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("A IA não retornou uma análise válida.");
    return { text, snapshot };
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
  const snapshot = await getPlatformSnapshotRaw();

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("IA indisponível: chave não configurada.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: `SNAPSHOT REAL DO BANCO (JSON):\n${JSON.stringify(snapshot)}` },
        {
          role: "user",
          content:
            "Esta é a abertura da sessão. Ignore o formato padrão de diagnóstico e responda assim:\n" +
            "## Mapeamento do sistema\nBullets curtos mostrando que você leu o banco AGORA: cobertura das próximas 24h (prontos/skipped/pendentes), assertividade global, os 3 melhores e os 3 piores mercados com % e volume, estado do cache e das últimas rodadas, snapshots de varredura.\n" +
            "## Leitura das abas\n1 bullet por área relevante (Dashboard Clayton, Bingão Prova Real, Lotéca IA, Radar, Beta, Alfha, Artilheiros, Especiais Betano, Bilhetes Auto) dizendo como ela está sendo afetada pelos números acima.\n" +
            "## O que atacamos agora?\n3 sugestões numeradas de otimização priorizadas pelo impacto, e termine perguntando o que eu quero analisar ou otimizar.\n" +
            "NÃO gere bloco de prompt nesta mensagem.",
        },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Muitas requisições à IA. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    throw new Error(`Falha na IA [${res.status}]: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("A IA não retornou a apresentação.");
  return { text, snapshot };
});
