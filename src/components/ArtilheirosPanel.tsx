/** Painel de Artilheiros e Assistências das principais ligas. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Crown, RotateCw, Ticket, Loader2, Save, Share2, Printer } from "lucide-react";
import { printFechamento, shareFechamento, type ExportFechamento } from "@/lib/fechamento-export";
import {
  getBookmakerFixtureIds,
  getTopScorers,
  getTopAssists,
  getFixturesByDate,
  type ApiPlayerStatRow,
  type ApiFixture,
} from "@/lib/api-football.functions";
import { ShimmerRows } from "@/components/Shimmer";
import { ScorerLevelPanel } from "@/components/ScorerLevelPanel";
import { saveFechamento } from "@/lib/fechamentos";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildScorerTickets,
  candidatesForFixture,
  isWithin24h,
  SCORER_LEAGUES,
  type ScorerTicket,
} from "@/lib/scorer-tickets";

const LEAGUES = [
  { id: 71, name: "Brasileirão A", icon: "🇧🇷" },
  { id: 72, name: "Brasileirão B", icon: "🇧🇷" },
  { id: 13, name: "Libertadores", icon: "🏆" },
  { id: 11, name: "Sul-Americana", icon: "🏆" },
  { id: 2, name: "Champions", icon: "⭐" },
  { id: 39, name: "Premier League", icon: "🏴" },
  { id: 140, name: "La Liga", icon: "🇪🇸" },
  { id: 135, name: "Serie A", icon: "🇮🇹" },
  { id: 78, name: "Bundesliga", icon: "🇩🇪" },
  { id: 61, name: "Ligue 1", icon: "🇫🇷" },
  { id: 128, name: "Liga Argentina", icon: "🇦🇷" },
  { id: 253, name: "MLS", icon: "🇺🇸" },
];

/** Temporada corrente aproximada: ligas europeias começam em agosto. */
function defaultSeason(leagueId: number) {
  const d = new Date();
  const europeanLike = ![71, 72, 73, 13, 11, 128, 253].includes(leagueId);
  return europeanLike && d.getMonth() < 6 ? d.getFullYear() - 1 : d.getFullYear();
}

type Mode = "goals" | "assists";

/** Converte os bilhetes de artilheiros no formato de exportação (PDF / compartilhar). */
function exportData(tickets: ScorerTicket[]): ExportFechamento {
  return {
    name: "Fechamento Artilheiros",
    date: new Date().toLocaleDateString("pt-BR"),
    tickets: tickets.map((t) => ({
      market: `A${t.n}`,
      label: `${t.label} · ${(t.combined * 100).toFixed(1)}% os 4`,
      picks: t.picks.map((p) => ({
        home: p.teamName,
        away: p.opponent,
        league: p.leagueName,
        time: p.kickoff,
        pick: `${p.name} marca`,
        p: p.prob,
      })),
    })),
  };
}


