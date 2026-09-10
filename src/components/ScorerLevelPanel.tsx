/** Nível da IA (Artilheiros): conferência automática dos bilhetes de marcadores. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, CheckCircle2, Clock, Loader2, RotateCw, Trash2, XCircle } from "lucide-react";
import {
  getFixture,
  getFixtureEvents,
  FINISHED_STATUSES,
  type ApiEvent,
  type ApiFixture,
} from "@/lib/api-football.functions";
import { deleteFechamento, listFechamentos, saveFechamentoCheck, type Fechamento } from "@/lib/fechamentos";

export type SavedScorerPick = {
  playerId: number;
  name: string;
  photo?: string;
  teamName: string;
  opponent: string;
  fixtureId: number;
  kickoff: string;
  prob: number;
};
export type SavedScorerTicket = { n: number; label: string; combined: number; picks: SavedScorerPick[] };

type PickCheck = { playerId: number; name: string; hit: boolean | null; goals: number; result: string };
type TicketCheck = { n: number; label: string; picks: PickCheck[]; hits: number; green: boolean; pending: boolean };
type ScorerCheck = { at: string; tickets: TicketCheck[]; green: boolean; pending: boolean };

export function scorerTickets(f: Fechamento): SavedScorerTicket[] {
  const s = f.summary as Record<string, unknown> | null;
  if (s?.kind !== "artilheiros") return [];
  const raw = s?.scorers;
  return Array.isArray(raw) ? (raw as SavedScorerTicket[]) : [];
}
function savedCheck(f: Fechamento): ScorerCheck | null {
  const raw = (f.summary as Record<string, unknown> | null)?.check;
  return raw && typeof raw === "object" ? (raw as ScorerCheck) : null;
}

export function ScorerLevelPanel() {
  const queryClient = useQueryClient();
  const fetchFixture = useServerFn(getFixture);
  const fetchEvents = useServerFn(getFixtureEvents);
  const [busyId, setBusyId] = useState<string | null>(null);
  const autoRan = useRef<Set<string>>(new Set());

  const listQuery = useQuery({ queryKey: ["fechamentos"], queryFn: listFechamentos, staleTime: 30_000 });
  const list = useMemo(
    () => (listQuery.data ?? []).filter((f) => scorerTickets(f).length > 0),
    [listQuery.data],
  );

  const deleteMut = useMutation({
    mutationFn: deleteFechamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fechamentos"] }),
  });
  const saveCheckMut = useMutation({
    mutationFn: saveFechamentoCheck,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fechamentos"] }),
  });

  const conferir = async (f: Fechamento) => {
    setBusyId(f.id);
    try {
      const ts = scorerTickets(f);
      const ids = Array.from(new Set(ts.flatMap((t) => t.picks.map((p) => p.fixtureId))));

      const fxMap: Record<number, ApiFixture | null> = {};
      const goalsMap: Record<number, Record<number, number>> = {};
      for (const id of ids) {
        const fx = (await queryClient.ensureQueryData({
          queryKey: ["fixture", id],
          queryFn: () => fetchFixture({ data: { id } }),
          staleTime: 60_000,
        })) as ApiFixture | null;
        fxMap[id] = fx;
        if (!fx || !FINISHED_STATUSES.has(fx.fixture.status.short)) continue;
        try {
          const evs = (await queryClient.ensureQueryData({
            queryKey: ["fixture-events", id],
            queryFn: () => fetchEvents({ data: { id } }),
            staleTime: 24 * 60 * 60_000,
          })) as ApiEvent[];
          const byPlayer: Record<number, number> = {};
          for (const e of evs ?? []) {
            if (e.type !== "Goal" || e.detail === "Missed Penalty") continue;
            const pid = e.player?.id;
            if (!pid) continue;
            byPlayer[pid] = (byPlayer[pid] ?? 0) + 1;
          }
          goalsMap[id] = byPlayer;
        } catch {
          goalsMap[id] = {};
        }
      }

      const tickets: TicketCheck[] = ts.map((t) => {
        const picks: PickCheck[] = t.picks.map((p) => {
          const fx = fxMap[p.fixtureId];
          if (!fx || !FINISHED_STATUSES.has(fx.fixture.status.short)) {
            return { playerId: p.playerId, name: p.name, hit: null, goals: 0, result: fx ? fx.fixture.status.short : "—" };
          }
          const g = goalsMap[p.fixtureId]?.[p.playerId] ?? 0;
          return {
            playerId: p.playerId,
            name: p.name,
            hit: g > 0,
            goals: g,
            result: `${fx.goals.home ?? 0}x${fx.goals.away ?? 0}${g > 0 ? ` · ${g} gol${g > 1 ? "s" : ""}` : ""}`,
          };
        });
        const pending = picks.some((p) => p.hit === null);
        const hits = picks.filter((p) => p.hit === true).length;
        return { n: t.n, label: t.label, picks, hits, green: !pending && hits === picks.length && picks.length > 0, pending };
      });

      const check: ScorerCheck = {
        at: new Date().toISOString(),
        tickets,
        green: tickets.some((t) => t.green),
        pending: tickets.some((t) => t.pending),
      };
      await saveCheckMut.mutateAsync({ id: f.id, summary: { ...(f.summary as Record<string, unknown>), check } });
    } finally {
      setBusyId(null);
    }
  };

  // Conferência automática: 3h após o último jogo do fechamento.
  useEffect(() => {
    if (busyId) return;
    const now = Date.now();
    const target = list.find((f) => {
      if (autoRan.current.has(f.id)) return false;
      const prev = savedCheck(f);
      if (prev && !prev.pending) return false;
      const times = scorerTickets(f).flatMap((t) => t.picks.map((p) => new Date(p.kickoff).getTime() || 0));
      if (times.length === 0) return false;
      return Math.max(...times) + 3 * 60 * 60 * 1000 < now;
    });
    if (!target) return;
    autoRan.current.add(target.id);
    void conferir(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, busyId]);

  const stats = useMemo(() => {
    let green = 0, red = 0, pending = 0, tGreen = 0, tTotal = 0, pHit = 0, pTotal = 0;
    for (const f of list) {
      const c = savedCheck(f);
      if (!c) { pending++; continue; }
      if (c.pending) pending++;
      else if (c.green) green++;
      else red++;
      for (const t of c.tickets) {
        if (!t.pending) { tTotal++; if (t.green) tGreen++; }
        for (const p of t.picks) {
          if (p.hit === null) continue;
          pTotal++;
          if (p.hit) pHit++;
        }
      }
    }
    const decided = green + red;
    return {
      green, red, pending, decided,
      rate: decided > 0 ? Math.round((green / decided) * 100) : 0,
      tGreen, tTotal, tRate: tTotal > 0 ? Math.round((tGreen / tTotal) * 100) : 0,
      pHit, pTotal, pRate: pTotal > 0 ? Math.round((pHit / pTotal) * 100) : 0,
    };
  }, [list]);

  return (
    <div className="px-3 py-3 border-b border-white/5">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-card to-card border border-emerald-500/25 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
          <Brain className="w-4 h-4 text-emerald-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Nível da IA · Artilheiros</div>
            <div className="text-[11px] text-muted-foreground">
              {list.length} fechamento(s) · conferência automática pelos gols oficiais
            </div>
          </div>
          <button
            onClick={() => { autoRan.current.clear(); listQuery.refetch(); }}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Recarregar"
          >
            <RotateCw className={`w-4 h-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-3">
          <div className="rounded-xl bg-black/30 border border-emerald-500/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa de acerto</div>
            <div className="text-xl font-black text-emerald-400 tabular-nums">{stats.rate}%</div>
            <div className="text-[10px] text-muted-foreground">{stats.green} green · {stats.red} red</div>
          </div>
          <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Bilhetes green</div>
            <div className="text-xl font-black tabular-nums">{stats.tRate}%</div>
            <div className="text-[10px] text-muted-foreground">{stats.tGreen}/{stats.tTotal} bilhetes</div>
          </div>
          <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Jogadores que marcaram</div>
            <div className="text-xl font-black text-primary tabular-nums">{stats.pRate}%</div>
            <div className="text-[10px] text-muted-foreground">{stats.pHit}/{stats.pTotal} indicações</div>
          </div>
          <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Aguardando</div>
            <div className="text-xl font-black text-amber-300 tabular-nums">{stats.pending}</div>
          </div>
        </div>

        {!listQuery.isLoading && list.length === 0 && (
          <div className="px-3 pb-4 text-[11px] text-muted-foreground">
            Nenhum fechamento de artilheiros salvo. Gere os 3 bilhetes acima e clique em “Salvar fechamento”.
          </div>
        )}

        <div className="px-3 pb-3 space-y-2">
          {list.map((f) => {
            const c = savedCheck(f);
            const badge = !c
              ? { txt: "não conferido", cls: "bg-white/5 text-muted-foreground border-white/10", Icon: Clock }
              : c.pending
                ? { txt: "em andamento", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", Icon: Clock }
                : c.green
                  ? { txt: "GREEN", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", Icon: CheckCircle2 }
                  : { txt: "RED", cls: "bg-destructive/20 text-destructive border-destructive/40", Icon: XCircle };
            return (
              <div key={f.id} className="rounded-xl bg-black/30 border border-white/10 overflow-hidden">
                <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badge.cls}`}>
                    <badge.Icon className="w-3 h-3" /> {badge.txt}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold truncate">{f.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {new Date(f.created_at).toLocaleString("pt-BR")} · {scorerTickets(f).length} bilhetes
                    </div>
                  </div>
                  <button
                    onClick={() => conferir(f)}
                    disabled={busyId === f.id}
                    className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-40 flex items-center gap-1"
                  >
                    {busyId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                    Conferir
                  </button>
                  <button
                    onClick={() => { if (confirm(`Excluir ${f.name}?`)) deleteMut.mutate(f.id); }}
                    className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-white/5">
                  {scorerTickets(f).map((t) => {
                    const tc = c?.tickets.find((x) => x.n === t.n);
                    return (
                      <div key={`${f.id}-${t.n}`} className="px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-5 rounded bg-white/10 text-[10px] font-bold flex items-center justify-center">A{t.n}</span>
                          <span className="text-[11px] font-medium truncate flex-1">{t.label}</span>
                          {tc && (
                            <span className={`text-[10px] font-bold ${tc.green ? "text-emerald-400" : tc.pending ? "text-amber-300" : "text-destructive"}`}>
                              {tc.hits}/{tc.picks.length} {tc.green ? "GREEN" : tc.pending ? "…" : "RED"}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 grid gap-0.5">
                          {t.picks.map((p) => {
                            const pc = tc?.picks.find((x) => x.playerId === p.playerId);
                            return (
                              <div key={`${t.n}-${p.playerId}`} className="flex items-center gap-1.5 text-[10px]">
                                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                                  {p.name} · {p.teamName}
                                </span>
                                <span className="shrink-0 tabular-nums px-1.5 py-0.5 rounded bg-white/10 text-[9px]">
                                  {Math.round(p.prob * 100)}%
                                </span>
                                <span className="shrink-0 tabular-nums px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 text-[9px]">
                                  {pc ? pc.result : "—"}
                                </span>
                                {pc && (
                                  <span className={pc.hit === null ? "text-amber-300" : pc.hit ? "text-emerald-400" : "text-destructive"}>
                                    {pc.hit === null ? "•" : pc.hit ? "✓" : "✗"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
