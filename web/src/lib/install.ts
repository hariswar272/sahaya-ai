import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Captured at import time so an early `beforeinstallprompt` is not missed.
let deferred: InstallEvent | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** PWA install button support (Chrome / Edge / Android). */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subscribers.add(f);
    return () => {
      subscribers.delete(f);
    };
  }, []);
  return {
    canInstall: !!deferred,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* dismissed */
      }
      deferred = null;
      notify();
    },
  };
}
