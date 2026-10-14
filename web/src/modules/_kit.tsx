/**
 * Premium page header + stat tile shared by the module pages.
 *
 * Same props as the PageHeader / Stat in @/components/ui, so a module switches
 * by changing its import. `variant="bold"` gives citizen pages the solid
 * gradient hero that /sos and /scam use; consoles keep the light accent wash.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mic, Phone } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Accent = "primary" | "sos" | "arogya" | "rythu" | "scam";

const ACCENT: Record<Accent, { hex: string; dark: string; glow: string; wash: string; ring: string; eyebrow: string }> = {
  primary: { hex: "#1d4ed8", dark: "#1e3a8a", glow: "rgba(29,78,216,0.45)", wash: "from-blue-50", ring: "ring-blue-100", eyebrow: "text-blue-700" },
  sos: { hex: "#e11d48", dark: "#9f1239", glow: "rgba(225,29,72,0.45)", wash: "from-rose-50", ring: "ring-rose-100", eyebrow: "text-rose-600" },
  arogya: { hex: "#0d9488", dark: "#115e59", glow: "rgba(13,148,136,0.45)", wash: "from-teal-50", ring: "ring-teal-100", eyebrow: "text-teal-700" },
  rythu: { hex: "#65a30d", dark: "#3f6212", glow: "rgba(101,163,13,0.45)", wash: "from-lime-50", ring: "ring-lime-100", eyebrow: "text-lime-700" },
  scam: { hex: "#7c3aed", dark: "#4c1d95", glow: "rgba(124,58,237,0.45)", wash: "from-violet-50", ring: "ring-violet-100", eyebrow: "text-violet-700" },
};

export function PageHeader({
  te,
  en,
  description,
  accent = "primary",
  icon,
  actions,
  eyebrow,
  className,
  variant = "wash",
}: {
  te: string;
  en: string;
  description?: ReactNode;
  accent?: Accent;
  icon?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
  variant?: "wash" | "bold";
}) {
  const a = ACCENT[accent] ?? ACCENT.primary;
  const { lang, tr } = useLang();
  const title = lang === "en" ? en : lang === "te" ? te : tr(en);
  const desc = typeof description === "string" && lang !== "en" && lang !== "te" ? tr(description) : description;
  const bold = variant === "bold";
  const shell: CSSProperties = bold
    ? { backgroundImage: `linear-gradient(135deg, ${a.hex} 0%, ${a.dark} 100%)`, boxShadow: `0 18px 40px -22px ${a.glow}` }
    : { boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 14px 34px -20px ${a.glow}` };

  return (
    <div
      className={cn(
        "relative mb-6 mt-2 animate-fade-up overflow-hidden rounded-3xl p-5 sm:p-7",
        bold ? "text-white" : cn("bg-gradient-to-br via-white to-white ring-1", a.wash, a.ring),
        className,
      )}
      style={shell}
    >
      {/* Soft decorative orbs: static, so they cost nothing while scrolling. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full"
        style={{ background: bold ? "rgba(255,255,255,0.10)" : `${a.hex}12` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 right-24 h-56 w-56 rounded-full"
        style={{ background: bold ? "rgba(255,255,255,0.06)" : `${a.hex}0a` }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <div
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14 [&_svg]:h-6 [&_svg]:w-6 sm:[&_svg]:h-7 sm:[&_svg]:w-7",
                bold ? "bg-white/15 text-white ring-1 ring-white/25" : "text-white",
              )}
              style={bold ? undefined : { background: a.hex, boxShadow: `0 10px 22px -10px ${a.glow}` }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className={cn("mb-1 text-[11px] font-bold uppercase tracking-wider", bold ? "text-white/80" : a.eyebrow)}>{eyebrow}</div>
            )}
            <h1 className={cn("te text-[26px] font-extrabold leading-tight tracking-tight sm:text-4xl", bold ? "text-white" : "text-slate-900")}>{title}</h1>
            {title !== en && <div className={cn("mt-0.5 text-base font-semibold", bold ? "text-white/80" : "text-slate-500")}>{en}</div>}
            {desc && (
              <div className={cn("mt-2 max-w-2xl text-sm leading-relaxed sm:text-[15px]", bold ? "text-white/85" : "text-slate-600")}>{desc}</div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 [&>*]:min-h-[44px]">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * The same "how to call" strip on every module: talk in the browser now, or get
 * a real call on your phone. `onTalk` is for pages where the voice call sits
 * behind a tab; without it the strip just introduces the call panel below.
 */
