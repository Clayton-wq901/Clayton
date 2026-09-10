/** Skeletons fluidos (shimmer) usados enquanto os dados carregam. */

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

export function ShimmerRows({ rows = 6, height = "h-12" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2 fade-rise">
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} className={`${height} rounded-xl`} />
      ))}
    </div>
  );
}

/** Skeleton do topo do Resumo: cards de probabilidade + métricas. */
export function ShimmerSummary() {
  return (
    <div className="space-y-3 fade-rise">
      <Bar className="h-20 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Bar className="h-40 rounded-2xl" />
    </div>
  );
}

/** Skeleton das barras de estatísticas. */
export function ShimmerStats() {
  return (
    <div className="space-y-3 fade-rise">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Bar className="h-3 w-8" />
            <Bar className="h-3 w-24" />
            <Bar className="h-3 w-8" />
          </div>
          <Bar className="h-1.5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton do campo tático. */
export function ShimmerLineups() {
  return (
    <div className="space-y-3 fade-rise">
      <Bar className="h-[420px] rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Bar className="h-40 rounded-2xl" />
        <Bar className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

/** Skeleton da tabela de classificação. */
export function ShimmerTable() {
  return (
    <div className="rounded-2xl bg-card overflow-hidden fade-rise">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="px-2 py-2 border-b border-border/40 last:border-0">
          <Bar className="h-4" />
        </div>
      ))}
    </div>
  );
}
