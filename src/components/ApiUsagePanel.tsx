import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, X, Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { getApiStatus } from "@/lib/api-football.functions";

export function ApiUsagePanel() {
  const [open, setOpen] = useState(false);
  const fetchStatus = useServerFn(getApiStatus);
  const q = useQuery({
    queryKey: ["api-status"],
    queryFn: () => fetchStatus({}),
    staleTime: 60_000,
    refetchInterval: open ? 30_000 : false,
    enabled: open,
  });

  const s = q.data;
  const current = s?.requests.current ?? 0;
  const limit = s?.requests.limit_day ?? 7500;
  const pct = Math.min(100, Math.round((current / Math.max(1, limit)) * 100));
  const remaining = Math.max(0, limit - current);
  const barColor = pct < 60 ? "bg-emerald-500" : pct < 85 ? "bg-primary" : "bg-destructive";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Uso da API"
        className="w-10 h-10 rounded-full bg-black/40 border border-white/5 flex items-center justify-center hover:border-primary/60 transition"
      >
        <Activity className="w-4 h-4 text-primary" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md m-3 rounded-3xl border border-white/10 bg-gradient-to-b from-neutral-900 to-black p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold leading-tight">Uso da API-Football</h2>
                  <p className="text-[11px] text-muted-foreground">Monitor em tempo real</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {q.isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>}
            {q.data === null && !q.isLoading && (
              <p className="text-sm text-destructive py-6 text-center">Não foi possível obter o status.</p>
            )}

            {s && (
              <>
                <div className="rounded-2xl bg-black/50 border border-white/5 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Requisições hoje</span>
                    <span className="text-[11px] text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-black tabular-nums">{current.toLocaleString("pt-BR")}</span>
                    <span className="text-sm text-muted-foreground">/ {limit.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Restantes</span>
                    <span className="font-bold tabular-nums text-emerald-400">{remaining.toLocaleString("pt-BR")}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-2xl bg-black/50 border border-white/5 p-3">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Plano</p>
                    <p className="text-sm font-bold mt-1">{s.subscription.plan}</p>
                  </div>
                  <div className="rounded-2xl bg-black/50 border border-white/5 p-3">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Status</p>
                    <p className="text-sm font-bold mt-1 flex items-center gap-1">
                      {s.subscription.active ? (
                        <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Ativo</>
                      ) : (
                        <><AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Inativo</>
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/50 border border-white/5 p-3 col-span-2">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Expira em</p>
                    <p className="text-sm font-bold mt-1">
                      {new Date(s.subscription.end).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-center mt-3">
                  Contador reinicia diariamente às 00:00 UTC
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
