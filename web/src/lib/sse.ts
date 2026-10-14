import { useEffect, useRef } from "react";

type Handler = (data: any) => void;

// One shared EventSource for the whole app; listeners subscribe by event name
// ("sos:incident", "arogya:patient", ...). Reconnects on its own.
const listeners = new Map<string, Set<Handler>>();
const attached = new Set<string>();
let es: EventSource | null = null;
let retryTimer: number | undefined;

function attach(name: string) {
  if (!es || attached.has(name)) return;
  attached.add(name);
  es.addEventListener(name, (ev) => {
    const raw = (ev as MessageEvent).data;
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* plain text payload */
    }
    listeners.get(name)?.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error("stream handler failed", name, e);
      }
    });
  });
}

function connect() {
  if (es || typeof window === "undefined" || typeof EventSource === "undefined") return;
  es = new EventSource("/api/stream");
  attached.clear();
  for (const name of listeners.keys()) attach(name);
  es.onerror = () => {
    // The browser retries by itself while CONNECTING; rebuild only when it gave up.
    if (es && es.readyState === EventSource.CLOSED) {
      es = null;
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, 3000);
    }
  };
}

/** Subscribe outside React. Returns an unsubscribe function. */
export function subscribe(name: string, handler: Handler): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(handler);
  connect();
  attach(name);
  return () => {
    listeners.get(name)?.delete(handler);
  };
}

/** React hook: run `handler(data)` for every server event called `name`. */
export function useStream(name: string, handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(name, (d) => ref.current(d)), [name]);
}
