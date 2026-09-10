import { ShimmerRows } from "@/components/Shimmer";

export function LoadingList() {
  return (
    <div className="pt-4">
      <ShimmerRows rows={6} height="h-16" />
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-20 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
        <span className="text-2xl grayscale opacity-20">⚽</span>
      </div>
      <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 px-6 text-center leading-relaxed">
        {text}
      </div>
      <div className="mt-4 text-[9px] uppercase tracking-tighter text-primary/30 font-bold">
        OneOptiOn-BetA IA
      </div>
    </div>
  );
}
