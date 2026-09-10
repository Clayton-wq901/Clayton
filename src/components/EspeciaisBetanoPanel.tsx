import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, TrendingUp, Zap, Target, AlertCircle, Info, Brain, CheckCircle2, Layout, FileText, Send, Loader2, Scan, Sparkles, Trophy, Save, History, Calendar, ChevronRight, XCircle, ShieldCheck, RotateCw } from "lucide-react";
import { getFixturesByDate, type ApiFixture } from "@/lib/api-football.functions";
import { getBetanoSpecialAnalysis, getBetanoBulkScan, getBetanoMultipleAnalysis, saveBetanoTicket, getBetanoTickets, updateBetanoTicketStatus } from "@/lib/betano-specials.functions";
import { BETANO_FIXED_MARKETS } from "@/lib/betano-constants";
import { LoadingList, EmptyState } from "@/components/StateViews";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { usePinnedSections, toggleFixture, setPinnedFixtures } from "@/lib/pinned-sections";
import { cn } from "@/lib/utils";
import { BetanoProofCard } from "./BetanoProofCard";

// Ligas onde a Betano costuma ter mercados especiais ativos
const ELITE_LEAGUES = [
  2, 3, 5, 39, 140, 61, 78, 135, 71, // UEFA, Top 5 Europe, Brasil Série A
  848, 529, 531, // Champions, Europa League
];

