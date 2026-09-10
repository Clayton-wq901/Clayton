/** Sinal sonoro (WebAudio) usado pelo Radar ao vivo. */

const STORAGE_KEY = "radar:sound";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Desbloqueia o áudio no celular — precisa ser chamado num gesto do usuário. */
export function primeSound() {
  getCtx();
}

function tone(startAt: number, freq: number, duration: number, gainPeak: number) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/**
 * Toca o alerta.
 * - "normal": dois bipes curtos
 * - "high":   três bipes ascendentes (gatilhos de odd alta)
 */
export function playAlert(kind: "normal" | "high" = "normal") {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  if (kind === "high") {
    tone(t, 740, 0.12, 0.18);
    tone(t + 0.16, 940, 0.12, 0.2);
    tone(t + 0.32, 1180, 0.2, 0.22);
  } else {
    tone(t, 660, 0.11, 0.15);
    tone(t + 0.15, 880, 0.16, 0.16);
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(kind === "high" ? [40, 60, 40, 60, 80] : [30, 50, 40]);
    } catch {
      /* ignore */
    }
  }
}

/** Permissão atual de notificações do navegador. */
export function notifyPermission(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

/** Pede permissão de notificação — chamar dentro de um gesto do usuário. */
export async function requestNotifications(): Promise<ReturnType<typeof notifyPermission>> {
  if (notifyPermission() === "unsupported") return "unsupported";
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
  return notifyPermission();
}

/** Mostra uma notificação do sistema (celular/desktop) para um gatilho novo. */
export function notifyAlert(title: string, body: string, tag = "radar") {
  if (notifyPermission() !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // @ts-expect-error vibrate não está no lib.dom
      vibrate: [40, 60, 40],
    });
  } catch {
    /* ignore */
  }
}
