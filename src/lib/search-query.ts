import { useEffect, useState } from "react";

const EVENT = "tdb:search-change";
let current = "";

export function setSearchQuery(q: string) {
  current = q;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: q }));
  }
}

export function getSearchQuery() {
  return current;
}

export function useSearchQuery(): string {
  const [v, setV] = useState<string>(current);
  useEffect(() => {
    const onCustom = (e: Event) => setV((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onCustom);
    return () => window.removeEventListener(EVENT, onCustom);
  }, []);
  return v;
}