export function ArtilheirosPanel() {
  const [league, setLeague] = useState(LEAGUES[0].id);
  const [mode, setMode] = useState<Mode>("goals");
  const season = defaultSeason(league);

  const fetchScorers = useServerFn(getTopScorers);
  const fetchAssists = useServerFn(getTopAssists);

  const q = useQuery({
    queryKey: ["top-players", mode, league, season],
    queryFn: () =>
      mode === "goals"
        ? fetchScorers({ data: { league, season } })
        : fetchAssists({ data: { league, season } }),
    staleTime: 6 * 60 * 60_000,
  });

  const rows = (q.data ?? []) as ApiPlayerStatRow[];

  // ---- Bilhetes de artilheiros (busca 24h, igual ao Bingão) ----
  const fetchFixtures = useServerFn(getFixturesByDate);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [tickets, setTickets] = useState<ScorerTicket[] | null>(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  async function salvarFechamento() {
    if (!tickets || tickets.length === 0) return;
    setSaving(true);
    try {
      const now = new Date();
      const scorers = tickets.map((t) => ({
        n: t.n,
        label: t.label,
        combined: t.combined,
        picks: t.picks.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          photo: p.photo,
          teamName: p.teamName,
          opponent: p.opponent,
          fixtureId: p.fixtureId,
          kickoff: p.kickoff,
          prob: p.prob,
        })),
      }));
      await saveFechamento({
        name: `Artilheiros ${now.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        target_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        games: tickets.flatMap((t) => t.picks.map((p) => ({ id: p.fixtureId, home: p.isHome ? p.teamName : p.opponent, away: p.isHome ? p.opponent : p.teamName, league: p.leagueName }))),
        tickets: tickets.map((t) => ({ n: t.n, type: "artilheiro", label: t.label, detail: t.picks.map((p) => p.name).join(", "), conf: Math.round(t.combined * 100) })),
        summary: { kind: "artilheiros", scorers },
      });
      await queryClient.invalidateQueries({ queryKey: ["fechamentos"] });
      setProgress("Fechamento de artilheiros salvo. A conferência é automática após os jogos.");
    } catch (e) {
      const msg = (e as Error).message;
      setProgress(
        /permission denied|row-level security|JWT/i.test(msg)
          ? "Entre na sua conta (botão ENTRAR) para salvar o fechamento e ativar a conferência automática."
          : `Falha ao salvar: ${msg}`,
      );
    } finally {
      setSaving(false);
    }
  }
  const fetchBookmakerIds = useServerFn(getBookmakerFixtureIds);
  const [scanned, setScanned] = useState(0);

  async function generateTickets() {
    setScanning(true);
    setTickets(null);
    setScanned(0);
    try {
      setProgress("Buscando jogos das próximas 24h…");
      const now = new Date();
      const dates = [0, 1].map((d) => {
        const x = new Date(now.getTime() + d * 86400_000);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      });
      const lists = await Promise.all(dates.map((date) => fetchFixtures({ data: { date } })));
      const allowed = new Set<number>([...SCORER_LEAGUES, ...LEAGUES.map((l) => l.id)]);
      const all24h = (lists.flat() as ApiFixture[]).filter(
        (fx) => allowed.has(fx.league.id) && isWithin24h(fx, now.getTime()),
      );

      // Ligas ordenadas: principais primeiro, depois as com mais jogos na janela.
      const byLeague = new Map<number, ApiFixture[]>();
      for (const fx of all24h) {
        const arr = byLeague.get(fx.league.id) ?? [];
        arr.push(fx);
        byLeague.set(fx.league.id, arr);
      }
      const priority = new Set(LEAGUES.map((l) => l.id));
      const orderedLeagues = [...byLeague.entries()]
        .sort((a, b) => {
          const pa = priority.has(a[0]) ? 1 : 0;
          const pb = priority.has(b[0]) ? 1 : 0;
          if (pa !== pb) return pb - pa;
          return b[1].length - a[1].length;
        })
        .slice(0, 14);


      let fixtures = orderedLeagues
        .flatMap(([, fxs]) => fxs)
        .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
        .slice(0, 60);

      // Mantém só jogos com mercado aberto na Betano (fallback: casas principais).
      setProgress("Conferindo disponibilidade na Betano…");
      try {
        const idLists = await Promise.all(
          dates.map((date) => fetchBookmakerIds({ data: { date, bookmaker: 32, maxPages: 8 } })),
        );
        const betano = new Set<number>((idLists.flat() as number[]) ?? []);
        if (betano.size > 0) {
          const withOdds = fixtures.filter((fx) => betano.has(fx.fixture.id));
          if (withOdds.length >= 4) fixtures = withOdds;
        }
      } catch {
        /* se as odds falharem, segue sem o filtro */
      }
      setScanned(fixtures.length);

      if (fixtures.length === 0) {
        setProgress("Nenhum jogo elegível nas próximas 24h.");
        return;
      }

      setProgress(`Carregando artilheiros de ${orderedLeagues.length} liga(s)…`);
      const scorersByLeague = new Map<number, ApiPlayerStatRow[]>();
      await Promise.all(
        orderedLeagues.map(async ([id, fxs]) => {
          const seasonId = fxs[0]?.league.season ?? defaultSeason(id);
          const data = (await fetchScorers({ data: { league: id, season: seasonId } })) as ApiPlayerStatRow[];
          scorersByLeague.set(id, data ?? []);
        }),
      );

      setProgress("Calculando probabilidade de marcar…");
      const candidates = fixtures.flatMap((fx) => candidatesForFixture(fx, scorersByLeague.get(fx.league.id) ?? []));

      const built = buildScorerTickets(candidates);
      setTickets(built);
      setProgress(
        built.length === 0
          ? "Sem artilheiros com amostra suficiente nesses jogos."
          : `${fixtures.length} jogos analisados · ${candidates.length} artilheiros elegíveis`,
      );
    } catch (e) {
      setProgress(`Falha na busca: ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  }


  return (
    <div className="mx-3 my-6 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4 px-5 py-5 border-b border-white/5 bg-primary/5">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-inner">
          <Crown className="w-8 h-8 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.4)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-black uppercase tracking-wider">Artilheiros IA</div>
          <div className="text-[12px] text-muted-foreground font-semibold">Temporada {season} · Dados oficiais e predição de probabilidade de gol.</div>
        </div>
        <button
          onClick={() => q.refetch()}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          title="Atualizar"
        >
          <RotateCw className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Bilhetes de artilheiros */}
      <div className="px-3 py-3 border-b border-white/5 bg-black/20">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
          <div className="min-w-0">
            <div className="text-[12px] font-bold truncate">Bilhetes de artilheiros</div>
            <div className="text-[10px] text-muted-foreground">3 bilhetes · 4 jogadores · jogos das próximas 24h</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {tickets && tickets.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    const r = await shareFechamento(exportData(tickets));
                    if (r === "copied") setProgress("Bilhetes copiados para a área de transferência.");
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground"
                  title="Compartilhar"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => printFechamento(exportData(tickets))}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground"
                  title="Imprimir / PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={salvarFechamento}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar fechamento
                </button>
              </>
            )}

            <button
              onClick={generateTickets}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-60"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />}
              {scanning ? "Buscando…" : "Gerar 3 bilhetes"}
            </button>
          </div>

        </div>

        {progress && <p className="mt-2 text-[10px] text-muted-foreground">{progress}</p>}

        {tickets && tickets.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {tickets.map((t) => (
              <div key={t.n} className="rounded-xl border border-white/10 bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white/5">
                  <div className="text-[11px] font-black text-primary truncate">
                    A{t.n} · {t.label}
                  </div>
                  <div className="text-[10px] tabular text-muted-foreground shrink-0">
                    {(t.combined * 100).toFixed(1)}% os 4
                  </div>
                </div>
                {t.picks.map((p) => (
                  <div key={p.playerId} className="flex items-center gap-2 px-2.5 py-1.5 border-t border-white/5">
                    <img src={p.photo} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-black/30 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        {p.teamLogo && <img src={p.teamLogo} alt="" loading="lazy" className="w-3 h-3 object-contain shrink-0" />}
                        <Link to="/time/$teamId" params={{ teamId: String(p.teamId) }} className="hover:text-primary truncate">
                          {p.teamName}
                        </Link>
                        <span className="truncate">{p.isHome ? "vs" : "@"} {p.opponent}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground tabular">
                        {p.goals} gols em {p.games} jogos · {p.rate.toFixed(2)}/jogo
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/25 text-[9px] font-bold text-primary tabular">
                        🕒 {new Date(p.kickoff).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        {" · "}
                        {new Date(p.kickoff).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black tabular text-primary">{Math.round(p.prob * 100)}%</div>
                      <div className="text-[9px] text-muted-foreground">marcar</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {tickets && tickets.length > 0 && scanned > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Regras: sem repetir jogador, time ou jogo dentro do mesmo bilhete. Probabilidade por Poisson sobre gols/jogo com ajuste de mando.
          </p>
        )}
      </div>

      <ScorerLevelPanel />





      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none border-b border-white/5">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLeague(l.id)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
              league === l.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-black/25 border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span aria-hidden="true" className="mr-1">{l.icon}</span>
            {l.name}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 px-3 py-2">
        {([["goals", "⚽ Gols"], ["assists", "🅰️ Assistências"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
              mode === k
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-black/25 border-white/10 text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3">
        {q.isLoading ? (
          <ShimmerRows rows={8} height="h-10" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem dados de artilharia para esta liga na temporada {season}.
          </p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[28px_1fr_auto] gap-2 px-2.5 py-1.5 bg-white/5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <div>#</div>
              <div>Jogador</div>
              <div className="text-right">{mode === "goals" ? "G / J" : "A / J"}</div>
            </div>
            {rows.slice(0, 25).map((r, i) => {
              const st = r.statistics[0];
              const value = mode === "goals" ? st?.goals.total ?? 0 : st?.goals.assists ?? 0;
              const games = st?.games.appearences ?? 0;
              const pen = st?.penalty.scored ?? 0;
              return (
                <div
                  key={`${r.player.id}-${i}`}
                  className="grid grid-cols-[28px_1fr_auto] gap-2 items-center px-2.5 py-1.5 border-t border-white/5"
                >
                  <div className={`text-xs tabular font-bold ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={r.player.photo} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-black/30" />
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold truncate">{r.player.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        {st?.team?.logo && <img src={st.team.logo} alt="" loading="lazy" className="w-3 h-3 object-contain" />}
                        {st?.team?.id ? (
                          <Link to="/time/$teamId" params={{ teamId: String(st.team.id) }} className="hover:text-primary truncate">
                            {st.team.name}
                          </Link>
                        ) : (
                          <span className="truncate">{st?.team?.name}</span>
                        )}
                        {mode === "goals" && pen > 0 && <span>· {pen} pên.</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black tabular text-primary">{value}</div>
                    <div className="text-[10px] text-muted-foreground tabular">{games} jogos</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
