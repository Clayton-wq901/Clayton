import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { Bell, BellOff, Star, Trophy, Search, Filter, AlertCircle, RefreshCw, ChevronRight, Clock, Info, CheckCircle2, TrendingUp, Sparkles, Folder } from "lucide-react";

import { z } from "zod";
import { getFixturesByDate, getLiveFixtures, getNextFixturesToScan, LIVE_STATUSES, FINISHED_STATUSES, type ApiFixture } from "@/lib/api-football.functions";
import { DateStrip } from "@/components/DateStrip";
import { LeagueGroup, groupFixtures } from "@/components/LeagueGroup";
import { MatchCard } from "@/components/MatchCard";
import { HighlightsSlider } from "@/components/HighlightsSlider";
import { BingaoClosurePanel } from "@/components/BingaoClosurePanel";
import { BetaPanel } from "@/components/BetaPanel";
import { RadarPanel } from "@/components/RadarPanel";
import { ArtilheirosPanel } from "@/components/ArtilheirosPanel";
import { EspeciaisBetanoPanel } from "@/components/EspeciaisBetanoPanel";
import { LotecaPanel } from "@/components/LotecaPanel";
import { AutoTicketsPanel } from "@/components/AutoTicketsPanel";
import { DiagnosticoPanel } from "@/components/DiagnosticoPanel";
import { saveScanPredictions, loadScanPredictions } from "@/lib/scan-cache.functions";
import { LoadingList, EmptyState } from "@/components/StateViews";
import { useActiveSection } from "@/lib/active-section";
import { useSearchQuery } from "@/lib/search-query";
import { usePinnedSections, type SectionId } from "@/lib/pinned-sections";
import { useFavorites } from "@/lib/favorites";
import { BackHeader } from "@/components/BackHeader";
import { useMarketFilter, MarketFilterId } from "@/lib/market-filter";
import { getBulkPredictions, ScanPrediction } from "@/lib/bulk-predictions.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Scan } from "lucide-react";
import { toast } from "sonner";

const GROUP_CHUNK = 6; // ligas renderizadas por vez (scroll infinito)

const FOLDER_META: Record<SectionId, { icon: string; label: string }> = {
  bingao: { icon: "🎯", label: "Estratégia Bingão (Under 1.5)" },
  loteca: { icon: "🎟️", label: "Lotéca IA Especial" },
  radar: { icon: "⚡", label: "Radar OneOption IA" },
  beta: { icon: "🧪", label: "Laboratório Beta (Poisson)" },
  alfha: { icon: "⚡", label: "Alfha (Velocidade)" },
  "especiais-betano": { icon: "⭐", label: "Especiais Betano OneOption" },
  auditoria: { icon: "🤖", label: "Bilhetes Automáticos (11 Mercados)" },
  diagnostico: { icon: "🧠", label: "Assistente IA de Diagnóstico & Melhorias" },
};


function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const SITE_URL = (import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "https://one-option.app";
const PAGE_TITLE = "Jogos de futebol ao vivo hoje — placar, HT e escanteios em tempo real";
const PAGE_DESC = "Acompanhe todos os jogos do dia com placar minuto a minuto, filtros por horário e análise inteligente pra decidir suas apostas com mais confiança.";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ date: z.string().optional() }),
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL + "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESC },
    ],
    links: [{ rel: "canonical", href: SITE_URL + "/" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "OneOptiOn-BetA",
        url: SITE_URL,
        description: PAGE_DESC,
      }),
    }],
  }),
  component: TodosPage,
});

type FilterId = "live" | "upcoming" | "finished";
const FILTERS: readonly { id: FilterId; label: string }[] = [
  { id: "live", label: "Ao Vivo (IA)" },
  { id: "upcoming", label: "Próximos" },
  { id: "finished", label: "Encerrados" },
] as const;

type GroupModeId = "time" | "league";
const GROUP_MODES: readonly { id: GroupModeId; label: string }[] = [
  { id: "time", label: "Por Horário" },
  { id: "league", label: "Por Liga" },
] as const;

const HOUR_MS = 60 * 60 * 1000;

const MARKET_LABELS: Record<MarketFilterId, string> = {
  none: "Sem filtro de mercado",
  smart_ia: "IA: Melhor Oportunidade ✨",
  u15: "Under 1.5 Gols",
  o15: "Over 1.5 Gols",
  u25: "Under 2.5 Gols",
  o25: "Over 2.5 Gols",
  btts_yes: "Ambas Marcam (Sim)",
  btts_no: "Ambas Marcam (Não)",
  corners_u95: "Escanteios Under 9.5",
  corners_o95: "Escanteios Over 9.5",
};

