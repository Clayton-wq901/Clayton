import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BetSlipItem = {
  /** id único da seleção: `${fixtureId}:${market}:${selection}` */
  id: string;
  fixtureId: number;
  home: string;
  away: string;
  league?: string;
  time?: string;
  /** nome do mercado, ex.: "Escanteios", "Gols", "Resultado Final" */
  market: string;
  /** a escolha dentro do mercado, ex.: "Menos 9.5" */
  selection: string;
  /** probabilidade estimada pela IA (0..1) */
  prob?: number;
  /** odd estimada / justa */
  odd?: number;
  type?: "ia" | "manual";
};

export const makeSlipId = (fixtureId: number, market: string, selection: string) =>
  `${fixtureId}:${market}:${selection}`;

type BetSlipState = {
  items: BetSlipItem[];
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleItem: (item: BetSlipItem) => void;
  addItem: (item: BetSlipItem) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
};

export const useBetSlip = create<BetSlipState>()(
  persist(
    (set, get) => ({
      items: [],
      open: false,
      setOpen: (open) => set({ open }),
      addItem: (item) =>
        set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, item] })),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      toggleItem: (item) =>
        set((s) =>
          s.items.some((i) => i.id === item.id)
            ? { items: s.items.filter((i) => i.id !== item.id) }
            : { items: [...s.items, item] },
        ),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    { name: "oneoption-bet-slip", partialize: (s) => ({ items: s.items }) },
  ),
);

export type SlipGroup = {
  fixtureId: number;
  home: string;
  away: string;
  league?: string;
  time?: string;
  items: BetSlipItem[];
  /** true quando há 2+ mercados do mesmo jogo → "Aposta Criada" */
  isCreated: boolean;
};

/** Agrupa as seleções por partida (Aposta Criada) e mantém as simples separadas. */
export function groupSlip(items: BetSlipItem[]): SlipGroup[] {
  const map = new Map<number, SlipGroup>();
  for (const it of items) {
    const g = map.get(it.fixtureId);
    if (g) g.items.push(it);
    else
      map.set(it.fixtureId, {
        fixtureId: it.fixtureId,
        home: it.home,
        away: it.away,
        league: it.league,
        time: it.time,
        items: [it],
        isCreated: false,
      });
  }
  const groups = [...map.values()];
  groups.forEach((g) => (g.isCreated = g.items.length > 1));
  return groups;
}

/** Odd combinada: por jogo (aposta criada) multiplicamos as odds, e depois entre jogos. */
export function slipOdds(groups: SlipGroup[]) {
  let total = 1;
  const perGroup = groups.map((g) => {
    const o = g.items.reduce((acc, i) => acc * (i.odd && i.odd > 1 ? i.odd : fairOdd(i.prob)), 1);
    total *= o;
    return o;
  });
  return { perGroup, total };
}

export function fairOdd(prob?: number) {
  if (!prob || prob <= 0.01) return 1;
  return Math.max(1.01, 1 / prob);
}
