import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Loader2, RotateCw, Trash2, CheckCircle2, XCircle, Clock, Ban, ChevronDown, ChevronUp, Activity } from "lucide-react";
import {
  getFixture,
  getFixtureStatistics,
  FINISHED_STATUSES,
  type ApiFixture,
  type ApiTeamStats,
} from "@/lib/api-football.functions";
import { listFechamentos, deleteFechamento, saveFechamentoCheck, type Fechamento } from "@/lib/fechamentos";
import { listMatchPredictions, type MatchPrediction } from "@/lib/match-predictions";
import { buildCalibration, MIN_CALIBRATION_SAMPLE } from "@/lib/ticket-calibration";

type SavedGame = { id: number; home: string; away: string; league?: string; time?: string; p?: number; pick?: string; side?: "home" | "away" | null; /** mercado próprio do jogo nos bilhetes mistos */ market?: string };
type SavedMarket = { market: string; label: string; games: SavedGame[]; conf?: number; confLevel?: string };

type GameCheck = { id: number; label: string; hit: boolean | null; result: string; score?: string | null; corners?: number | null; voided?: boolean };
type TicketCheck = { market: string; label: string; games: GameCheck[]; hits: number; green: boolean; pending: boolean; voided?: boolean };
type CheckResult = { at: string; tickets: TicketCheck[]; green: boolean; pending: boolean };

/** Jogos que nunca vão gerar resultado — não podem deixar o fechamento eternamente pendente. */
const VOID_STATUSES = new Set(["PST", "CANC", "ABD", "AWD", "WO", "TBD", "SUSP"]);

function markets(f: Fechamento): SavedMarket[] {
  const raw = (f.summary as Record<string, unknown> | null)?.markets;
  return Array.isArray(raw) ? (raw as SavedMarket[]) : [];
}
type SelGame = { id: number; home: string; away: string; league?: string; time?: string; pUnder15?: number; lambdaTotal?: number };
type SelResult = { id: number; home: string; away: string; score: string | null; under15: boolean | null; voided?: boolean };
type SelectionCheck = { at: string; games: SelResult[]; hits: number; total: number };

function selection(f: Fechamento): SelGame[] {
  const raw = (f.summary as Record<string, unknown> | null)?.selection;
  return Array.isArray(raw) ? (raw as SelGame[]) : [];
}
function savedSelectionCheck(f: Fechamento): SelectionCheck | null {
  const raw = (f.summary as Record<string, unknown> | null)?.selectionCheck;
  return raw && typeof raw === "object" ? (raw as SelectionCheck) : null;
}

function savedCheck(f: Fechamento): CheckResult | null {
  const raw = (f.summary as Record<string, unknown> | null)?.check;
  return raw && typeof raw === "object" ? (raw as CheckResult) : null;
}

function statNum(stats: ApiTeamStats["statistics"] | undefined, type: string): number {
  const v = stats?.find((s) => s.type === type)?.value;
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return isFinite(n as number) ? (n as number) : 0;
}

const EXACT: Record<string, [number, number]> = { B1: [1, 0], B2: [2, 0], B3: [2, 1] };

/** Confere o placar exato respeitando o lado escolhido (casa/fora); sem lado, aceita os dois. */
function scoreHit(market: string, h: number, a: number, side?: "home" | "away" | null): boolean {
  const ex = EXACT[market];
  if (!ex) return h === a; // B4/B5 exigem empate (escanteios validados fora)
  const [hi, lo] = ex;
  if (side === "home") return h === hi && a === lo;
  if (side === "away") return h === lo && a === hi;
  return (h === hi && a === lo) || (h === lo && a === hi);
}