function applyFilter(fixtures: ApiFixture[], filter: FilterId, nowMs: number): ApiFixture[] {
  if (!fixtures || fixtures.length === 0) return [];

  const byTimeAsc = (a: ApiFixture, b: ApiFixture) => a.fixture.timestamp - b.fixture.timestamp;
  const byTimeDesc = (a: ApiFixture, b: ApiFixture) => b.fixture.timestamp - a.fixture.timestamp;

  const isLive = (f: ApiFixture) => LIVE_STATUSES.has(f.fixture.status.short);
  const isFinished = (f: ApiFixture) => FINISHED_STATUSES.has(f.fixture.status.short);
  const isUpcoming = (f: ApiFixture) => {
    const status = f.fixture.status.short;
    return (status === "NS" || status === "TBD") && f.fixture.timestamp * 1000 > nowMs;
  };

  switch (filter) {
    case "live":
      return fixtures.filter(isLive).sort(byTimeAsc);

    case "finished":
      // Somente jogos já encerrados, do mais recente para o mais antigo
      return fixtures.filter(isFinished).sort(byTimeDesc);

    case "upcoming":
      // Remove da fila assim que chega o horário de início, abrindo espaço
      // para as próximas partidas mesmo se a atualização da API atrasar.
      return fixtures.filter(isUpcoming).sort(byTimeAsc);

    default:
      return [...fixtures].sort(byTimeAsc);
  }
}


