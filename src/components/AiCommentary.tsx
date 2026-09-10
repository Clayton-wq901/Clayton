/** Cartão reutilizável de comentário gerado pela IA (sob demanda). */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { getAiInsight } from "@/lib/ai-insight.functions";

export function AiCommentary({
  kind,
  buildContext,
  title = "Análise Tática da IA",
  cta = "Gerar Insights",
}: {
  kind: "match" | "bingao" | "radar";
  buildContext: () => string;
  title?: string;
  cta?: string;
}) {
  const fn = useServerFn(getAiInsight);
  const [text, setText] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => fn({ data: { kind, context: buildContext() } }),
    onSuccess: (r) => setText(r.text),
  });

  return (
    <div className="rounded-2xl bg-card border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/40 text-primary font-semibold disabled:opacity-50"
        >
          {m.isPending ? "Analisando…" : text ? "Refazer" : cta}
        </button>
      </div>
      {m.isError && <p className="text-[11px] text-destructive">{(m.error as Error).message}</p>}
      {text ? (
        <p className="text-[12px] leading-relaxed whitespace-pre-line">{text}</p>
      ) : (
        !m.isPending && !m.isError && (
          <p className="text-[11px] text-muted-foreground">Clique em gerar para ler a interpretação estatística deste jogo.</p>
        )
      )}
    </div>
  );
}
