import { useLiveScanner } from "@/lib/live-scanner";
import { Bell, BellOff, Zap } from "lucide-react";
import { useState } from "react";
import { RadarPanel } from "./RadarPanel";

export function ScannerToggle() {
  const { isActive, setIsActive, lastScanAt, foundOpportunities } = useLiveScanner();
  const [showRadar, setShowRadar] = useState(false);

  const hasNew = foundOpportunities.length > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 p-1 rounded-full bg-white/5 border border-white/10">
        <button
          onClick={() => setIsActive(!isActive)}
          className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
            isActive 
              ? "bg-primary/20 text-primary" 
              : "bg-transparent text-muted-foreground hover:bg-white/5"
          }`}
          title={isActive ? `Scanner Ativo (Última análise: ${lastScanAt?.toLocaleTimeString() ?? '—'})` : "Ativar Scanner ao Vivo"}
        >
          {isActive ? (
            <>
              <Bell className="w-3.5 h-3.5 animate-bounce" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            </>
          ) : (
            <BellOff className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="w-[1px] h-4 bg-white/10" />

        <button
          onClick={() => setShowRadar(!showRadar)}
          className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
            showRadar 
              ? "bg-amber-500/20 text-amber-500" 
              : hasNew && isActive
                ? "bg-amber-500/10 text-amber-500 animate-pulse"
                : "bg-transparent text-muted-foreground hover:bg-white/5"
          }`}
          title="Radar de Sinais ao Vivo"
        >
          <Zap className={`w-3.5 h-3.5 ${hasNew && isActive ? "fill-current" : ""}`} />
          {hasNew && isActive && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-black border-2 border-background">
              {foundOpportunities.length}
            </span>
          )}
        </button>
      </div>

      {showRadar && (
        <div className="absolute right-0 top-12 z-50">
          <div className="fixed inset-0 z-[-1]" onClick={() => setShowRadar(false)} />
          <RadarPanel onClose={() => setShowRadar(false)} />
        </div>
      )}
    </div>
  );
}
