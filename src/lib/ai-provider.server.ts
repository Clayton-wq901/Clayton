/**
 * Provedor de IA do app: Google Gemini (chave própria do usuário).
 * Todas as chamadas de IA passam por aqui.
 */

export interface ChatAttachment {
  name: string;
  mime: string;
  /** data URL base64 */
  dataUrl: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
}

export const getGeminiModel = () => process.env["GEMINI_MODEL"] ?? "gemini-3.6-flash";

function requireKey() {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("IA indisponível: configure a variável GEMINI_API_KEY.");
  return key;
}

function toParts(msg: ChatMessage) {
  const parts: Record<string, unknown>[] = [{ text: msg.content }];
  for (const a of msg.attachments ?? []) {
    const base64 = a.dataUrl.includes(",") ? a.dataUrl.split(",")[1]! : a.dataUrl;
    const mimeType = a.mime.split(";")[0] || "application/octet-stream";
    parts.push({ inlineData: { mimeType, data: base64 } });
  }
  return parts;
}

/** Chamada de texto ao Gemini. `system` são instruções de sistema (concatenadas). */
export async function geminiChat(opts: {
  system: string[];
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const key = requireKey();
  const model = getGeminiModel();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: opts.system.filter(Boolean).map((text) => ({ text })) },
        contents: opts.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: toParts(m),
        })),
        generationConfig: {
          temperature: opts.temperature ?? 0.6,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Muitas requisições ao Gemini. Tente em instantes.");
    if (res.status === 403 || res.status === 401)
      throw new Error("Chave do Gemini inválida ou sem permissão. Verifique GEMINI_API_KEY.");
    throw new Error(`Falha na IA [${res.status}]: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("A IA não retornou uma resposta válida.");
  return text;
}
