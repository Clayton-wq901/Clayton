import { useEffect, useState } from "react";

const KEY = "tdb:section";
const EVENT = "tdb:section-change";
const DEFAULT = "dashboard-clayton";

/** Sessão apenas: ao reabrir o app do zero, sempre começa na tela inicial. */
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function setActiveSection(id: string) {
  try { store()?.setItem(KEY, id); } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
  }
}

export function useActiveSection(): string {
  const [v, setV] = useState<string>(DEFAULT);
  useEffect(() => {
    try {
      // limpa resquício da versão antiga que fixava a seção para sempre
      localStorage.removeItem(KEY);
      setV(store()?.getItem(KEY) ?? DEFAULT);
    } catch {}

    const onCustom = (e: Event) => setV((e as CustomEvent<string>).detail);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) setV(e.newValue); };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return v;
}
