import { useSyncExternalStore } from "react";

let selected: number | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function setSelectedFixture(id: number | null) {
  if (selected === id) return;
  selected = id;
  emit();
}

export function getSelectedFixture() { return selected; }

export function useSelectedFixture(): number | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selected,
    () => null,
  );
}

export function isDesktopThreeCol(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1280px)").matches;
}
