import { Brain, ShieldCheck, Zap, Info, Target, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BetanoProofCardProps {
  game: any;
  analysis: any;
}

export function BetanoProofCard({ game, analysis }: BetanoProofCardProps) {
  const audit = analysis?.audit;
  const stats = analysis?.stats;
  
  if (!audit) return null;

  return (
    <div className="p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/10 hover:border-orange-500/30 transition-all group">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            <img src={game.teams.home.logo} className="w-10 h-10 object-contain p-1.5 bg-white/5 rounded-xl border border-white/10" alt="" />
            <img src={game.teams.away.logo} className="w-10 h-10 object-contain p-1.5 bg-white/5 rounded-xl border border-white/10" alt="" />
          </div>
          <div>
            <div className="text-xs font-black text-white uppercase tracking-wider">{game.teams.home.name} vs {game.teams.away.name}</div>
            <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{game.league.name}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={cn(
            "px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest",
            audit.tier === "ELITE" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : 
            audit.tier === "POTENCIAL" ? "bg-orange-500/10 border-orange-500/30 text-orange-400" :
            "bg-red-500/10 border-red-500/30 text-red-400"
          )}>
            {audit.tier} OneOption
          </div>
          <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase tracking-widest">
            Score: {audit.score}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
          <div className="text-[7px] font-black text-muted-foreground uppercase mb-1">λ Total</div>
          <div className="text-xs font-black text-white">{audit.lambdaTotal.toFixed(2)}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
          <div className="text-[7px] font-black text-muted-foreground uppercase mb-1">BTTS Prob</div>
          <div className="text-xs font-black text-white">{Math.round(stats?.pBTTS * 100)}%</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
          <div className="text-[7px] font-black text-muted-foreground uppercase mb-1">GM Médio</div>
          <div className="text-xs font-black text-white">{( (stats?.gfHome + stats?.gfAway) / 2 ).toFixed(2)}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
          <div className="text-[7px] font-black text-muted-foreground uppercase mb-1">Defesa Rec.</div>
          <div className="text-xs font-black text-white">{( (stats?.gaHome + stats?.gaAway) / 2 ).toFixed(2)}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Mercados Auditados</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {analysis.picks?.map((p: any, idx: number) => (
            <div key={idx} className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-0.5 relative group/pick">
              <span className="text-[7px] font-black text-muted-foreground uppercase">{p.market.replace('_', ' ')}</span>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold text-white uppercase truncate">{p.pick}</span>
                <span className="text-[9px] font-black text-emerald-400">@{p.odd.toFixed(2)}</span>
              </div>
              <span className="text-[8px] font-black text-orange-400">{Math.round(p.prob * 100)}% Confiança</span>
              
              {/* Bloco Transparente de Prova Real da IA */}
              <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[7px] text-emerald-100/60 leading-tight font-medium">
                <div className="flex items-center gap-1 mb-0.5 text-emerald-400/80">
                  <Zap className="w-2 h-2" />
                  <span className="font-black uppercase tracking-tighter">Prova Real IA</span>
                </div>
                {p.reasoning}
              </div>
            </div>
          ))}
        </div>
      </div>

      {analysis.text && (
        <div className="mt-4 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] font-black text-orange-400 uppercase italic">Veredito da Elite</span>
          </div>
          <p className="text-[11px] text-orange-100/70 leading-relaxed font-medium">
            {analysis.text}
          </p>
        </div>
      )}
    </div>
  );
}
