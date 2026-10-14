// Types, priority styling and live-event hooks shared by the SOS page and console.
import { useEffect, useRef, type ReactNode } from "react";
import { subscribe } from "@/lib/sse";

export type Priority = "critical" | "high" | "medium" | "low";
export type Channel = "voice" | "whatsapp" | "sms" | "social";

export type Team = {
  id: string;
  type: "boat" | "medical" | "food";
  name: string;
  at: [number, number];
  busyWith: string | null;
};

export type Incident = {
  id: string;
  createdAt: number;
  updatedAt: number;
  channel: Channel;
  status: "new" | "assigned" | "resolved";
  name: string;
  area: string;
  landmark: string;
  lat: number;
  lng: number;
  people: number;
  water: string;
  elderly: number;
  children: number;
  pregnant: number;
  disabled: number;
  sick: number;
  medical: string[];
  needs: string[];
  /** `text` is in the language the call happened in; seeded lines also carry a Telugu copy in `te`. */
  transcript: { who: "caller" | "agent"; text: string; te?: string; en?: string }[];
  team: null | { id: string; name: string; type: Team["type"]; km: number; eta: number; at: number };
  priority: Priority;
  score: number;
  reasons: string[];
  summary: string;
  demo?: boolean;
};

export type AreaForecast = {
  area: string;
  requests: number;
  people: number;
  vulnerable: number;
  critical: number;
  rescue: number;
  recent: number;
  food_packets: number;
  water_litres: number;
  boats: number;
  medical_kits: number;
  hotspot: boolean;
};

export type Forecast = {
  areas: AreaForecast[];
  totals: { requests: number; people: number; vulnerable: number; food_packets: number; water_litres: number; boats: number };
  generatedAt: number;
};

export type Triage = { priority: Priority; score: number; reasons: string[] };

/** Fetch from this module's API. POST when a body is given. */
export async function sosApi<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit | undefined =
    body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(`/api/sos${path}`, init);
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

/** Live control-room updates over the shared SSE stream. */
export function useSosStream(handlers: {
  incident?: (i: Incident) => void;
  teams?: (t: Team[]) => void;
  reset?: () => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    // One shared EventSource for the whole app (see @/lib/sse).
    const offs = [
      subscribe("sos:incident", (d) => ref.current.incident?.(d as Incident)),
      subscribe("sos:teams", (d) => ref.current.teams?.(d as Team[])),
      subscribe("sos:reset", () => ref.current.reset?.()),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}

export const PRIORITY: Record<Priority, { label: string; te: string; color: string; soft: string; ring: string }> = {
  critical: { label: "Critical", te: "అత్యవసరం", color: "#dc2626", soft: "bg-red-50 text-red-700", ring: "ring-red-200" },
  high: { label: "High", te: "ఎక్కువ", color: "#ea580c", soft: "bg-orange-50 text-orange-700", ring: "ring-orange-200" },
  medium: { label: "Medium", te: "మధ్యస్థం", color: "#ca8a04", soft: "bg-yellow-50 text-yellow-800", ring: "ring-yellow-200" },
  low: { label: "Low", te: "సాధారణం", color: "#16a34a", soft: "bg-green-50 text-green-700", ring: "ring-green-200" },
};

export const WATER: Record<string, string> = {
  none: "No water",
  ankle: "Ankle",
  knee: "Knee",
  waist: "Waist",
  chest: "Chest",
  first_floor: "First floor",
  roof: "Roof",
  unknown: "Not told",
};

export const CHANNEL: Record<Channel, string> = { voice: "Voice call", whatsapp: "WhatsApp", sms: "SMS", social: "Social media" };

export const TEAM_ICON: Record<Team["type"], string> = { boat: "🚤", medical: "🚑", food: "🚚" };

export function PrioBadge({ p, size = "sm" }: { p: Priority; size?: "sm" | "md" }) {
  const c = PRIORITY[p];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide ring-1 ${c.soft} ${c.ring} ${
        size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

export function Panel({ title, sub, right, children, className = "" }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function timeAgo(ts: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export const vulnOf = (i: Partial<Incident>) => (i.elderly || 0) + (i.children || 0) + (i.pregnant || 0) + (i.disabled || 0) + (i.sick || 0);

export function vulnText(f: Partial<Incident> & { no_vulnerable?: boolean }) {
  const v = (
    [
      ["elderly", "elderly"],
      ["children", "children"],
      ["pregnant", "pregnant"],
      ["disabled", "disabled"],
      ["sick", "sick"],
    ] as const
  )
    .filter(([k]) => (f[k] || 0) > 0)
    .map(([k, n]) => `${f[k]} ${n}`)
    .join(", ");
  return v || (f.no_vulnerable ? "None" : "");
}

/** Short two-tone alert for new critical cases (silently skipped if audio is blocked). */
export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tone = (freq: number, start: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + 0.2);
    };
    tone(880, 0);
    tone(660, 0.22);
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio unavailable */
  }
}