export function CallIntro({ accent, flow, onTalk, className }: { accent: Accent; flow: string; onTalk?: () => void; className?: string }) {
  const a = ACCENT[accent] ?? ACCENT.primary;
  const { t } = useLang();
  return (
    <div
      className={cn(
        "mb-4 flex animate-fade-up flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:flex-row sm:items-center sm:justify-between sm:p-5",
        className,
      )}
      style={{ boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -20px ${a.glow}` }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: a.hex, boxShadow: `0 10px 22px -10px ${a.glow}` }}>
          <Mic aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <div className="text-lg font-extrabold tracking-tight text-ink sm:text-xl">{t("ఇప్పుడే సహాయతో మాట్లాడండి", "Talk to Sahaya now")}</div>
          <div className="text-sm text-slate-600">{t("నొక్కండి, మైక్ అనుమతించండి, తెలుగులో మాట్లాడండి.", "Tap, allow microphone, speak in Telugu.")}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onTalk && (
          <button
            type="button"
            onClick={onTalk}
            className="press inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:flex-none"
            style={{ background: a.hex }}
          >
            <Mic aria-hidden="true" className="h-4 w-4" /> {t("ఇప్పుడే మాట్లాడండి", "Talk now")}
          </button>
        )}
        <Link
          to={`/console/phone?flow=${flow}`}
          className="press inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 sm:flex-none"
        >
          <Phone aria-hidden="true" className="h-4 w-4" /> {t("మీ ఫోన్‌కి కాల్ పొందండి", "Get a call on your phone")}
        </Link>
      </div>
    </div>
  );
}

const TONE: Record<string, { fg: string; chipBg: string; chipFg: string }> = {
  neutral: { fg: "#0f172a", chipBg: "#f1f5f9", chipFg: "#475569" },
  critical: { fg: "#dc2626", chipBg: "#dc262614", chipFg: "#dc2626" },
  high: { fg: "#ea580c", chipBg: "#ea580c14", chipFg: "#ea580c" },
  medium: { fg: "#ca8a04", chipBg: "#ca8a0414", chipFg: "#ca8a04" },
  low: { fg: "#16a34a", chipBg: "#16a34a14", chipFg: "#16a34a" },
  primary: { fg: "#1d4ed8", chipBg: "#1d4ed814", chipFg: "#1d4ed8" },
  sos: { fg: "#e11d48", chipBg: "#e11d4814", chipFg: "#e11d48" },
  arogya: { fg: "#0d9488", chipBg: "#0d948814", chipFg: "#0d9488" },
  rythu: { fg: "#4d7c0f", chipBg: "#65a30d18", chipFg: "#4d7c0f" },
  scam: { fg: "#7c3aed", chipBg: "#7c3aed14", chipFg: "#7c3aed" },
};

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "critical" | "high" | "medium" | "low" | Accent;
  className?: string;
}) {
  const c = TONE[tone] ?? TONE.neutral;
  return (
    <div
      className={cn(
        "min-w-0 animate-fade-up rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 transition duration-200 hover:-translate-y-0.5 sm:p-5",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.18)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_30px_-16px_rgba(15,23,42,0.25)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl [&_svg]:h-4 [&_svg]:w-4" style={{ background: c.chipBg, color: c.chipFg }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1 text-3xl font-extrabold leading-none tracking-tight tabular-nums" style={{ color: c.fg }}>
        {value}
      </div>
      {hint && <div className="mt-1.5 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
