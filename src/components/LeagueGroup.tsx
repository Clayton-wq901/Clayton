import { MatchCard } from "./MatchCard";
import type { ApiFixture } from "@/lib/api-football.functions";
import { useFavorites, toggleFavorite } from "@/lib/favorites";
import { Star, ChevronDown } from "lucide-react";
import { useState } from "react";

// Priority ordering: brazilian leagues first, then major European, then rest
const PRIORITY: Record<number, number> = {
  71: 1, 72: 2, // Serie A, B (BR)
  73: 3, // Copa do Brasil
  13: 4, // Libertadores
  11: 5, // Sul-Americana
  2: 6, // UCL
  3: 7, // UEL
  39: 10, // PL
  140: 11, // LaLiga
  135: 12, // Serie A (IT)
  78: 13, // Bundesliga
  61: 14, // Ligue 1
  253: 20, // MLS
};

interface Group {
  key: string;
  league: ApiFixture["league"];
  fixtures: ApiFixture[];
}

export function groupFixtures(fixtures: ApiFixture[], favorites: number[] = []): Group[] {
  const map = new Map<string, Group>();
  for (const f of fixtures) {
    const key = `${f.league.id}-${f.league.season}`;
    if (!map.has(key)) map.set(key, { key, league: f.league, fixtures: [] });
    map.get(key)!.fixtures.push(f);
  }
  const groups = [...map.values()];
  
  groups.sort((a, b) => {
    const aFav = favorites.includes(a.league.id) ? 0 : 1;
    const bFav = favorites.includes(b.league.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;

    const pa = PRIORITY[a.league.id] ?? 999;
    const pb = PRIORITY[b.league.id] ?? 999;
    if (pa !== pb) return pa - pb;
    const ca = a.league.country.localeCompare(b.league.country);
    if (ca !== 0) return ca;
    return a.league.name.localeCompare(b.league.name);
  });
  
  for (const g of groups) {
    g.fixtures.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
  }
  return groups;
}

export function LeagueGroup({ group }: { group: Group }) {
  const favorites = useFavorites();
  const isFav = favorites.includes(group.league.id);
  const [open, setOpen] = useState(true);

  return (
    <section className="mb-8 mx-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center gap-4 py-6 group cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neutral-800 to-black flex items-center justify-center p-2 shadow-2xl border border-white/10 group-hover:border-primary/40 transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-3">
            <img src={group.league.logo} alt="" className="w-full h-full object-contain filter drop-shadow-2xl" loading="lazy" />
          </div>
          {isFav && (
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-primary rounded-full border-2 border-background flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary),0.5)] animate-in zoom-in duration-300">
              <Star className="w-3 h-3 text-black fill-current" />
            </div>
          )}
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black uppercase tracking-tight text-white group-hover:text-primary transition-all duration-300 leading-none">
              {group.league.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-muted-foreground font-black uppercase tracking-widest group-hover:bg-white/10 transition-colors">
              {group.league.flag && (
                <img src={group.league.flag} alt="" className="w-3.5 h-3.5 object-contain rounded-sm opacity-90 shadow-sm" loading="lazy" />
              )}
              <span className="truncate">{group.league.country}</span>
            </div>
            <span className="text-[10px] font-black text-primary/60 uppercase tracking-tighter bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
              {group.fixtures.length} JOGOS
            </span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(group.league.id);
          }}
          className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-500 active:scale-90 ${
            isFav 
              ? "text-primary bg-primary/20 border border-primary/40 shadow-[0_0_20px_rgba(var(--primary),0.3)]" 
              : "text-white/20 border border-white/5 hover:text-white/80 hover:bg-white/10 hover:border-white/20 hover:scale-105"
          }`}
          title={isFav ? "Remover dos favoritos" : "Favoritar liga"}
        >
          <Star className={`w-5.5 h-5.5 ${isFav ? "fill-current" : ""}`} />
        </button>

        <span
          aria-hidden="true"
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-2xl border border-white/5 text-white/40 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <ChevronDown className="w-4 h-4" />
        </span>
      </header>

      <div className={`grid grid-cols-1 gap-3 ${open ? "" : "hidden"}`}>
        {group.fixtures.map((f) => (
          <MatchCard key={f.fixture.id} fixture={f} />
        ))}
      </div>
    </section>
  );
}
