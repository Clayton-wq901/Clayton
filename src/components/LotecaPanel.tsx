import { Target, Trophy, Info, FileText, CheckCircle2, AlertTriangle, RefreshCw, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchLotecaGrade } from "@/lib/loteca/loteca-fetcher.functions";
import type { LotecaGrade } from "@/lib/loteca/loteca-fetcher.server";
import { toast } from "sonner";

export function LotecaPanel() {
  const [grade, setGrade] = useState<LotecaGrade | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGrade = async () => {
    setLoading(true);
    try {
      console.log("Loading Lotéca grade...");
      const data = await fetchLotecaGrade();
      console.log("Lotéca grade loaded:", data);
      setGrade(data);
    } catch (error) {
      console.error("Error loading Lotéca grade:", error);
      toast.error("Erro ao carregar a grade da Lotéca. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadGrade();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mx-3 mb-8 rounded-[2.5rem] bg-gradient-to-br from-yellow-500/15 via-card to-card border border-yellow-500/30 overflow-hidden shadow-2xl relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        <div className="flex flex-wrap items-center gap-5 px-6 py-6 border-b border-white/5 bg-yellow-500/5 relative z-10">
          <div className="w-16 h-16 rounded-[1.25rem] bg-yellow-500/20 flex items-center justify-center border border-yellow-500/30 shadow-inner">
            <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black uppercase tracking-wider text-yellow-500">Lotéca IA Especial</h2>
            <p className="text-[12px] text-muted-foreground font-semibold leading-relaxed mt-1">Fechamentos Estratégicos baseados em probabilidades reais e Dixon-Coles.</p>
          </div>
          <button 
            onClick={loadGrade}
            disabled={loading}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50 group-hover:scale-105 active:scale-95 shadow-xl"
          >
            <RefreshCw className={`w-5 h-5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!loading && !grade && (
        <div className="p-8 text-center bg-card border border-white/5 rounded-3xl">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold uppercase">Nenhuma grade encontrada</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Não foi possível carregar os jogos da Lotéca no momento.
          </p>
          <button 
            onClick={loadGrade}
            className="mt-4 px-4 py-2 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {grade && (
        <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in duration-700">
          <div className="bg-yellow-500/10 border-b border-white/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-black uppercase tracking-tighter">Concurso {grade.contestNumber}</span>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">{grade.contestDate}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/20">
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest w-12 text-center">Nº</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Mandante</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center w-8">x</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Visitante</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right">Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {grade.games.map((game) => (
                  <tr key={game.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5 text-xs font-black text-center text-muted-foreground">{game.id}</td>
                    <td className="px-4 py-3.5 text-xs font-bold uppercase tracking-tight group-hover:text-yellow-500 transition-colors">{game.homeTeam}</td>
                    <td className="px-4 py-3.5 text-[10px] font-black text-center text-white/20">VS</td>
                    <td className="px-4 py-3.5 text-xs font-bold uppercase tracking-tight group-hover:text-yellow-500 transition-colors">{game.awayTeam}</td>
                    <td className="px-4 py-3.5 text-[10px] font-bold text-right text-muted-foreground uppercase">{game.day}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-[2rem] bg-card border border-white/5 space-y-2 group hover:border-primary/30 transition-all duration-500">
          <div className="flex items-center gap-2 text-primary">
            <Target className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Análise de Grade</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Monitoramento automático dos 14 jogos da grade atual com base em probabilidades de 1X2 e tendências de mercado.
          </p>
        </div>
        
        <div className="p-5 rounded-[2rem] bg-card border border-white/5 space-y-2 group hover:border-emerald-500/30 transition-all duration-500">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Filtro de Secos</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Identificação de favoritos absolutos para reduzir o custo da aposta usando "secos" de alta confiança.
          </p>
        </div>

        <div className="p-5 rounded-[2rem] bg-card border border-white/5 space-y-2 group hover:border-yellow-500/30 transition-all duration-500">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Gestão de Duplos</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Sugestão inteligente de duplos e triplos onde a IA identifica maior risco de zebra ou equilíbrio total.
          </p>
        </div>
      </div>

      <div className="rounded-[3rem] bg-gradient-to-br from-yellow-500/20 via-yellow-500/5 to-transparent border border-yellow-500/20 p-12 text-center space-y-8 relative overflow-hidden group shadow-2xl">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />
        <div className="absolute inset-0 bg-yellow-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        
        <div className="w-24 h-24 rounded-[2rem] bg-yellow-500/10 flex items-center justify-center mx-auto border border-yellow-500/20 shadow-inner relative z-10 animate-pulse">
          <Trophy className="w-12 h-12 text-yellow-500" />
        </div>
        
        <div className="max-w-md mx-auto space-y-4 relative z-10">
          <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Gerar Fechamento Lotéca</h3>
          <p className="text-[14px] text-muted-foreground font-medium leading-relaxed">
            Nossa IA avançada processará os 14 jogos, analisando probabilidades Dixon-Coles e tendências globais para sugerir o melhor investimento.
          </p>
        </div>
        
        <button className="px-10 py-5 rounded-2xl bg-yellow-500 text-black font-black text-sm uppercase tracking-widest hover:bg-yellow-400 hover:scale-105 transition-all active:scale-95 shadow-[0_0_50px_rgba(234,179,8,0.4)] relative z-10">
          Iniciar Processamento IA
        </button>
      </div>
      
      <div className="rounded-[2rem] border border-white/5 bg-black/40 p-6 shadow-inner">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-muted-foreground/60" />
          <span className="text-[11px] font-black uppercase text-muted-foreground/60 tracking-[0.2em]">Metodologia Lotéca IA</span>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground/80 font-medium">
          O sistema utiliza o cruzamento de dados históricos da Lotéca com o modelo Dixon-Coles atualizado 24h antes do encerramento das apostas. O objetivo é maximizar o retorno sobre o investimento (ROI) cobrindo os resultados mais prováveis com o menor número de volantes possível. A fonte oficial de dados é importada de loterias.caixa.gov.br.
        </p>
      </div>
    </div>
  );
}
