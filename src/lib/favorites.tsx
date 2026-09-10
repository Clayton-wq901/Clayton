import { useSyncExternalStore } from "react";
import { Bell, BellOff, Star } from "lucide-react";
import { useState } from "react";
import { isSoundEnabled, setSoundEnabled, primeSound, playAlert } from "./alert-sound";
import { toast } from "sonner";

const KEY = "tdb:favorites";
const LISTENERS = new Set<() => void>();

function read(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let state: number[] = read();

function emit() {
  LISTENERS.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function toggleFavorite(id: number) {
  state = state.includes(id) ? state.filter((x) => x !== id) : [...state, id];
  persist();
  emit();
}

export function isFavorite(id: number): boolean {
  return state.includes(id);
}

// snapshot estável para SSR (evita loop infinito de render)
const SERVER_SNAPSHOT: number[] = [];

export function useFavorites(): number[] {
  return useSyncExternalStore(
    (cb) => {
      LISTENERS.add(cb);
      return () => LISTENERS.delete(cb);
    },
    () => state,
    () => SERVER_SNAPSHOT,
  );
}

export function FavoriteButton({ fixtureId }: { fixtureId: number }) {
  const favorites = useFavorites();
  const active = favorites.includes(fixtureId);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(fixtureId);
      }}
      className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-300 ${
        active 
          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
          : "bg-black/30 border-white/5 text-white/30 hover:text-white hover:border-white/20"
      }`}
      title={active ? "Remover favoritos" : "Favoritar"}
    >
      <Star className={`w-4 h-4 ${active ? "fill-current" : ""}`} />
    </button>
  );
}

export function NotificationButton({ fixtureId }: { fixtureId: number }) {
  const [active, setActive] = useState(false);
  const sound = isSoundEnabled();

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sound) {
      primeSound();
      setSoundEnabled(true);
    }
    const next = !active;
    setActive(next);
    if (next) {
      playAlert("normal");
      toast.success("Alertas ativados!");
    }
  };

  return (
    <button
      onClick={toggle}
      className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-300 ${
        active 
          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
          : "bg-black/30 border-white/5 text-white/30 hover:text-white hover:border-white/20"
      }`}
      title={active ? "Alertas ativos" : "Ativar alertas"}
    >
      {active ? <Bell className="w-4 h-4 fill-current" /> : <BellOff className="w-4 h-4" />}
    </button>
  );
}