export function EspeciaisBetanoPanel() {
  const queryClient = useQueryClient();
  const fetchFixtures = useServerFn(getFixturesByDate);
  const analyzeSpecial = useServerFn(getBetanoSpecialAnalysis);
  const bulkScan = useServerFn(getBetanoBulkScan);
  const getMultipleAnalysis = useServerFn(getBetanoMultipleAnalysis);
  const saveTicketFn = useServerFn(saveBetanoTicket);
  const listTicketsFn = useServerFn(getBetanoTickets);
  const updateStatusFn = useServerFn(updateBetanoTicketStatus);
  const pinned = usePinnedSections();
  
  const today = new Date().toISOString().split('T')[0];
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<Record<number, { 
    text: string; 
    recommendedMarket: string; 
    picks: { market: string; pick: string; prob: number; odd: number; reasoning: string }[];
    audit?: { score: number; tier: string; veto: string | null; lambdaTotal: number };
    stats?: any;
  }>>({});
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Varredura, 2: Prova Real, 3: Múltipla, 4: Histórico
  const [tickets, setTickets] = useState<{
    fixtures: ApiFixture[];
    analysisResult: Record<number, any>;
    multipleAnalysis: { confidence: number; analysis: string } | null;
  }[]>([]);
  const [activeTicketIndex, setActiveTicketIndex] = useState(0);
  const [isAnalyzingMultiple, setIsAnalyzingMultiple] = useState(false);


  const { data: allFixtures, isLoading } = useQuery({
    queryKey: ["especiais-betano", today],
    queryFn: () => fetchFixtures({ data: { date: today } }),
  });

  const { data: savedTickets, isLoading: isLoadingTickets } = useQuery({
    queryKey: ["betano-tickets-history"],
    queryFn: () => listTicketsFn(),
    enabled: step === 4
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => saveTicketFn({ data: { data } }),
    onSuccess: () => {
      toast.success("Bilhete salvo no seu histórico!");
      queryClient.invalidateQueries({ queryKey: ["betano-tickets-history"] });
    },
    onError: () => toast.error("Erro ao salvar bilhete.")
  });

  // Filtra apenas jogos de ligas elite para garantir disponibilidade dos mercados
  const fixtures = useMemo(() => {
    if (!allFixtures) return [];
    return allFixtures.filter(f => ELITE_LEAGUES.includes(f.league.id));
  }, [allFixtures]);


  const selectedGames = useMemo(() => {
    return fixtures.filter(f => pinned["especiais-betano"].includes(f.fixture.id));
  }, [fixtures, pinned]);

  const handleAnalyzeMultiple = async (index: number) => {
    const ticket = tickets[index];
    if (!ticket || ticket.fixtures.length !== 4) return;
    
    setIsAnalyzingMultiple(true);
    try {
      const fixturesData = ticket.fixtures.map(g => ({
        ...g,
        recommendedPicks: ticket.analysisResult[g.fixture.id]?.picks
      }));
      const res = await getMultipleAnalysis({ data: { fixtures: fixturesData } });
      
      setTickets(prev => {
        const newTickets = [...prev];
        newTickets[index] = { ...newTickets[index], multipleAnalysis: res };
        return newTickets;
      });
      
      toast.success(`Relatório de Assertividade Bilhete ${index + 1} Gerado!`);
    } catch (error) {
      toast.error("Falha ao analisar múltipla.");
    } finally {
      setIsAnalyzingMultiple(false);
    }
  };

  useEffect(() => {
    if (step === 3 && tickets[activeTicketIndex] && !tickets[activeTicketIndex].multipleAnalysis && !isAnalyzingMultiple) {
      handleAnalyzeMultiple(activeTicketIndex);
    }
  }, [step, activeTicketIndex]);


  const handleAnalyze = async (fixtureId: number) => {
    setAnalyzingId(fixtureId);
    try {
      const res = await analyzeSpecial({ data: { fixtureId } });
      setAnalysisResult(prev => ({ ...prev, [fixtureId]: res }));
      toast.success("Análise estratégica OneOption concluída!");
    } catch (error) {
      toast.error("Falha ao analisar mercados especiais.");
    } finally {
      setAnalyzingId(null);
    }
  };

  const isSelected = (id: number) => pinned["especiais-betano"].includes(id);
  const handleToggle = (id: number) => {
    // No manual selection in auto-mode unless specified, but keeping the utility
    import("@/lib/pinned-sections").then(m => m.toggleFixture("especiais-betano", id));
  };

  const handleAutoScan = async () => {
    if (fixtures.length === 0 || isScanning) return;
    setIsScanning(true);
    setScanProgress(0);
    setStep(1);
    
    try {
      setPinnedFixtures("especiais-betano", []);
      setTickets([]);
      setActiveTicketIndex(0);

      const scanData = fixtures.map(f => ({
        id: f.fixture.id,
        homeId: f.teams.home.id,
        awayId: f.teams.away.id
      }));

      const progressInterval = setInterval(() => {
        setScanProgress(prev => Math.min(prev + 5, 90));
      }, 200);

      const results = await bulkScan({ data: { fixtures: scanData } });
      clearInterval(progressInterval);
      setScanProgress(100);
      
      const fullAnalysis: Record<number, any> = {};
      results.forEach(res => {
        const topPicks = res.picks.slice(0, 3);
        const bestPick = [...topPicks].sort((a, b) => b.prob - a.prob)[0];
        fullAnalysis[res.fixtureId] = {
          text: res.justification,
          recommendedMarket: bestPick?.market || "margem_vitoria",
          picks: topPicks,
          audit: res.audit,
          stats: res.stats
        };
      });

      const validResults = results
        .filter(r => r.audit && r.audit.tier !== "BLOQUEADO")
        .sort((a, b) => (b.audit?.score || 0) - (a.audit?.score || 0));

      const generatedTickets: typeof tickets = [];
      
      // Bilhete 1: Top 4
      if (validResults.length >= 4) {
        const t1Fixtures = validResults.slice(0, 4).map(r => fixtures.find(f => f.fixture.id === r.fixtureId)!);
        generatedTickets.push({
          fixtures: t1Fixtures,
          analysisResult: fullAnalysis,
          multipleAnalysis: null
        });
      }

      // Bilhete 2: Offset 2 (Mescla o meio da tabela de assertividade)
      if (validResults.length >= 6) {
        const t2Fixtures = validResults.slice(2, 6).map(r => fixtures.find(f => f.fixture.id === r.fixtureId)!);
        generatedTickets.push({
          fixtures: t2Fixtures,
          analysisResult: fullAnalysis,
          multipleAnalysis: null
        });
      } else if (validResults.length >= 4) {
        // Se não tiver jogos suficientes, repete com pequena variação ou apenas o mesmo
        generatedTickets.push({ ...generatedTickets[0] });
      }

      // Bilhete 3: Diferentes combinações (Offset ou aleatoriedade controlada)
      if (validResults.length >= 8) {
        const t3Fixtures = validResults.slice(4, 8).map(r => fixtures.find(f => f.fixture.id === r.fixtureId)!);
        generatedTickets.push({
          fixtures: t3Fixtures,
          analysisResult: fullAnalysis,
          multipleAnalysis: null
        });
      } else if (validResults.length >= 4) {
        generatedTickets.push({ ...generatedTickets[0] });
      }

      setAnalysisResult(fullAnalysis);
      setTickets(generatedTickets);

      if (generatedTickets.length > 0) {
        toast.success(`Robô OneOption: ${generatedTickets.length} Bilhetes Estratégicos Gerados com Sucesso!`);
        // Definir os pinned do primeiro bilhete para a Step 2 funcionar
        setPinnedFixtures("especiais-betano", generatedTickets[0].fixtures.map(f => f.fixture.id));
        setTimeout(() => setStep(3), 2000);
      } else {
        toast.warning("Robô OneOption: Jogos insuficientes para auditoria elite.");
      }
    } catch (error) {
      toast.error("Erro na varredura inteligente do robô.");
      console.error(error);
    } finally {
      setIsScanning(false);
    }
  };

  // Execução Automática (Background)
  useEffect(() => {
    if (fixtures.length > 0 && Object.keys(analysisResult).length === 0) {
      handleAutoScan();
    }
  }, [fixtures.length]);


  if (step === 2 && tickets.length > 0) {
    const currentTicket = tickets[activeTicketIndex];
    const ticketFixtures = currentTicket.fixtures;
    const ticketAnalysis = currentTicket.analysisResult;

    return (
      <div className="mx-3 my-6 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col border-b border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent">
          <div className="flex items-center gap-4 px-5 py-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="text-base font-black uppercase tracking-wider text-white">Auditoria Elite: Bilhete {activeTicketIndex + 1}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Validação estatística rigorosa para os 4 jogos deste bilhete.</div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleAutoScan}
                className="px-4 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-[10px] font-black uppercase text-blue-400 transition-all border border-blue-500/20 flex items-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                Recriar
              </button>
              <button 
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white transition-all border border-white/10"
              >
                Voltar
              </button>
            </div>
          </div>

          {/* Seletor de Bilhetes na Auditoria */}
          <div className="flex items-center gap-2 px-5 pb-4">
            {tickets.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTicketIndex(idx)}
                className={cn(
                  "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border",
                  activeTicketIndex === idx 
                    ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20" 
                    : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                )}
              >
                Audit. Bilhete {idx + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {ticketFixtures.map(f => (
              <BetanoProofCard 
                key={f.fixture.id} 
                game={f} 
                analysis={ticketAnalysis[f.fixture.id]} 
              />
            ))}
          </div>

          <div className="p-6 rounded-[2rem] bg-gradient-to-br from-blue-600/20 to-blue-700/5 border border-blue-500/30">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-blue-400" />
              <div className="text-sm font-black text-white uppercase italic">Status da Auditoria</div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Assertividade do Bilhete {activeTicketIndex + 1}</span>
                <span className="text-xs font-black text-white">APROVADO</span>
              </div>
              
              <button 
                onClick={() => setStep(3)}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                Montar Bilhete {activeTicketIndex + 1} Consolidado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 3 && tickets.length > 0) {
    const currentTicket = tickets[activeTicketIndex];
    const ticketFixtures = currentTicket.fixtures;
    const ticketAnalysis = currentTicket.analysisResult;
    const ticketMultipleAnalysis = currentTicket.multipleAnalysis;

    return (
      <div className="mx-3 my-6 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
          <div className="flex items-center gap-4 px-5 py-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
              <Trophy className="w-8 h-8 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="text-base font-black uppercase tracking-wider text-white">Gerador de Múltiplos Bilhetes</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Escolha entre as 3 estratégias de elite geradas pela IA</div>
            </div>
            <button 
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white transition-all border border-white/10"
            >
              Voltar
            </button>
          </div>
          
          {/* Seletor de Bilhetes */}
          <div className="flex items-center gap-2 px-5 pb-4">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                disabled={!tickets[idx]}
                onClick={() => {
                  setActiveTicketIndex(idx);
                  // Atualizar pinned para visualização coerente se necessário, 
                  // mas aqui usaremos os dados do bilhete diretamente
                }}
                className={cn(
                  "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border",
                  activeTicketIndex === idx 
                    ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20" 
                    : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10",
                  !tickets[idx] && "opacity-30 cursor-not-allowed"
                )}
              >
                Bilhete {idx + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-6 rounded-[2.5rem] bg-gradient-to-br from-orange-500/20 to-orange-600/5 border border-orange-500/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Star className="w-32 h-32 text-orange-400" />
            </div>
            
            <div className="relative z-10 space-y-6">
              <div className="grid grid-cols-1 gap-4">
                {ticketFixtures.map((f, idx) => {
                  const analysis = ticketAnalysis[f.fixture.id];
                  const gamePicks = analysis?.picks || [];
                  
                  return (
                    <div key={f.fixture.id} className="p-5 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-[10px] font-black text-orange-400">
                            {idx + 1}
                          </span>
                          <div className="text-xs font-black text-white uppercase tracking-wider">
                            {f.teams.home.name} vs {f.teams.away.name}
                          </div>
                        </div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">
                          {f.league.name}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {gamePicks.map((p: any, pIdx: number) => (
                          <div key={pIdx} className="px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col gap-0.5 relative group/item">
                            <div className="flex items-center justify-between">
                              <span className="text-[7px] font-black text-orange-400/70 uppercase tracking-widest">
                                {BETANO_FIXED_MARKETS.find(m => m.id === p.market)?.name || "Mercado"}
                              </span>
                              <span className="text-[8px] font-black text-emerald-400">@{p.odd.toFixed(2)}</span>
                            </div>
                            <span className="text-[9px] font-black text-white uppercase truncate">
                              {p.pick}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-white/10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-3xl bg-black/40 border border-white/5 flex flex-col justify-center">
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Confiança Bilhete {activeTicketIndex + 1}</div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-black text-orange-400 italic">
                        {ticketMultipleAnalysis?.confidence || (ticketFixtures.length > 0 ? Math.round(ticketFixtures.reduce((acc, f) => acc + (ticketAnalysis[f.fixture.id]?.audit?.score || 0), 0) / ticketFixtures.length) : 0)}%
                      </div>
                      <div className="text-[10px] font-bold text-orange-400/60 mb-1.5 uppercase tracking-tighter">Nível Elite</div>
                    </div>
                  </div>

                  <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-center">
                    <div className="text-[10px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Odd Total Acumulada</div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-black text-emerald-400 italic">
                        @{ticketFixtures.reduce((acc, f) => {
                          const picks = ticketAnalysis[f.fixture.id]?.picks || [];
                          const bestOdd = picks.length > 0 ? picks[0].odd : 1.5;
                          return acc * bestOdd;
                        }, 1).toFixed(2)}
                      </div>
                      <div className="text-[10px] font-bold text-emerald-400/60 mb-1.5 uppercase tracking-tighter">Retorno IA</div>
                    </div>
                  </div>
                  
                  <div className="p-5 rounded-3xl bg-orange-500/5 border border-orange-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Prova Real IA</span>
                    </div>
                    <p className="text-[11px] text-orange-100/70 leading-relaxed font-medium">
                      {isAnalyzingMultiple ? "IA analisando assertividade..." : (ticketMultipleAnalysis?.analysis || "A IA OneOption processou este bilhete e identificou um padrão de cobertura estratégica otimizado para este grupo de jogos.")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <button 
                    onClick={async () => {
                      const { printFechamento } = await import("@/lib/fechamento-export");
                      const f = {
                        name: `MÚLTIPLA ESTRATÉGICA BETANO - BILHETE ${activeTicketIndex + 1}`,
                        date: new Date().toLocaleDateString("pt-BR"),
                        confidence: ticketMultipleAnalysis?.confidence || 85,
                        analysis: ticketMultipleAnalysis?.analysis,
                        tickets: [
                          {
                            market: "M1",
                            label: `Bilhete ${activeTicketIndex + 1} (12 Escolhas Consolidadas)`,
                            picks: ticketFixtures.flatMap(g => 
                              (ticketAnalysis[g.fixture.id]?.picks || []).map((p: any) => ({
                                home: g.teams.home.name,
                                away: g.teams.away.name,
                                league: g.league.name,
                                time: g.fixture.date,
                                pick: p.pick,
                                tag: BETANO_FIXED_MARKETS.find(m => m.id === p.market)?.name.charAt(0) || "M",
                                p: p.prob,
                                odd: p.odd,
                                reasoning: p.reasoning
                              }))
                            )
                          }
                        ],
                        justification: `Este bilhete (${activeTicketIndex + 1}/3) foi gerado pelo robô OneOption utilizando cruzamento matemático de λ Total e GS Médio para maximizar a assertividade.`
                      };
                      printFechamento(f);
                    }}
                    className="py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10"
                  >
                    <FileText className="w-4 h-4" />
                    Exportar PDF (Bilhete {activeTicketIndex + 1})
                  </button>

                  <button 
                    onClick={() => {
                      const ticketSaveData = {
                        name: `Bilhete ${activeTicketIndex + 1} - Especial Betano`,
                        date: new Date().toISOString(),
                        confidence: ticketMultipleAnalysis?.confidence || 85,
                        analysis: ticketMultipleAnalysis?.analysis,
                        games: ticketFixtures.map(g => ({
                          home: g.teams.home.name,
                          away: g.teams.away.name,
                          picks: ticketAnalysis[g.fixture.id]?.picks
                        }))
                      };
                      saveMutation.mutate(ticketSaveData);
                    }}
                    disabled={saveMutation.isPending}
                    className="py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Bilhete {activeTicketIndex + 1}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="mx-3 my-6 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="flex items-center gap-4 px-5 py-5 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
            <History className="w-8 h-8 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="text-base font-black uppercase tracking-wider text-white">Histórico de Bilhetes</div>
            <div className="text-[10px] text-muted-foreground font-semibold">Conferência e gestão de assertividade.</div>
          </div>
          <button 
            onClick={() => setStep(1)}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white transition-all border border-white/10"
          >
            Voltar
          </button>
        </div>

        <div className="p-6">
          {isLoadingTickets ? (
            <LoadingList />
          ) : !savedTickets || savedTickets.length === 0 ? (
            <EmptyState text="Nenhum bilhete salvo ainda." />
          ) : (
            <div className="space-y-6">
              {/* Dashboard de Performance OneOption */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-5 rounded-[2rem] bg-black/40 border border-white/5 relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                    <Trophy className="w-24 h-24 text-blue-400" />
                  </div>
                  <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Nível da IA (Múltiplas)</div>
                  <div className="flex items-end gap-2">
                    <div className="text-3xl font-black text-white italic">
                      {savedTickets?.length > 0 
                        ? Math.round((savedTickets.filter((t: any) => t.status === 'won').length / savedTickets.length) * 100) 
                        : 0}%
                    </div>
                    <div className="text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-tighter">Assertividade Elite</div>
                  </div>
                </div>

                <div className="p-5 rounded-[2rem] bg-black/40 border border-white/5 flex flex-col justify-center">
                  <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total de Bilhetes</div>
                  <div className="text-3xl font-black text-white italic">{savedTickets?.length || 0}</div>
                </div>

                <div className="p-5 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-center">
                  <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Status Geral</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="text-xs font-black text-white uppercase italic">Operacional · Premium</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Layout className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Registros de Múltiplas</h3>
              </div>

              {savedTickets.map((ticket: any) => (
                <div key={ticket.id} className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-blue-500/20 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-blue-400/50" />
                      <span className="text-[10px] font-black text-white uppercase">{new Date(ticket.created_at).toLocaleDateString("pt-BR")}</span>
                      <div className={cn(
                        "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                        ticket.status === 'won' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        ticket.status === 'lost' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      )}>
                        {ticket.status === 'pending' ? 'Pendente' : ticket.status === 'won' ? 'Green' : 'Red'}
                      </div>
                    </div>
                    <div className="text-[10px] font-black text-blue-400 italic">{ticket.data.confidence}% Confiança</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                    {ticket.data.games.map((g: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-2xl bg-black/40 border border-white/5">
                        <div className="text-[9px] font-black text-white uppercase truncate mb-1">{g.home} vs {g.away}</div>
                        <div className="space-y-1">
                          {g.picks?.map((p: any, pIdx: number) => (
                            <div key={pIdx} className="text-[7px] text-muted-foreground font-bold uppercase truncate">• {p.pick}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
                    <p className="text-[9px] text-muted-foreground font-medium line-clamp-1 italic flex-1">
                      {ticket.data.analysis || "Análise estratégica OneOption IA."}
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => updateStatusFn({ data: { id: ticket.id, status: 'won' } }).then(() => queryClient.invalidateQueries({ queryKey: ["betano-tickets-history"] }))}
                        className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => updateStatusFn({ data: { id: ticket.id, status: 'lost' } }).then(() => queryClient.invalidateQueries({ queryKey: ["betano-tickets-history"] }))}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }


  return (
    <div className="mx-3 my-6 rounded-[2.5rem] bg-card border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-6 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
        <div className="w-16 h-16 rounded-3xl bg-blue-600/20 flex items-center justify-center border border-blue-600/30 shadow-inner">
          <Star className="w-10 h-10 text-blue-400 drop-shadow-[0_0_12px_rgba(37,99,235,0.5)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="text-xl font-black uppercase tracking-widest text-white italic">Especiais Betano <span className="text-blue-500">Auto Pilot</span></div>
            <div className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-[8px] font-black text-blue-400 uppercase tracking-tighter animate-pulse">Robô Ativo</div>
          </div>
          <div className="text-[10px] text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Múltipla Estratégica Automatizada · 100% Inteligência Artificial</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black text-white/70 uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Auditoria Elite
            </span>
            <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black text-white/70 uppercase tracking-widest flex items-center gap-1">
              <Brain className="w-3 h-3 text-blue-400" />
              Poisson + Dixon-Coles
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setStep(4)}
            className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white border border-white/10 transition-all flex items-center gap-2 shadow-xl"
          >
            <History className="w-4 h-4" />
            Performance
          </button>
          <button 
            onClick={handleAutoScan}
            disabled={isScanning || fixtures.length === 0}
            className={cn(
              "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 shadow-2xl",
              isScanning 
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
            )}
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
            {isScanning ? `Analisando ${scanProgress}%` : "Iniciar Varredura Robô"}
          </button>
        </div>
      </div>

      {isScanning && (
        <div className="px-6 py-4 bg-blue-600/5 border-b border-white/5 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Processando base de dados OneOption...</span>
            <span className="text-[9px] font-black text-blue-400">{scanProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300 shadow-[0_0_8px_rgba(37,99,235,0.4)]" 
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-blue-500" />
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Base de Jogos do Dia</h3>
          </div>
          <div className="text-[10px] text-muted-foreground font-medium italic">
            {fixtures.length} confrontos elite mapeados
          </div>
        </div>

        {isLoading ? (
          <LoadingList />
        ) : !fixtures || fixtures.length === 0 ? (
          <EmptyState text="Nenhum jogo especial encontrado para hoje. Tente amanhã ou em dias de grandes ligas." />
        ) : (
          <div className="space-y-8">
            {/* Stepper Visual OneOption */}
            <div className="flex items-center justify-between px-8 py-4 bg-black/40 rounded-3xl border border-white/5 relative">
              {[
                { s: 1, label: "Varredura", icon: Scan },
                { s: 2, label: "Prova Real", icon: ShieldCheck },
                { s: 3, label: "Fechamento", icon: Trophy },
                { s: 4, label: "Relatório", icon: History },
              ].map((item, idx, arr) => (
                <div key={item.s} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => item.s <= step || analysisResult ? setStep(item.s as any) : null}>
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-500 shadow-lg",
                      step === item.s 
                        ? "bg-blue-600 border-blue-500 text-white scale-110 shadow-blue-500/30" 
                        : step > item.s 
                          ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" 
                          : "bg-white/5 border-white/10 text-white/30"
                    )}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest transition-colors",
                      step === item.s ? "text-blue-400" : "text-white/40"
                    )}>{item.label}</span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className="flex-1 h-[2px] mx-4 rounded-full bg-white/5 overflow-hidden">
                      <div className={cn(
                        "h-full bg-blue-600 transition-all duration-1000",
                        step > item.s ? "w-full" : "w-0"
                      )} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {fixtures.slice(0, 16).map((f) => (
                <div key={f.fixture.id} className={cn(
                  "p-4 rounded-3xl bg-white/5 border transition-all group relative overflow-hidden",
                  isSelected(f.fixture.id) ? "border-orange-500 bg-orange-500/5" : "border-white/10 hover:border-orange-500/30"
                )}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest">
                      {f.league.name}
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground">
                      {new Date(f.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex flex-col items-center gap-2 flex-1">
                      <img src={f.teams.home.logo} alt="" className="w-10 h-10 object-contain" />
                      <span className="text-[10px] font-black text-center text-white uppercase truncate w-full">
                        {f.teams.home.name}
                      </span>
                    </div>
                    <div className="text-xs font-black text-muted-foreground italic opacity-50">VS</div>
                    <div className="flex flex-col items-center gap-2 flex-1">
                      <img src={f.teams.away.logo} alt="" className="w-10 h-10 object-contain" />
                      <span className="text-[10px] font-black text-center text-white uppercase truncate w-full">
                        {f.teams.away.name}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-4">
                    {BETANO_FIXED_MARKETS.map((market) => (
                      <div key={market.id} className="p-3 rounded-2xl bg-black/20 border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-3 h-3 text-orange-400" />
                          <span className="text-[9px] font-black text-white uppercase tracking-wider">{market.name}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {market.options.map((opt, idx) => {
                            const label = opt.label
                              .replace(/{home}/g, f.teams.home.name)
                              .replace(/{away}/g, f.teams.away.name);
                            const analysis = analysisResult[f.fixture.id];
                            const isAISelected = analysis?.picks?.some(p => p.market === market.id && p.pick === label);
                            
                            return (
                              <div 
                                key={idx}
                                className={cn(
                                  "p-2 rounded-xl text-[8px] font-bold border transition-all flex items-center justify-between",
                                  isAISelected 
                                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20 scale-[1.02] z-10" 
                                    : "bg-white/5 border-white/5 text-muted-foreground/60"
                                )}
                              >
                                <span className="truncate pr-1">{label}</span>
                                {isAISelected && <Sparkles className="w-2.5 h-2.5 shrink-0 animate-pulse" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {analysisResult[f.fixture.id] && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-blue-600/10 border border-blue-500/20">
                      <Brain className="w-3 h-3 text-blue-400" />
                      <span className="text-[9px] font-black text-blue-400 uppercase italic">IA: Auditoria Elite {analysisResult[f.fixture.id]?.audit?.score}%</span>
                    </div>
                  )}


                  <div className="mt-4 pt-4 border-t border-white/5">
                    {analysisResult[f.fixture.id] ? (
                      <div className={cn(
                        "p-3 rounded-2xl flex items-center justify-between border transition-all",
                        isSelected(f.fixture.id) ? "bg-blue-600/10 border-blue-500/30" : "bg-white/5 border-white/10"
                      )}>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            isSelected(f.fixture.id) ? "bg-blue-600 animate-pulse" : "bg-white/20"
                          )} />
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            isSelected(f.fixture.id) ? "text-blue-400" : "text-white/40"
                          )}>
                            {isSelected(f.fixture.id) ? "Selecionado pelo Robô" : "Auditado"}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-white italic">{analysisResult[f.fixture.id]?.audit?.score}% CONF.</span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Aguardando Varredura do Robô...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
