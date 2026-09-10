import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criteriaChecks, blockReason, type CriteriaInput } from "@/lib/bingao-criteria";

export interface CriteriaDetails extends CriteriaInput {
  home: string;
  away: string;
  league: string;
}

/** Tela de detalhes dos critérios de seleção do Bingão (por que o jogo entrou ou foi cortado). */
export function CriteriaDetailsDialog({
  match,
  onClose,
}: {
  match: CriteriaDetails | null;
  onClose: () => void;
}) {
  const open = !!match;
  const checks = match ? criteriaChecks(match) : [];
  const reason = match ? blockReason(match) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">
              {match ? `${match.home} × ${match.away}` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {match?.league} · Validação técnica do padrão Under 1.5
            </DialogDescription>
          </DialogHeader>

        <div
          className={`text-xs font-semibold rounded-md px-3 py-2 border ${
            reason
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}
        >
          {reason ? `Removido: ${reason}` : "Aprovado em todos os critérios"}
        </div>

        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li
              key={c.key}
              className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-2"
            >
              <span
                className={`mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${
                  c.pass ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {c.pass ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold">{c.label}</span>
                  <span className="text-[11px] tabular-nums font-bold shrink-0">
                    {c.value}
                    <span className="text-muted-foreground font-normal"> · {c.rule}</span>
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{c.hint}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-[10px] text-muted-foreground leading-snug">
          λ = gols esperados pelo modelo Poisson + Dixon‑Coles. GM/GS = médias de gols marcados e
          sofridos (mandante em casa, visitante fora). Basta um critério reprovado para o jogo sair
            da lista.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