function ScanFilterPanel({ onScan, isScanning, progress, onClear }: { onScan: () => void; isScanning: boolean; progress: number; onClear: () => void }) {
  const { market, setMarket } = useMarketFilter();

  return (
    <div className="mx-3 mb-8 p-6 rounded-[2.5rem] glass border border-white/5 shadow-2xl overflow-hidden relative group animate-in fade-in slide-in-from-top-4 duration-700">
      {isScanning && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10">
          <div 
            className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_12px_rgba(var(--primary),0.6)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Robô de Varredura OneOption</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="text-[9px] font-bold text-muted-foreground hover:text-destructive transition-colors uppercase tracking-tighter"
          >
            Limpar Selos
          </button>
          {isScanning && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-primary animate-pulse tabular tracking-widest uppercase">
                Analisando {Math.round(progress)}%
              </span>
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-3">
          <button
            onClick={onScan}
            disabled={isScanning}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 shadow-xl shadow-primary/20 hover:brightness-110 uppercase tracking-widest"
          >
            {isScanning ? (
              <TrendingUp className="w-5 h-5 animate-spin" />
            ) : (
              <Scan className="w-5 h-5" />
            )}
            {isScanning ? "Varrendo Dados da API..." : "Varrer Jogos da API (Auto IA)"}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Select value={market} onValueChange={(v) => setMarket(v as MarketFilterId)}>
                <SelectTrigger className="w-full bg-black/40 border-white/5 h-11 rounded-xl text-xs font-bold transition-all hover:bg-black/60 focus:ring-primary/40">
                  <SelectValue placeholder="Ver mercado específico" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl glass border-white/10">
                  {Object.entries(MARKET_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id} className="text-xs font-bold focus:bg-primary focus:text-primary-foreground rounded-lg mx-1 my-0.5">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {market !== "none" && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary leading-tight">
                Ordenando por {MARKET_LABELS[market]} — nenhum jogo é escondido
              </span>
              <button
                onClick={() => setMarket("none")}
                className="shrink-0 text-[9px] font-black uppercase tracking-tighter text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
        
        
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 bg-black/40 p-3 rounded-2xl border border-white/5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-primary/60" />
          <span className="font-semibold leading-relaxed">
            Varra os jogos disponíveis na API de dados/odds. As informações exibidas são baseadas nos dados reais processados pelo sistema OneOption IA.
          </span>
        </div>
      </div>
    </div>
  );
}

function TodosPage() {
  const { date } = Route.useSearch();
  const selected = date ?? todayISO();
  const [filter, setFilter] = useState<FilterId>("upcoming");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [groupMode, setGroupMode] = useState<GroupModeId>("time");
  const activeSection = useActiveSection();
  const pinned = usePinnedSections();
  const search = useSearchQuery();
  const { market, predictions, setPredictions, addPersistedPredictions, clearPersistedPredictions } = useMarketFilter();
  const favorites = useFavorites();
  
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scannedFixtures, setScannedFixtures] = useState<ApiFixture[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const folder = (["bingao", "loteca", "radar", "beta", "alfha", "especiais-betano", "auditoria", "diagnostico"] as SectionId[]).includes(activeSection as SectionId)
    ? (activeSection as SectionId)
    : null;

  const fetchFixtures = useServerFn(getFixturesByDate);
  const fetchLiveFixtures = useServerFn(getLiveFixtures);
  const fetchBulk = useServerFn(getBulkPredictions);
  const fetchApiFixtures = useServerFn(getNextFixturesToScan);
  const persistScan = useServerFn(saveScanPredictions);
  const hydrateScan = useServerFn(loadScanPredictions);

  // Leitura instantânea do banco ao abrir o site — sem nova varredura, sem gastar API.
  const hydratedQ = useQuery({
    queryKey: ["scan-snapshot", "hydrate"],
    queryFn: () => hydrateScan(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (hydratedQ.data?.length) addPersistedPredictions(hydratedQ.data);
  }, [hydratedQ.data]);

  const q = useQuery({
    queryKey: ["fixtures", "date", selected],
    queryFn: () => fetchFixtures({ data: { date: selected } }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const list = (query.state.data ?? []) as ApiFixture[];
      return list.some((f) => LIVE_STATUSES.has(f.fixture.status.short)) ? 180_000 : false; // 3 min para poupar cota
    },
    enabled: filter !== "live",
  });

  const liveQ = useQuery({
    queryKey: ["fixtures", "live"],
    queryFn: () => fetchLiveFixtures(),
    staleTime: 60_000,
    refetchInterval: 90_000, // 90s para poupar cota
    enabled: filter === "live",
  });

  const handleScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    try {
      let apiFixtures: ApiFixture[] = [];
      
      if (filter === "live") {
        apiFixtures = liveQ.data || [];
      } else {
        apiFixtures = await fetchApiFixtures({ data: { count: 30 } }); // Reduced from 80 to save API quota
      }

      if (!apiFixtures || apiFixtures.length === 0) {
        toast.error("Nenhum jogo encontrado para varrer.");
        return;
      }

      setScanProgress(5);
      const { saveMatchPrediction } = await import("@/lib/match-predictions");
      
      const allResults: ScanPrediction[] = [];
      const CHUNK_SIZE = 2; // Process very few at a time to spread API load and stay under burst limits
      
      for (let i = 0; i < apiFixtures.length; i += CHUNK_SIZE) {
        const chunk = apiFixtures.slice(i, i + CHUNK_SIZE);
        const toScan = chunk.map(f => ({ 
          id: f.fixture.id, 
          homeId: f.teams.home.id, 
          awayId: f.teams.away.id 
        }));

        const chunkResults = await fetchBulk({ data: { fixtures: toScan } });
        allResults.push(...chunkResults);

        // Salva e atualiza a UI jogo a jogo dentro do chunk
        await Promise.all(chunkResults.map(async (p) => {
          if (p.bestProb && p.bestProb > 0.55 && p.bestMarket) {
            try {
              await saveMatchPrediction({
                fixtureId: p.fixtureId,
                market: p.bestMarket,
                probability: Math.round(p.bestProb * 100),
                score: 0,
                features: { bestProb: p.bestProb, topMarkets: p.topMarkets }
              });
            } catch (err) {
              console.warn("Falha ao salvar predição persistente:", err);
            }
          }
        }));

        // Persistência blindada: grava o snapshot completo no banco a cada lote
        try {
          await persistScan({ data: { predictions: chunkResults } });
        } catch (err) {
          console.warn("Falha ao salvar snapshot da varredura:", err);
        }

        // Atualiza o progresso granular e injeta os selos na tela em tempo real
        const currentProgress = Math.min(100, Math.round(((i + chunk.length) / apiFixtures.length) * 95) + 5);
        setScanProgress(currentProgress);
        addPersistedPredictions(chunkResults); // Adiciona ao estado global para os selos aparecerem na hora
      }

      setScanProgress(100);
      setScannedFixtures(apiFixtures);
      setPredictions(allResults);
      toast.success(`Varredura completa! ${allResults.length} jogos analisados.`);
    } catch (e) {
      console.error(e);
      toast.error("Erro na varredura da API.");
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
      }, 500);
    }
  };


  const filtered = useMemo(() => {
    let sourceData = filter === "live" ? liveQ.data : q.data;
    let list = sourceData ? [...sourceData] : [];
    
    // Adiciona jogos escaneados da API que não estão na lista original
    // (apenas nas abas de jogos futuros — não polui "Por Data" nem "Encerrados")
    if (scannedFixtures.length > 0 && filter === "upcoming") {
      const existingIds = new Set(list.map(f => f.fixture.id));
      const news = scannedFixtures.filter(f => !existingIds.has(f.fixture.id));
      if (news.length > 0) list = [...list, ...news];
    }


    if (folder) {
      const ids = new Set(pinned[folder] || []);
      list = list.filter((f) => ids.has(f.fixture.id));
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter((f) =>
        f.teams.home.name.toLowerCase().includes(s) ||
        f.teams.away.name.toLowerCase().includes(s) ||
        f.league.name.toLowerCase().includes(s) ||
        (f.league.country ?? "").toLowerCase().includes(s)
      );
    }
    
    // Aplica o filtro de status/horário
    list = applyFilter(list, filter, nowMs);

    // Se houver filtro de mercado, aplicamos a lógica de ordenação por probabilidade
    if (market !== "none" && predictions.length > 0) {
      const predMap = new Map(predictions.map(p => [p.fixtureId, p]));
      
      // O mercado apenas ORDENA a lista: jogos com predição sobem ao topo,
      // os demais continuam visíveis logo abaixo (em todas as abas).
      return [...list]
        .sort((a, b) => {
          const pA = predMap.get(a.fixture.id);
          const pB = predMap.get(b.fixture.id);
          
          // Se um dos jogos não tem predição, ele vai para o final
          if (!pA && !pB) return 0;
          if (!pA) return 1;
          if (!pB) return -1;
          
          let valA = 0;
          let valB = 0;
          
          switch(market) {
            case "smart_ia": valA = pA.bestProb || 0; valB = pB.bestProb || 0; break;
            case "u15": valA = pA.pUnder15; valB = pB.pUnder15; break;
            case "o15": valA = pA.pOver15; valB = pB.pOver15; break;
            case "u25": valA = pA.pUnder25; valB = pB.pUnder25; break;
            case "o25": valA = pA.pOver25; valB = pB.pOver25; break;
            case "btts_yes": valA = pA.pBTTS; valB = pB.pBTTS; break;
            case "btts_no": valA = pA.pNoBTTS; valB = pB.pNoBTTS; break;
            case "corners_u95": valA = 1 - pA.pCornersOver95; valB = 1 - pB.pCornersOver95; break;
            case "corners_o95": valA = pA.pCornersOver95; valB = pB.pCornersOver95; break;
          }
          
          return valB - valA;
        });
    }

    return list;
  }, [q.data, liveQ.data, filter, folder, pinned, search, predictions, market, scannedFixtures, nowMs]);


  const groups = useMemo(() => {
    if (market !== "none" && predictions.length > 0) {
      const ids = new Set(predictions.map((p) => p.fixtureId));
      const withPred = filtered.filter((f) => ids.has(f.fixture.id));
      const rest = filtered.filter((f) => !ids.has(f.fixture.id));

      const blocks = [] as ReturnType<typeof groupFixtures>;
      if (withPred.length > 0) {
        blocks.push({
          key: "market-scan-results",
          league: {
            name: MARKET_LABELS[market],
            country: "Oportunidades IA",
            logo: `${SITE_URL}/icon-512.png`,
            flag: null,
            id: 0,
            season: 0,
            round: ""
          },
          fixtures: withPred
        } as ReturnType<typeof groupFixtures>[number]);
      }
      return [...blocks, ...groupFixtures(rest, favorites)];
    }
    return groupFixtures(filtered, favorites);
  }, [filtered, market, predictions, favorites]);
  const [renderCount, setRenderCount] = useState(GROUP_CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // reinicia a janela de renderização quando a lista muda
  useEffect(() => { setRenderCount(GROUP_CHUNK); }, [selected, filter, folder, search, groupMode]);

  // carrega mais conforme o usuário rola (renderiza poucos cards de cada vez)
  const total = groupMode === "league" ? groups.length : Math.ceil(filtered.length / 8);
  useEffect(() => {
    if (renderCount >= total) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setRenderCount(total); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setRenderCount((n) => n + GROUP_CHUNK);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [renderCount, total]);

  return (
    <>
      <h1 className="sr-only">Jogos de futebol ao vivo hoje com placar, HT e escanteios em tempo real</h1>
      {folder ? (
        <BackHeader title={FOLDER_META[folder].label} />
      ) : (
        <DateStrip selected={selected} />
      )}
      {folder && (
        <div className="mx-3 mb-8 flex items-center gap-4 rounded-[2rem] glass p-5 shadow-2xl border border-blue-600/20 relative overflow-hidden group animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="w-16 h-16 rounded-[1.25rem] bg-blue-600/20 flex items-center justify-center border border-blue-600/30 shadow-inner relative z-10">
            <span className="text-3xl filter drop-shadow-lg" aria-hidden="true">{FOLDER_META[folder].icon}</span>
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <div className="text-base font-black text-blue-400 uppercase tracking-wider">{FOLDER_META[folder].label}</div>
            <div className="text-[12px] text-muted-foreground font-semibold leading-relaxed mt-1">
              Monitorando {pinned[folder].length} jogo(s). A IA processa dados em tempo real para identificar padrões lucrativos e seguros.
            </div>
          </div>
        </div>
      )}
      {folder === "bingao" && <BingaoClosurePanel />}
      {folder === "loteca" && <LotecaPanel />}
      {folder === "radar" && <div className="px-3 pb-8"><RadarPanel isTab /></div>}
      {folder === "beta" && <BetaPanel />}
      {folder === "especiais-betano" && <EspeciaisBetanoPanel />}
      {folder === "auditoria" && <AutoTicketsPanel />}
      {folder === "diagnostico" && <div className="px-3 pb-10"><DiagnosticoPanel /></div>}
      {activeSection === "artilheiros" && <ArtilheirosPanel />}
      {!folder && activeSection !== "artilheiros" && (
        <>
          <div role="tablist" aria-label="Filtrar jogos" className="flex gap-1.5 overflow-x-auto scrollbar-none px-3 pb-3">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const disabled = filter === "live" ? liveQ.isLoading : q.isLoading;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${
                    active
                      ? "bg-blue-600 text-white border-blue-600 shadow-[0_0_15px_rgba(234,88,12,0.3)]"
                      : "bg-white/5 border-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 hover:border-white/10"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div role="tablist" aria-label="Modo de exibição" className="flex gap-1.5 px-3 pb-3">
            {GROUP_MODES.map((m) => {
              const active = groupMode === m.id;
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGroupMode(m.id)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 active:scale-95 ${
                    active
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-white/5 border-white/5 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </>
      )}
      {(filter === "live" ? liveQ.isLoading : q.isLoading) && activeSection !== "artilheiros" && <LoadingList />}
      {(filter === "live" ? liveQ.error : q.error) && activeSection !== "artilheiros" && (
        <p className="p-4 text-sm text-destructive font-black uppercase tracking-tighter">
          Erro de Conexão: {((filter === "live" ? liveQ.error : q.error) as Error).message}
        </p>
      )}
      {((filter === "live" ? liveQ.data : q.data)) && filtered.length === 0 && activeSection !== "artilheiros" && (
        <EmptyState 
          text={
            filter === "live" ? "Nenhum jogo ao vivo no momento." :
            filter === "finished" ? "Nenhum jogo encerrado nesta data." :
            search ? `Nenhum jogo encontrado para "${search}".` :
            "Sem jogos disponíveis para este filtro."
          } 
        />
      )}
      {filtered.length > 0 && activeSection !== "artilheiros" && (
        <>
          {!folder && <HighlightsSlider fixtures={filtered} />}
          {!folder && (
            <ScanFilterPanel 
              onScan={handleScan} 
              isScanning={isScanning} 
              progress={scanProgress} 
              onClear={() => { clearPersistedPredictions(); toast.info("Selos limpos."); }} 
            />
          )}
          <div className="pt-2">
            {groupMode === "league" ? (
              <>
                {groups.slice(0, renderCount).map((g) => (
                  <LeagueGroup key={g.key} group={g} />
                ))}
                {renderCount < groups.length && (
                  <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
                    Carregando mais ligas…
                  </div>
                )}
              </>
            ) : (
              <div className="mx-3 grid grid-cols-1 gap-3">
                {filtered.slice(0, renderCount * 8).map((f) => (
                  <MatchCard key={f.fixture.id} fixture={f} />
                ))}
                {renderCount * 8 < filtered.length && (
                  <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
                    Carregando mais jogos…
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
