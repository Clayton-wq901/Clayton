import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LIVE_STATUSES, FINISHED_STATUSES, type ApiFixture } from "@/lib/api-football.functions";
import { setSelectedFixture, isDesktopThreeCol } from "@/lib/selected-fixture";


// Popular league IDs (API-Football) — used to prioritize highlights
const POPULAR_LEAGUES = new Set<number>([
  71, 72, 73, // Brasileirão A, B, Copa do Brasil
  253, // MLS
  2, 3, // UCL, UEL
  39, 140, 135, 78, 61, // PL, La Liga, Serie A, Bundesliga, Ligue 1
  128, // Liga Argentina
  13, // Libertadores
  11, // Sul-Americana
]);

function statusInfo(f: ApiFixture) {
  const s = f.fixture.status.short;
  if (LIVE_STATUSES.has(s)) {
    if (s === "HT") return { label: "AO VIVO HT", live: true };
    const el = f.fixture.status.elapsed ?? 0;
    return { label: `AO VIVO ${el}'`, live: true };
  }
  if (FINISHED_STATUSES.has(s)) return { label: "ENCERRADO", live: false, finished: true };
  const d = new Date(f.fixture.date);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { label: isToday ? `HOJE ${hh}:${mm}` : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hh}:${mm}`, live: false };
}

function pickHighlights(fixtures: ApiFixture[]): ApiFixture[] {
  const live: ApiFixture[] = [];
  const upcoming: ApiFixture[] = [];
  const finished: ApiFixture[] = [];

  for (const f of fixtures) {
    const s = f.fixture.status.short;
    if (LIVE_STATUSES.has(s)) live.push(f);
    else if (FINISHED_STATUSES.has(s)) finished.push(f);
    else upcoming.push(f);
  }

  const score = (f: ApiFixture) => (POPULAR_LEAGUES.has(f.league.id) ? 0 : 1);
  
  live.sort((a, b) => score(a) - score(b));
  upcoming.sort((a, b) => score(a) - score(b) || a.fixture.timestamp - b.fixture.timestamp);
  finished.sort((a, b) => score(a) - score(b));

  return [...live, ...upcoming, ...finished].slice(0, 10);
}

export function HighlightsSlider({ fixtures }: { fixtures: ApiFixture[] }) {
  const items = pickHighlights(fixtures);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const el = scrollerRef.current;
    if (!el) return;
    const id = setInterval(() => {
      if (pausedRef.current || !el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const next = el.scrollLeft + 232; // card width + gap
      if (next >= maxScroll - 4) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollTo({ left: next, behavior: "smooth" });
    }, 4000);
    return () => clearInterval(id);
  }, [items.length]);

  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 232, behavior: "smooth" });
  };

  if (items.length === 0) return null;


  return (
    <section className="pt-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Principais jogos do dia</h2>
        <span className="text-[10px] text-muted-foreground/70">{items.length} destaques</span>
      </div>

      <div
        className="relative -mx-3 px-3 group/slider"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => nudge(-1)}
          className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-black/60 backdrop-blur border border-white/10 opacity-0 group-hover/slider:opacity-100 hover:bg-black/80 transition"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          aria-label="Próximo"
          onClick={() => nudge(1)}
          className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-black/60 backdrop-blur border border-white/10 opacity-0 group-hover/slider:opacity-100 hover:bg-black/80 transition"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
        <div ref={scrollerRef} className="overflow-x-auto scrollbar-none scroll-smooth">
        <div className="flex gap-2.5 pb-1">

          {items.map((f) => {
            const st = statusInfo(f);
            const scored = f.goals.home != null && f.goals.away != null;
            return (
              <Link
                key={f.fixture.id}
                to="/jogo/$fixtureId"
                params={{ fixtureId: String(f.fixture.id) }}
                onClick={(e) => {
                  if (isDesktopThreeCol()) {
                    e.preventDefault();
                    setSelectedFixture(f.fixture.id);
                  }
                }}
                className={`relative shrink-0 w-[220px] h-[150px] rounded-xl overflow-hidden border border-white/5 hover:border-primary/40 transition group ${
                  st.live ? "shadow-[var(--shadow-live)]" : "shadow-[var(--shadow-card)]"
                }`}
              >
                {/* Background: lighter surface with faded team logos */}
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-900" />
                <img
                  src={f.teams.home.logo}
                  alt=""
                  className="absolute -left-4 top-1/2 -translate-y-1/2 w-28 h-28 object-contain opacity-60 group-hover:opacity-75 transition"
                  loading="lazy"
                />
                <img
                  src={f.teams.away.logo}
                  alt=""
                  className="absolute -right-4 top-1/2 -translate-y-1/2 w-28 h-28 object-contain opacity-60 group-hover:opacity-75 transition"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

                {/* Content */}
                <div className="relative h-full flex flex-col justify-between p-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                      st.live ? "bg-destructive text-white" : "bg-white/10 text-white/90 backdrop-blur"
                    }`}>
                      {st.live && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                      <span className="truncate max-w-[130px]">{st.label}</span>
                    </span>
                    {f.league.logo && (
                      <img src={f.league.logo} alt="" className="w-5 h-5 object-contain opacity-80" loading="lazy" />
                    )}
                  </div>

                  {scored && (
                    <div className="text-center text-2xl font-black tabular text-white drop-shadow-lg leading-none">
                      {f.goals.home} <span className="text-white/40 mx-1">-</span> {f.goals.away}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <img src={f.teams.home.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />
                      <span className="text-[11px] font-bold text-white truncate">{f.teams.home.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <img src={f.teams.away.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />
                      <span className="text-[11px] font-bold text-white truncate">{f.teams.away.name}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        </div>
      </div>


    </section>
  );
}
