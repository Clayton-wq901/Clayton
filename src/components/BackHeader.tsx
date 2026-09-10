import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Cabeçalho com seta de voltar: volta no histórico ou cai na tela inicial. */
export function BackHeader({ title, extra }: { title: string; extra?: ReactNode }) {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void router.navigate({ to: "/" });
    }
  };

  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-2">
      <button
        type="button"
        onClick={goBack}
        aria-label="Voltar"
        className="w-9 h-9 shrink-0 rounded-full bg-card border border-white/10 flex items-center justify-center text-foreground hover:bg-white/10"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <h1 className="text-lg font-bold flex items-center gap-2 min-w-0 truncate">{title}</h1>
      {extra}
    </div>
  );
}
