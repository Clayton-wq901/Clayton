import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { MapPin, Calendar, Trophy, Home, Plane, AlertTriangle } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import {
  getTeamInfo,
  searchTeams,
  getTeamLeagues,
  getTeamSeasonStatistics,
  getTeamRecentFixtures,
  getTeamNextFixtures,
  getStandings,
  getTeamInjuries,
  LIVE_STATUSES,
  FINISHED_STATUSES,
  type ApiFixture,
  type ApiTeamInfo,
  type ApiLeagueSeason,
  type ApiTeamSeasonStats,
  type ApiStandingsResp,
  type ApiInjury,
} from "@/lib/api-football.functions";

export const Route = createFileRoute("/time/$teamId")({
  head: () => ({
    meta: [
      { title: "Informações do time — OneOptiOn" },
      { name: "description", content: "Estatísticas, elenco e próximos jogos do time (profissional, sub-20 e sub-17)." },
    ],
  }),
  component: TimePage,
});

type Category = "pro" | "sub20" | "sub17";

const CATEGORY_LABEL: Record<Category, string> = {
  pro: "Profissional",
  sub20: "Sub-20",
  sub17: "Sub-17",
};

function detectCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/\bu-?\s?17\b|\bsub-?\s?17\b/.test(n)) return "sub17";
  if (/\bu-?\s?20\b|\bsub-?\s?20\b|\bu-?\s?19\b|\bu-?\s?21\b|\bsub-?\s?23\b/.test(n)) return "sub20";
  return "pro";
}

