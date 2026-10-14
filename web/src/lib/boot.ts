import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/utils";

// Boot sequence: the preloader plays once per session; the hero reveal waits for it.
const KEY = "sahaya.preloaded";

function alreadyShown(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Decided once at load: show the preloader on the first visit of a session, never with reduced motion. */
export const shouldShowPreloader = typeof window !== "undefined" && !alreadyShown() && !prefersReducedMotion();

if (shouldShowPreloader) {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

let ready = !shouldShowPreloader;
let resolveReady: () => void = () => {};
const readyPromise = new Promise<void>((r) => {
  resolveReady = r;
});
if (ready) resolveReady();

/** Called by the preloader once its exit has finished. */
export function markBootReady() {
  if (ready) return;
  ready = true;
  resolveReady();
}

// Safety net: nothing may stay hidden if the preloader never reports back.
if (typeof window !== "undefined" && !ready) window.setTimeout(markBootReady, 3000);

export function isBootReady() {
  return ready;
}

/** true once the preloader has gone (immediately on repeat visits / reduced motion). */
export function useBootReady(): boolean {
  const [isReady, setReady] = useState(ready);
  useEffect(() => {
    if (isReady) return;
    let alive = true;
    readyPromise.then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [isReady]);
  return isReady;
}
