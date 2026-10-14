import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "just now", "5 min ago", "2 h ago" — for feeds and queues. */
export function timeAgo(ts: number | string | Date): string {
  const t = typeof ts === "number" ? ts : new Date(ts).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Stagger helper: style={delay(120)} → animationDelay 120ms (pair with animate-fade-up etc). */
export function delay(ms: number): { animationDelay: string } {
  return { animationDelay: `${ms}ms` };
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export type Accent = "primary" | "sos" | "arogya" | "rythu" | "scam";

/** Static class maps so Tailwind can see every class at build time. */
export const accentClasses: Record<Accent, { bg: string; bgSoft: string; text: string; border: string; ring: string; hover: string }> = {
  primary: { bg: "bg-primary", bgSoft: "bg-primary-50", text: "text-primary", border: "border-primary-200", ring: "ring-primary-200", hover: "hover:bg-primary-700" },
  sos: { bg: "bg-sos", bgSoft: "bg-sos-50", text: "text-sos", border: "border-sos-200", ring: "ring-sos-200", hover: "hover:bg-sos-700" },
  arogya: { bg: "bg-arogya", bgSoft: "bg-arogya-50", text: "text-arogya", border: "border-arogya-200", ring: "ring-arogya-200", hover: "hover:bg-arogya-700" },
  rythu: { bg: "bg-rythu", bgSoft: "bg-rythu-50", text: "text-rythu-700", border: "border-rythu-200", ring: "ring-rythu-200", hover: "hover:bg-rythu-700" },
  scam: { bg: "bg-scam", bgSoft: "bg-scam-50", text: "text-scam", border: "border-scam-200", ring: "ring-scam-200", hover: "hover:bg-scam-700" },
};