export function AiLevelPanel() {
  const queryClient = useQueryClient();
  const fetchFixture = useServerFn(getFixture);
  const fetchStats = useServerFn(getFixtureStatistics);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(0);
  const lastAuto = useRef<Map<string, number>>(new Map());
  const running = useRef(false);

  const listQuery = useQuery({ queryKey: ["fechamentos"], queryFn: listFechamentos, staleTime: 30_000 });
  const all: Fechamento[] = listQuery.data ?? [];
  const list = useMemo(() => all.filter((f) => markets(f).length > 0), [all]);

  const deleteMut = useMutation({
    mutationFn: deleteFechamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fechamentos"] }),
  });
  const saveCheckMut = useMutation({
    mutationFn: saveFechamentoCheck,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fechamentos"] }),
  });

  const conferir = async (f: Fechamento) => {
    if (running.current) return;
    running.current = true;
    setBusyId(f.id);
    try {
      const ms = markets(f);
      const sel = selection(f);
      const ids = Array.from(new Set([...ms.flatMap((m) => m.games.map((g) => g.id)), ...sel.map((g) => g.id)]));
      const fxMap: Record<number, ApiFixture | null> = {};
      for (const id of ids) {
        try {
          fxMap[id] = (await queryClient.ensureQueryData({
            queryKey: ["fixture", id],
            queryFn: () => fetchFixture({ data: { id } }),
            staleTime: 60_000,
          })) as ApiFixture | null;
        } catch {
          fxMap[id] = null;
        }
      }

      // Escanteios: só para jogos encerrados que participam de B4/B5 (economiza chamadas)
      const cornerNeeded = new Set<number>();
      for (const m of ms) {
        for (const g of m.games) {
          const gm = g.market ?? m.market;
          if (gm !== "B4" && gm !== "B5") continue;
          const fx = fxMap[g.id];
          if (fx && FINISHED_STATUSES.has(fx.fixture.status.short)) cornerNeeded.add(g.id);
        }
      }

      const cornersMap: Record<number, number | null> = {};
      for (const id of cornerNeeded) {
        try {
          const st = (await queryClient.ensureQueryData({
            queryKey: ["fixture-stats", id],
            queryFn: () => fetchStats({ data: { id } }),
            staleTime: 10 * 60_000,
          })) as ApiTeamStats[];
          const total = st.reduce((s, t) => s + statNum(t.statistics, "Corner Kicks"), 0);
          cornersMap[id] = st.length > 0 ? total : null;
        } catch {
          cornersMap[id] = null;
        }
      }

      const now = Date.now();
      const STALE_MS = 6 * 60 * 60 * 1000;

      const tickets: TicketCheck[] = ms.map((m) => {
        const games: GameCheck[] = m.games.map((g) => {
          const gm = g.market ?? m.market;
          const fx = fxMap[g.id];
          const label = `${gm !== m.market ? `[${gm}] ` : ""}${g.home} × ${g.away}${g.pick ? ` → ${g.pick}` : ""}`;
          const short = fx?.fixture.status.short;
          const kickoff = fx?.fixture.date ? new Date(fx.fixture.date).getTime() : g.time ? new Date(g.time).getTime() : 0;
          const stale = kickoff > 0 && now - kickoff > STALE_MS;

          // Adiado/cancelado: não conta como erro nem trava a conferência
          if (short && VOID_STATUSES.has(short)) {
            return { id: g.id, label, hit: null, result: short === "PST" ? "adiado" : "cancelado", score: null, corners: null, voided: true };
          }
          if (!fx || !short || !FINISHED_STATUSES.has(short)) {
            // jogo travado sem resultado muito depois do horário → anula em vez de ficar pendente eterno
            if (stale) {
              return { id: g.id, label, hit: null, result: "sem resultado", score: null, corners: null, voided: true };
            }
            return { id: g.id, label, hit: null, result: short ?? "—", score: null, corners: null };
          }

          const h = fx.goals.home ?? 0;
          const a = fx.goals.away ?? 0;
          const c = cornersMap[g.id] ?? null;
          let hit = scoreHit(gm, h, a, g.side);
          const score = `${h}x${a}`;
          let result = score;
          if (gm === "B4" || gm === "B5") {
            if (hit) {
              // empate confirmado, mas escanteios ainda indisponíveis
              if (c == null) {
                // muito tempo depois do jogo sem escanteios → anula essa linha
                if (stale) return { id: g.id, label, hit: null, result: `${score} · escanteios n/d`, score, corners: null, voided: true };
                return { id: g.id, label, hit: null, result: `${score} · escanteios n/d`, score, corners: null };
              }
              hit = gm === "B4" ? c > 9.5 : c < 9.5;
            }
            result = `${score}${c != null ? ` · ${c} esc.` : ""}`;
          }
          return { id: g.id, label, hit, result, score, corners: c };
        });


        const live = games.filter((g) => !g.voided);
        const missed = live.some((g) => g.hit === false);
        // um erro confirmado já define RED — não precisa esperar os pendentes
        const pending = !missed && live.some((g) => g.hit === null);
        const hits = live.filter((g) => g.hit === true).length;
        const voided = live.length === 0;
        return {
          market: m.market,
          label: m.label,
          games,
          hits,
          green: !voided && !pending && !missed && hits === live.length,
          pending,
          voided,
        };
      });


      const valid = tickets.filter((t) => !t.voided);
      const check: CheckResult = {
        at: new Date().toISOString(),
        tickets,
        green: valid.some((t) => t.green),
        pending: valid.some((t) => t.pending),
      };
      // Conferência da seleção do filtro (os jogos aprovados terminaram Under 1.5?)
      const selGames: SelResult[] = sel.map((g) => {
        const fx = fxMap[g.id];
        const short = fx?.fixture.status.short;
        const kickoff = fx?.fixture.date ? new Date(fx.fixture.date).getTime() : g.time ? new Date(g.time).getTime() : 0;
        const stale = kickoff > 0 && now - kickoff > STALE_MS;
        if (short && VOID_STATUSES.has(short)) return { id: g.id, home: g.home, away: g.away, score: null, under15: null, voided: true };
        if (!fx || !short || !FINISHED_STATUSES.has(short)) {
          return { id: g.id, home: g.home, away: g.away, score: null, under15: null, voided: stale };
        }
        const h = fx.goals.home ?? 0;
        const a = fx.goals.away ?? 0;
        return { id: g.id, home: g.home, away: g.away, score: `${h}x${a}`, under15: h + a <= 1 };
      });
      const selDone = selGames.filter((g) => g.under15 !== null);
      const selectionCheck: SelectionCheck | undefined = sel.length
        ? { at: new Date().toISOString(), games: selGames, hits: selDone.filter((g) => g.under15).length, total: selDone.length }
        : undefined;

      const summary = { ...(f.summary as Record<string, unknown>), check, ...(selectionCheck ? { selectionCheck } : {}) };
      await saveCheckMut.mutateAsync({ id: f.id, summary });
    } finally {
      running.current = false;
      setBusyId(null);
    }
  };

  // Re-tenta a conferência automática a cada 2 min enquanto houver pendências
  useEffect(() => {
    const t = setInterval(() => setAutoTick((n) => n + 1), 120_000);
    return () => clearInterval(t);
  }, []);

  // Conferência automática: fechamentos com jogos encerrados e ainda pendentes
  useEffect(() => {
    if (busyId || running.current) return;
    const now = Date.now();
    const target = list.find((f) => {
      const prev = savedCheck(f);
      if (prev && !prev.pending) return false;
      const last = lastAuto.current.get(f.id) ?? 0;
      if (now - last < 10 * 60_000) return false; // no máximo 1 tentativa a cada 10 min
      const times = markets(f).flatMap((m) => m.games.map((g) => (g.time ? new Date(g.time).getTime() : 0)));
      if (times.length === 0) return false;
      // basta o primeiro jogo ter terminado (+2h) para já registrar o parcial
      return Math.min(...times.filter(Boolean)) + 2 * 60 * 60 * 1000 < now;
    });
    if (!target) return;
    lastAuto.current.set(target.id, now);
    void conferir(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, busyId, autoTick]);

  const conferirTodos = async () => {
    for (const f of list) {
      const c = savedCheck(f);
      if (c && !c.pending) continue;
      lastAuto.current.set(f.id, Date.now());
      await conferir(f);
    }
    await listQuery.refetch();
  };

  const calibration = useMemo(() => buildCalibration(list), [list]);

  const stats = useMemo(() => {
    let green = 0;
    let red = 0;
    let pending = 0;
    let ticketGreen = 0;
    let ticketTotal = 0;
    let hitLines = 0;
    let totalLines = 0;
    const byMarket = new Map<string, { n: number; green: number }>();

    let selHit = 0;
    let selTotal = 0;
    for (const f of list) {
      const sc = savedSelectionCheck(f);
      if (sc) { selHit += sc.hits; selTotal += sc.total; }
      const c = savedCheck(f);
      if (!c) { pending++; continue; }
      if (c.pending) pending++;
      else if (c.green) green++;
      else red++;
      for (const t of c.tickets) {
        if (t.pending || t.voided) continue;
        ticketTotal++;
        if (t.green) ticketGreen++;
        const m = byMarket.get(t.market) ?? { n: 0, green: 0 };
        m.n++;
        if (t.green) m.green++;
        byMarket.set(t.market, m);
        for (const g of t.games) {
          if (g.voided || g.hit === null) continue;
          totalLines++;
          if (g.hit) hitLines++;
        }
      }
    }
    const decided = green + red;
    return {
      green, red, pending, decided,
      rate: decided > 0 ? Math.round((green / decided) * 100) : 0,
      ticketGreen, ticketTotal,
      ticketRate: ticketTotal > 0 ? Math.round((ticketGreen / ticketTotal) * 100) : 0,
      lineRate: totalLines > 0 ? Math.round((hitLines / totalLines) * 100) : 0,
      hitLines, totalLines,
      selHit, selTotal,
      selRate: selTotal > 0 ? Math.round((selHit / selTotal) * 100) : 0,
      byMarket: ["B1", "B2", "B3", "B4", "B5", "V1", "V2", "V3", "V4", "V5"]
        .filter((k) => k.startsWith("B") || (byMarket.get(k)?.n ?? 0) > 0)
        .map((k) => ({ market: k, ...(byMarket.get(k) ?? { n: 0, green: 0 }) })),

    };
  }, [list]);

  const [activeTab, setActiveTab] = useState<"bingao" | "match">("bingao");
  
  const matchQuery = useQuery({ 
    queryKey: ["match-predictions"], 
    queryFn: listMatchPredictions,
    enabled: activeTab === "match"
  });
  const matchPredictions = matchQuery.data ?? [];

  const updatePredictionMut = useMutation({
    mutationFn: async ({ id, result }: { id: string; result: NonNullable<MatchPrediction["result"]> }) => {
      const { error } = await supabase
        .from("ai_predictions")
        .update({ result: result as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["match-predictions"] }),
  });

  const conferirPartida = async (p: MatchPrediction) => {
    setBusyId(p.id);
    try {
      const fx = (await queryClient.ensureQueryData({
        queryKey: ["fixture", p.fixture_id],
        queryFn: () => fetchFixture({ data: { id: p.fixture_id } }),
        staleTime: 60_000,
      })) as ApiFixture | null;

      if (!fx || !FINISHED_STATUSES.has(fx.fixture.status.short)) return;

      const h = fx.goals.home ?? 0;
      const a = fx.goals.away ?? 0;
      const score = `${h}x${a}`;
      let hit = false;
      let actual = score;

      if (p.market === "1X2") {
        const winner = h > a ? "home" : h < a ? "away" : "draw";
        // Recalculamos qual foi a escolha da IA baseada na maior probabilidade registrada em features
        const { pHome, pDraw, pAway } = p.features;
        const predictedWinner = pHome > pDraw && pHome > pAway ? "home" : 
                               pAway > pHome && pAway > pDraw ? "away" : "draw";
        hit = winner === predictedWinner;
        actual = winner;
      } else if (p.market === "U1.5") {
        hit = h + a <= 1.5;
      } else if (p.market === "BTTS") {
        const btts = h > 0 && a > 0;
        const predictedBtts = p.features.pBTTS >= 0.5;
        hit = btts === predictedBtts;
        actual = btts ? "SIM" : "NÃO";
      } else if (p.market === "SCORE") {
        // Para o placar exato, precisamos saber qual foi o placar previsto (guardado em features)
        const predScore = p.features.predictedScore; // "1-0" etc
        hit = score === predScore?.replace("-", "x");
      }

      await updatePredictionMut.mutateAsync({
        id: p.id,
        result: { hit, actual, settled_at: new Date().toISOString(), score }
      });
    } finally {
      setBusyId(null);
    }
  };

  const conferirTodasPartidas = async () => {
    for (const p of matchPredictions) {
      if (!p.result || p.result.hit === null) {
        await conferirPartida(p);
      }
    }
  };


  return (
    <div className="mx-3 my-8 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
      <div className="flex items-center gap-4 px-6 py-6 border-b border-white/5 bg-blue-600/5 relative">
        <div className="w-16 h-16 rounded-[1.25rem] bg-blue-600/20 flex items-center justify-center border border-blue-600/40 shadow-inner relative z-10">
          <Activity className="w-8 h-8 text-blue-400 drop-shadow-[0_0_10px_rgba(234,88,12,0.4)]" />
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <div className="text-base font-black uppercase tracking-wider text-blue-400">Assertividade OneOption IA</div>
          <div className="text-[12px] text-muted-foreground font-semibold leading-relaxed mt-1 mb-3">
            Monitoramento técnico de performance e calibração dos modelos preditivos.
          </div>
          <div className="flex gap-6">
            <button 
              onClick={() => setActiveTab("bingao")}
              className={`text-[11px] font-black uppercase tracking-[0.15em] transition-all relative ${activeTab === 'bingao' ? 'text-emerald-400' : 'text-muted-foreground/60 hover:text-emerald-400/80'}`}
            >
              Bingão IA
              {activeTab === 'bingao' && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />}
            </button>
            <button 
              onClick={() => setActiveTab("match")}
              className={`text-[11px] font-black uppercase tracking-[0.15em] transition-all relative ${activeTab === 'match' ? 'text-emerald-400' : 'text-muted-foreground/60 hover:text-emerald-400/80'}`}
            >
              Mercado (1X2/U1.5)
              {activeTab === 'match' && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-10">
          <button
            onClick={activeTab === 'bingao' ? conferirTodos : conferirTodasPartidas}
            disabled={!!busyId}
            className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-90 shadow-lg shadow-emerald-900/20"
            title="Conferir tudo agora"
          >
            {busyId ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCw className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-4">
        {[
          { label: "Taxa de Acerto", val: `${stats.rate}%`, sub: `${stats.green} green · ${stats.red} red`, color: "text-emerald-400" },
          { label: "Bilhetes Green", val: `${stats.ticketRate}%`, sub: `${stats.ticketGreen}/${stats.ticketTotal} bilhetes`, color: "text-foreground" },
          { label: "Acerto de Linhas", val: `${stats.lineRate}%`, sub: `${stats.hitLines}/${stats.totalLines} jogos`, color: "text-foreground" },
          { label: "Filtro λ < 1.50", val: `${stats.selRate}%`, sub: `${stats.selHit}/${stats.selTotal} aprovados`, color: stats.selTotal > 0 && stats.selRate >= 60 ? "text-emerald-400" : "text-foreground" },
          { label: "Aguardando", val: stats.pending, sub: `${stats.decided} conferidos`, color: "text-amber-300" }
        ].map((s, i) => (
          <div key={i} className="rounded-2xl bg-black/40 border border-white/10 p-4 shadow-inner group hover:border-emerald-500/30 transition-colors">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">{s.label}</div>
            <div className={`text-2xl font-black tabular-nums leading-none ${s.color}`}>{s.val}</div>
            <div className="text-[10px] text-muted-foreground/80 font-bold mt-2">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-5 gap-2">
          {stats.byMarket.map((m) => {
            const pct = m.n > 0 ? Math.round((m.green / m.n) * 100) : 0;
            return (
              <div key={m.market} className="rounded-xl bg-black/40 border border-white/10 p-2 text-center group hover:border-emerald-500/40 transition-colors">
                <div className="text-[9px] font-black uppercase text-muted-foreground/60 mb-0.5">{m.market}</div>
                <div className={`text-sm font-black tabular-nums ${pct >= 60 ? 'text-emerald-400' : 'text-foreground'}`}>{pct}%</div>
                <div className="text-[8px] font-bold text-muted-foreground/40 mt-1 uppercase">{m.green}/{m.n}</div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] font-bold text-emerald-400/60 flex items-center gap-2 bg-emerald-500/5 rounded-lg px-3 py-2 border border-emerald-500/10">
          <Brain className="w-3 h-3" />
          <span>
            {calibration.sample >= MIN_CALIBRATION_SAMPLE
              ? `IA Calibrada: O modelo matemático foi refinado e otimizado com base em ${calibration.sample} bilhetes já conferidos.`
              : `Calibração em curso: Faltam ${MIN_CALIBRATION_SAMPLE - calibration.sample} fechamentos para a IA atingir o nível máximo de ajuste fino.`}
          </span>
        </div>
      </div>


      {listQuery.isLoading && (
        <div className="px-3 pb-3 text-[11px] text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Carregando fechamentos…
        </div>
      )}

      {!listQuery.isLoading && list.length === 0 && (
        <div className="px-3 pb-4 text-[11px] text-muted-foreground">
          Nenhum fechamento registrado. Inicie a busca na aba "Bingão", escolha 4 jogos aprovados e salve para monitorar sua assertividade.
        </div>
      )}

      <div className="px-3 pb-3 space-y-2">
        {activeTab === "bingao" ? (list.map((f) => {
          const c = savedCheck(f);
          const badge = !c
            ? { txt: "não conferido", cls: "bg-white/5 text-muted-foreground border-white/10", Icon: Clock }
            : c.pending
              ? { txt: "em andamento", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", Icon: Clock }
              : c.green
                ? { txt: "GREEN", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", Icon: CheckCircle2 }
                : { txt: "RED", cls: "bg-destructive/20 text-destructive border-destructive/40", Icon: XCircle };
          return (
            <div key={f.id} className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden shadow-xl transition-all hover:border-emerald-500/30">
              <div 
                className="flex items-center gap-3 px-3 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-inner ${
                    !c ? "bg-white/5 text-muted-foreground border-white/10" :
                    c.pending ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                    c.green ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/5" :
                    "bg-destructive/20 text-destructive border-destructive/40"
                  }`}>
                    <badge.Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black tracking-tight">{f.name}</div>
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                      {new Date(f.created_at).toLocaleDateString("pt-BR")} · {markets(f).length} bilhetes · {badge.txt}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center transition-transform ${expandedId === f.id ? "rotate-180" : ""}`}>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {expandedId === f.id && (
                <div className="p-2.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(f.created_at).toLocaleString("pt-BR")}
                      {c ? ` · conferido ${new Date(c.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </div>
                    <div className="flex items-center gap-1">
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
                  </div>

                  {selection(f).length > 0 && (() => {
                    const sc = savedSelectionCheck(f);
                    const sel = selection(f);
                    return (
                      <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-black uppercase tracking-widest text-sky-300">Auditoria da Prova Real (Under 1.5)</span>
                          <span className="ml-auto text-[10px] font-black tabular-nums text-sky-200">
                            {sc ? `${sc.hits}/${sc.total} acertos` : `${sel.length} jogos`}
                          </span>
                        </div>
                        <div className="grid gap-1">
                          {sel.map((g) => {
                            const r = sc?.games.find((x) => x.id === g.id);
                            const cls = !r || r.under15 === null
                              ? "border-white/10 bg-white/[0.03] text-muted-foreground"
                              : r.under15
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                : "border-destructive/40 bg-destructive/10 text-destructive";
                            return (
                              <div key={`sel-${g.id}`} className={`flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg border ${cls}`}>
                                <span className="flex-1 min-w-0 truncate font-bold">{g.home} × {g.away}</span>
                                {typeof g.pUnder15 === "number" && (
                                  <span className="text-[9px] font-black tabular-nums opacity-70">U1.5 {Math.round(g.pUnder15 * 100)}%</span>
                                )}
                                <span className="text-[10px] font-black tabular-nums w-10 text-right">{r?.score ?? "—"}</span>
                                {r && r.under15 !== null ? (
                                  r.under15 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />
                                ) : r?.voided ? <Ban className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 opacity-50" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="divide-y divide-white/5 border-t border-white/5">
                    {markets(f).map((m, i) => {
                      const tc = c?.tickets.find((t) => t.market === m.market);
                      return (
                        <div key={`${f.id}-${m.market}`} className="py-3 px-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-6 rounded-lg bg-white/10 text-[11px] font-black flex items-center justify-center border border-white/10 shadow-sm">
                              {m.market || `B${i + 1}`}
                            </span>
                            <span className="text-[12px] font-bold truncate flex-1 tracking-tight">{m.label}</span>
                            {tc && (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1 uppercase tracking-wider ${tc.voided ? "bg-white/5 text-muted-foreground border-white/10" : tc.green ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : tc.pending ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-destructive/20 text-destructive border-destructive/40"}`}>
                                {tc.voided ? (
                                  <><Ban className="w-3 h-3" /> VOID</>
                                ) : (
                                  <>{tc.hits}/{tc.games.filter((x) => !x.voided).length} {tc.green ? "GREEN" : tc.pending ? "..." : "RED"}</>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="grid gap-1.5 pl-2">
                            {m.games.map((g) => {
                              const gc = tc?.games.find((x) => x.id === g.id);
                              return (
                                <div key={`${m.market}-${g.id}`} className="flex items-center gap-3 text-[11px] bg-white/[0.03] p-2 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate leading-tight">{g.home} × {g.away}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span
                                        className={`shrink-0 font-black px-1.5 py-0.5 rounded text-[8px] border uppercase tracking-tighter ${
                                          g.side === "home"
                                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                            : g.side === "away"
                                              ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                                              : "bg-violet-500/10 text-violet-200 border-violet-500/20"
                                        }`}
                                      >
                                        {g.side === "home" ? "CASA" : g.side === "away" ? "FORA" : "EMPATE"}
                                      </span>
                                      <span className="text-[9px] font-medium text-muted-foreground/60 truncate">{g.pick}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex flex-col items-end">
                                      <span className="tabular-nums font-black text-xs text-foreground leading-none">
                                        {gc?.score ?? (gc ? gc.result : "—")}
                                      </span>
                                      {gc?.corners != null && (
                                        <span className="text-[9px] font-bold text-muted-foreground/50 tabular-nums">
                                          {gc.corners} esc.
                                        </span>
                                      )}
                                    </div>
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shadow-inner border ${
                                      gc?.voided ? "bg-white/5 text-muted-foreground border-white/10" :
                                      gc?.hit === null ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                                      gc?.hit ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                                      "bg-destructive/20 text-destructive border-destructive/40"
                                    }`}>
                                      {gc?.voided ? "⊘" : gc?.hit === null ? "•" : gc?.hit ? "✓" : "✗"}
                                    </div>
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
              )}
            </div>
          );
        })) : (matchPredictions.length === 0 ? (
          <div className="px-3 pb-4 text-[11px] text-muted-foreground">
            Nenhuma previsão individual registrada. Abra a página de um jogo e acesse a aba "Previsão IA" para gerar e salvar previsões automáticas.
          </div>
        ) : matchPredictions.map((p) => {
          const badge = !p.result || p.result.hit === null
            ? { txt: "pendente", cls: "bg-white/5 text-muted-foreground border-white/10", Icon: Clock }
            : p.result.hit
              ? { txt: "GREEN", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", Icon: CheckCircle2 }
              : { txt: "RED", cls: "bg-destructive/20 text-destructive border-destructive/40", Icon: XCircle };

          return (
            <div key={p.id} className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden shadow-xl transition-all hover:border-white/20">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-inner ${badge.cls}`}>
                  <badge.Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black tracking-tight">
                    {p.features.home && p.features.away ? `${p.features.home} × ${p.features.away}` : `Jogo #${p.fixture_id}`}
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                    {p.market} · {(p.probability * 100).toFixed(0)}% · {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.result?.score && (
                    <span className="text-xs font-black tabular-nums">{p.result.score.replace("x", " - ")}</span>
                  )}
                  {!p.result || p.result.hit === null ? (
                    <button
                      onClick={() => conferirPartida(p)}
                      disabled={busyId === p.id}
                      className="text-[9px] font-black px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                    >
                      CONFERIR
                    </button>
                  ) : (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${p.result.hit ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-destructive/20 text-destructive border-destructive/40"}`}>
                      {p.result.hit ? "ACERTO" : "ERRO"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
}