function stripCategory(name: string): string {
  return name
    .replace(/\b(u-?\s?\d{2}|sub-?\s?\d{2})\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function TimePage() {
  const { teamId } = Route.useParams();
  const id = Number(teamId);

  const fetchTeamInfo = useServerFn(getTeamInfo);
  const infoQ = useQuery({
    queryKey: ["team-info", id],
    queryFn: () => fetchTeamInfo({ data: { id } }),
    staleTime: 24 * 60 * 60_000,
  });

  const team = infoQ.data?.team;
  const baseName = team ? stripCategory(team.name) : "";
  const currentCategory: Category = team ? detectCategory(team.name) : "pro";

  const fetchSearch = useServerFn(searchTeams);
  const relatedQ = useQuery({
    queryKey: ["team-related", baseName],
    queryFn: () => fetchSearch({ data: { search: baseName } }),
    enabled: !!baseName,
    staleTime: 24 * 60 * 60_000,
  });

  const related = useMemo(() => {
    const list = (relatedQ.data ?? []) as ApiTeamInfo[];
    const byCat: Record<Category, ApiTeamInfo | undefined> = { pro: undefined, sub20: undefined, sub17: undefined };
    for (const t of list) {
      const cat = detectCategory(t.team.name);
      if (!byCat[cat]) byCat[cat] = t;
    }
    if (team) {
      byCat[currentCategory] = { team, venue: infoQ.data!.venue };
    }
    return byCat;
  }, [relatedQ.data, team, currentCategory, infoQ.data]);

  const [selCat, setSelCat] = useState<Category | null>(null);
  const activeCat = selCat ?? currentCategory;
  const activeTeam = related[activeCat]?.team ?? team;
  const activeId = activeTeam?.id ?? id;

  if (infoQ.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando time...</div>;
  }
  if (!team) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Time não encontrado.
        <div className="mt-3"><Link to="/" className="text-primary text-xs">← Voltar</Link></div>
      </div>
    );
  }

  return (
    <div className="-mx-3">
      {/* Header */}
      <div className="header-glow relative px-3 pt-3 pb-4">
        <BackHeader
          title={baseName || team.name}
          extra={
            <div className="text-center min-w-0 px-3 flex-1 pr-12">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{team.country}</div>
              <div className="text-sm font-bold truncate">{baseName || team.name}</div>
            </div>
          }
        />

        <div className="mt-4 flex flex-col items-center gap-2">
          <img src={activeTeam?.logo ?? team.logo} alt="" className="w-20 h-20 object-contain" />
          <div className="text-lg font-bold text-center">{activeTeam?.name ?? team.name}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {team.founded && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Fundado {team.founded}</span>}
            {infoQ.data?.venue?.name && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{infoQ.data.venue.name}</span>}
          </div>
        </div>

        {/* Category switcher */}
        <div className="mt-4 flex justify-center gap-1.5">
          {(["pro", "sub20", "sub17"] as Category[]).map((c) => {
            const available = !!related[c];
            const active = activeCat === c;
            return (
              <button
                key={c}
                disabled={!available}
                onClick={() => setSelCat(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : available
                    ? "bg-card border-white/10 text-muted-foreground hover:text-foreground"
                    : "bg-card/30 border-white/5 text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pt-3 space-y-4">
        <TeamStatsSection teamId={activeId} />
        <StandingsSection teamId={activeId} />
        <InjuriesSection teamId={activeId} />
        <RecentFixturesSection teamId={activeId} />
        <NextFixturesSection teamId={activeId} />
      </div>
    </div>
  );
}

function TeamStatsSection({ teamId }: { teamId: number }) {
  const fetchLeagues = useServerFn(getTeamLeagues);
  const leaguesQ = useQuery({
    queryKey: ["team-leagues", teamId],
    queryFn: () => fetchLeagues({ data: { team: teamId } }),
    staleTime: 24 * 60 * 60_000,
  });

  // Pick current league season
  const primary = useMemo(() => {
    const list = (leaguesQ.data ?? []) as ApiLeagueSeason[];
    if (!list.length) return null;
    let best: { leagueId: number; leagueName: string; season: number } | null = null;
    for (const l of list) {
      const cur = l.seasons.find((s) => s.current) ?? l.seasons[l.seasons.length - 1];
      if (!cur) continue;
      if (l.league.type === "League" && (!best || cur.year > best.season)) {
        best = { leagueId: l.league.id, leagueName: l.league.name, season: cur.year };
      }
    }
    if (best) return best;
    // fallback to any
    const first = list[0];
    const s = first.seasons.find((x) => x.current) ?? first.seasons[first.seasons.length - 1];
    return s ? { leagueId: first.league.id, leagueName: first.league.name, season: s.year } : null;
  }, [leaguesQ.data]);

  const fetchStats = useServerFn(getTeamSeasonStatistics);
  const statsQ = useQuery({
    queryKey: ["team-stats", teamId, primary?.leagueId, primary?.season],
    queryFn: () => fetchStats({ data: { team: teamId, league: primary!.leagueId, season: primary!.season } }),
    enabled: !!primary,
    staleTime: 60 * 60_000,
  });

  if (leaguesQ.isLoading) return <SectionCard title="Estatísticas"><Skeleton /></SectionCard>;
  if (!primary) return <SectionCard title="Estatísticas"><Empty text="Nenhuma competição encontrada." /></SectionCard>;
  if (statsQ.isLoading) return <SectionCard title={`Estatísticas · ${primary.leagueName}`}><Skeleton /></SectionCard>;
  const s = statsQ.data as ApiTeamSeasonStats | null;
  if (!s) return <SectionCard title={`Estatísticas · ${primary.leagueName}`}><Empty text="Sem dados de temporada." /></SectionCard>;

  const played = s.fixtures?.played?.total ?? 0;
  const wins = s.fixtures?.wins?.total ?? 0;
  const draws = s.fixtures?.draws?.total ?? 0;
  const loses = s.fixtures?.loses?.total ?? 0;
  const winPct = played ? Math.round((wins / played) * 100) : 0;
  const gfAvg = s.goals?.for?.average?.total ?? "0";
  const gaAvg = s.goals?.against?.average?.total ?? "0";
  const cs = s.clean_sheet?.total ?? 0;
  const fts = s.failed_to_score?.total ?? 0;
  const formStr = (s.form ?? "").slice(-10);

  return (
    <SectionCard title={`Estatísticas · ${primary.leagueName}`}>
      {formStr && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Forma (últimos {formStr.length})</div>
          <div className="flex gap-1">
            {formStr.split("").map((c, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  c === "W" ? "bg-primary/20 text-primary" : c === "D" ? "bg-yellow-500/20 text-yellow-400" : "bg-destructive/20 text-destructive"
                }`}
              >
                {c === "W" ? "V" : c === "D" ? "E" : "D"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Stat label="Jogos" value={played} />
        <Stat label="Vitórias" value={wins} accent />
        <Stat label="Empates" value={draws} />
        <Stat label="Derrotas" value={loses} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Aprov. %" value={`${winPct}%`} accent />
        <Stat label="Clean sheets" value={cs} />
        <Stat label="Gols/jogo" value={gfAvg} accent />
        <Stat label="Sofr./jogo" value={gaAvg} />
      </div>

      {/* Home vs Away split */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <SplitCard
          icon={<Home className="w-3 h-3" />}
          title="Em casa"
          played={s.fixtures?.played?.home ?? 0}
          wins={s.fixtures?.wins?.home ?? 0}
          draws={s.fixtures?.draws?.home ?? 0}
          loses={s.fixtures?.loses?.home ?? 0}
          gf={s.goals?.for?.average?.home ?? "0"}
          ga={s.goals?.against?.average?.home ?? "0"}
        />
        <SplitCard
          icon={<Plane className="w-3 h-3" />}
          title="Fora"
          played={s.fixtures?.played?.away ?? 0}
          wins={s.fixtures?.wins?.away ?? 0}
          draws={s.fixtures?.draws?.away ?? 0}
          loses={s.fixtures?.loses?.away ?? 0}
          gf={s.goals?.for?.average?.away ?? "0"}
          ga={s.goals?.against?.average?.away ?? "0"}
        />
      </div>

      <div className="text-[11px] text-muted-foreground">
        <span className="text-primary font-semibold">{fts}</span> jogos sem marcar ·
        {" "}<Trophy className="w-3 h-3 inline" /> {primary.leagueName} {primary.season}
      </div>
    </SectionCard>
  );
}

function SplitCard({
  icon, title, played, wins, draws, loses, gf, ga,
}: { icon: React.ReactNode; title: string; played: number; wins: number; draws: number; loses: number; gf: string; ga: string }) {
  const pct = played ? Math.round((wins / played) * 100) : 0;
  return (
    <div className="rounded-xl bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">
        {icon}<span>{title}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-lg font-bold tabular text-primary">{pct}%</span>
        <span className="text-[10px] text-muted-foreground">aprov.</span>
      </div>
      <div className="text-[11px] tabular text-muted-foreground mb-1">
        {played}J · <span className="text-primary">{wins}V</span> {draws}E <span className="text-destructive">{loses}D</span>
      </div>
      <div className="text-[10px] tabular text-muted-foreground">
        <span className="text-primary">{gf}</span> gols · <span className="text-destructive">{ga}</span> sofr.
      </div>
    </div>
  );
}

function StandingsSection({ teamId }: { teamId: number }) {
  const fetchLeagues = useServerFn(getTeamLeagues);
  const leaguesQ = useQuery({
    queryKey: ["team-leagues", teamId],
    queryFn: () => fetchLeagues({ data: { team: teamId } }),
    staleTime: 24 * 60 * 60_000,
  });
  const primary = useMemo(() => {
    const list = (leaguesQ.data ?? []) as ApiLeagueSeason[];
    for (const l of list) {
      const cur = l.seasons.find((s) => s.current) ?? l.seasons[l.seasons.length - 1];
      if (l.league.type === "League" && cur) return { leagueId: l.league.id, leagueName: l.league.name, season: cur.year };
    }
    return null;
  }, [leaguesQ.data]);

  const fetchStandings = useServerFn(getStandings);
  const q = useQuery({
    queryKey: ["standings", primary?.leagueId, primary?.season],
    queryFn: () => fetchStandings({ data: { league: primary!.leagueId, season: primary!.season } }),
    enabled: !!primary,
    staleTime: 60 * 60_000,
  });

  if (!primary) return null;
  const resp = q.data as ApiStandingsResp[] | undefined;
  const table = resp?.[0]?.league.standings?.[0];
  if (q.isLoading) return <SectionCard title={`Classificação · ${primary.leagueName}`}><Skeleton /></SectionCard>;
  if (!table) return null;
  const idx = table.findIndex((r) => r.team.id === teamId);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 2);
  const end = Math.min(table.length, idx + 3);
  const slice = table.slice(start, end);

  return (
    <SectionCard title={`Classificação · ${primary.leagueName}`}>
      <div className="rounded-xl bg-card overflow-hidden">
        <div className="grid grid-cols-[24px_1fr_28px_28px_36px] gap-1 px-2 py-2 text-[10px] uppercase text-muted-foreground font-semibold border-b border-border/50">
          <span>#</span><span>Time</span><span className="text-center">J</span><span className="text-center">SG</span><span className="text-center">Pts</span>
        </div>
        {slice.map((row) => {
          const hi = row.team.id === teamId;
          return (
            <div key={row.team.id} className={`grid grid-cols-[24px_1fr_28px_28px_36px] gap-1 px-2 py-2 text-xs tabular items-center ${hi ? "bg-primary/10" : ""}`}>
              <span className={hi ? "text-primary font-bold" : "text-muted-foreground"}>{row.rank}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <img src={row.team.logo} alt="" className="w-4 h-4 object-contain shrink-0" />
                <span className={`truncate ${hi ? "font-semibold" : ""}`}>{row.team.name}</span>
              </div>
              <span className="text-center">{row.all.played}</span>
              <span className="text-center text-muted-foreground">{row.goalsDiff}</span>
              <span className="text-center font-bold">{row.points}</span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function InjuriesSection({ teamId }: { teamId: number }) {
  const fetchLeagues = useServerFn(getTeamLeagues);
  const leaguesQ = useQuery({
    queryKey: ["team-leagues", teamId],
    queryFn: () => fetchLeagues({ data: { team: teamId } }),
    staleTime: 24 * 60 * 60_000,
  });
  const primary = useMemo(() => {
    const list = (leaguesQ.data ?? []) as ApiLeagueSeason[];
    for (const l of list) {
      const cur = l.seasons.find((s) => s.current) ?? l.seasons[l.seasons.length - 1];
      if (l.league.type === "League" && cur) return { leagueId: l.league.id, season: cur.year };
    }
    return null;
  }, [leaguesQ.data]);
  const fetchInj = useServerFn(getTeamInjuries);
  const q = useQuery({
    queryKey: ["team-injuries", teamId, primary?.leagueId, primary?.season],
    queryFn: () => fetchInj({ data: { team: teamId, league: primary!.leagueId, season: primary!.season } }),
    enabled: !!primary,
    staleTime: 60 * 60_000,
  });
  const list = (q.data as ApiInjury[] | undefined) ?? [];
  // Only show recent/ongoing (most recent fixture per player)
  const byPlayer = new Map<number, ApiInjury>();
  for (const i of list) {
    const prev = byPlayer.get(i.player.id);
    if (!prev || i.fixture.timestamp > prev.fixture.timestamp) byPlayer.set(i.player.id, i);
  }
  const recent = Array.from(byPlayer.values())
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 8);
  if (!primary || q.isLoading) return null;
  if (recent.length === 0) return null;
  return (
    <SectionCard title="Lesões / Baixas recentes">
      <ul className="space-y-1.5">
        {recent.map((i) => (
          <li key={`${i.player.id}-${i.fixture.id}`} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
            <AlertTriangle className={`w-4 h-4 shrink-0 ${i.player.type === "Missing Fixture" ? "text-destructive" : "text-yellow-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{i.player.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{i.player.reason}</div>
            </div>
            <span className="text-[10px] text-muted-foreground tabular shrink-0">
              {new Date(i.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RecentFixturesSection({ teamId }: { teamId: number }) {
  const fetchRecent = useServerFn(getTeamRecentFixtures);
  const q = useQuery({
    queryKey: ["team-recent", teamId],
    queryFn: () => fetchRecent({ data: { team: teamId, last: 8 } }),
    staleTime: 5 * 60_000,
  });
  return (
    <SectionCard title="Últimos jogos">
      {q.isLoading && <Skeleton />}
      {q.data && q.data.length === 0 && <Empty text="Sem jogos recentes." />}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-2">
          {(q.data as ApiFixture[]).map((f) => <FixtureRow key={f.fixture.id} f={f} teamId={teamId} />)}
        </ul>
      )}
    </SectionCard>
  );
}

function NextFixturesSection({ teamId }: { teamId: number }) {
  const fetchNext = useServerFn(getTeamNextFixtures);
  const q = useQuery({
    queryKey: ["team-next", teamId],
    queryFn: () => fetchNext({ data: { team: teamId, next: 8 } }),
    staleTime: 5 * 60_000,
  });
  return (
    <SectionCard title="Próximos jogos">
      {q.isLoading && <Skeleton />}
      {q.data && q.data.length === 0 && <Empty text="Nenhum jogo agendado." />}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-2">
          {(q.data as ApiFixture[]).map((f) => <FixtureRow key={f.fixture.id} f={f} teamId={teamId} upcoming />)}
        </ul>
      )}
    </SectionCard>
  );
}

function FixtureRow({ f, teamId, upcoming }: { f: ApiFixture; teamId: number; upcoming?: boolean }) {
  const isHome = f.teams.home.id === teamId;
  const opponent = isHome ? f.teams.away : f.teams.home;
  const scored = f.goals.home != null && f.goals.away != null;
  const teamGoals = isHome ? f.goals.home : f.goals.away;
  const oppGoals = isHome ? f.goals.away : f.goals.home;
  const won = scored && (teamGoals ?? 0) > (oppGoals ?? 0);
  const drew = scored && teamGoals === oppGoals;
  const finished = FINISHED_STATUSES.has(f.fixture.status.short);
  const live = LIVE_STATUSES.has(f.fixture.status.short);
  const d = new Date(f.fixture.date);
  const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <Link
      to="/jogo/$fixtureId"
      params={{ fixtureId: String(f.fixture.id) }}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl bg-card px-3 py-2"
    >
      <div className="flex flex-col items-center w-12">
        <span className="text-[10px] text-muted-foreground tabular">{dateStr}</span>
        <span className={`text-[10px] tabular ${live ? "text-primary font-bold" : "text-muted-foreground"}`}>
          {live ? `${f.fixture.status.elapsed ?? ""}'` : timeStr}
        </span>
      </div>
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-6 shrink-0">{isHome ? "vs" : "@"}</span>
        <img src={opponent.logo} alt="" className="w-5 h-5 object-contain shrink-0" />
        <span className="text-sm truncate">{opponent.name}</span>
      </div>
      {upcoming ? (
        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{f.league.name}</span>
      ) : finished ? (
        <div className="flex items-center gap-2">
          <span className="tabular text-sm font-bold">
            {teamGoals}<span className="text-muted-foreground">–</span>{oppGoals}
          </span>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
            won ? "bg-primary/20 text-primary" : drew ? "bg-yellow-500/20 text-yellow-400" : "bg-destructive/20 text-destructive"
          }`}>
            {won ? "V" : drew ? "E" : "D"}
          </span>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground">agendado</span>
      )}
    </Link>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 px-1">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-card px-2 py-2 text-center">
      <div className={`text-lg font-bold tabular ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-card animate-pulse" />)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}
