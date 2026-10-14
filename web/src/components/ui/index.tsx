// Shared UI primitives (Button, Input, Card, Badge…) used across every page.
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, accentClasses, prefersReducedMotion, type Accent } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export { delay } from "@/lib/utils";

export type { Accent };

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Colour for the primary variant: primary | sos | arogya | rythu | scam. */
  accent?: Accent;
  loading?: boolean;
  icon?: ReactNode;
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

/** Button look as a class string, for links styled as buttons. */
export function buttonClasses({ variant = "primary", size = "md", accent = "primary", className }: { variant?: ButtonVariant; size?: ButtonSize; accent?: Accent; className?: string } = {}) {
  const a = accentClasses[accent];
  const variantClass: Record<ButtonVariant, string> = {
    primary: cn(a.bg, a.hover, "text-white shadow-sm"),
    secondary: "bg-white text-ink border border-slate-200 hover:bg-slate-50 shadow-sm",
    outline: cn("bg-white border", a.border, a.text, "hover:bg-slate-50"),
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
    danger: "bg-critical text-white hover:bg-red-700 shadow-sm",
    success: "bg-low text-white hover:bg-green-700 shadow-sm",
  };
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    sizeClass[size],
    variantClass[variant],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", accent = "primary", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClasses({ variant, size, accent, className })} {...rest}>
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/** A react-router link that looks like a Button. */
export function ButtonLink({
  to,
  variant,
  size,
  accent,
  icon,
  className,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  accent?: Accent;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClasses({ variant, size, accent, className })}>
      {icon}
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------- Card */

/** White rounded card. `lift` adds a hover lift + deeper shadow. */
export function Card({ className, lift, ...rest }: HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-soft transition-shadow duration-200 hover:shadow-lift",
        lift && "transition duration-200 hover:-translate-y-0.5",
        className,
      )}
      {...rest}
    />
  );
}

/* ---------------------------------------------------------------- Motion */

/** Fades + slides its children up the first time they scroll into view. */
export function Reveal({
  children,
  delay: ms = 0,
  className,
  style,
}: {
  children?: ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-out", shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0", className)}
      style={{ transitionDelay: `${ms}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/** Animates 0 → target (ease-out) once `start` is true. Jumps straight there with reduced motion. */
export function useCountUp(target: number, { duration = 1200, start = true }: { duration?: number; start?: boolean } = {}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

/** A number that counts up when it scrolls into view. */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1200, className }: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [start, setStart] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStart(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setStart(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const v = useCountUp(value, { duration, start });
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Shimmering loading placeholder. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function CardHeader({ title, subtitle, action, icon, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 shrink-0 text-slate-500">{icon}</div>}
        <div className="min-w-0">
          <div className="font-semibold text-ink">{title}</div>
          {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "sos" | "arogya" | "rythu" | "scam" | "critical" | "high" | "medium" | "low";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info: "bg-primary-50 text-primary-700 border-primary-200",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  sos: "bg-sos-50 text-sos-700 border-sos-200",
  arogya: "bg-arogya-50 text-arogya-700 border-arogya-200",
  rythu: "bg-rythu-50 text-rythu-700 border-rythu-200",
  scam: "bg-scam-50 text-scam-700 border-scam-200",
  critical: "bg-red-50 text-critical border-red-200",
  high: "bg-orange-50 text-high border-orange-200",
  medium: "bg-yellow-50 text-medium border-yellow-200",
  low: "bg-green-50 text-low border-green-200",
};

export function Badge({ tone = "neutral", className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", toneClass[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export type Priority = "critical" | "high" | "medium" | "low";

const priorityLabel: Record<Priority, [string, string]> = {
  critical: ["అత్యవసరం", "Critical"],
  high: ["ఎక్కువ", "High"],
  medium: ["మధ్యస్థం", "Medium"],
  low: ["తక్కువ", "Low"],
};

/** Priority / risk pill. English label; adds the Telugu word in Telugu mode, or the translation in other languages. */
export function PriorityBadge({ p, bilingual = true, className }: { p: Priority | string; bilingual?: boolean; className?: string }) {
  const { lang, tr } = useLang();
  const key = (["critical", "high", "medium", "low"].includes(String(p)) ? p : "low") as Priority;
  const [te, en] = priorityLabel[key];
  const local = lang === "te" ? te : lang === "en" ? "" : tr(en);
  return (
    <Badge tone={key} className={cn("uppercase tracking-wide", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", { critical: "bg-critical", high: "bg-high", medium: "bg-medium", low: "bg-low" }[key])} />
      {en}
      {bilingual && local && local !== en && <span className="te font-medium normal-case tracking-normal opacity-80">· {local}</span>}
    </Badge>
  );
}

/* -------------------------------------------------------------------- Tabs */

export type TabItem = { id: string; label: ReactNode; icon?: ReactNode; content?: ReactNode };

export function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  accent = "primary",
  className,
  listClassName,
}: {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  accent?: Accent;
  className?: string;
  listClassName?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id);
  const active = value ?? inner;
  const current = tabs.find((t) => t.id === active);
  const a = accentClasses[accent];
  return (
    <div className={className}>
      <div role="tablist" className={cn("scrollbar-thin flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1", listClassName)}>
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => {
                setInner(t.id);
                onChange?.(t.id);
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                on ? cn("bg-white shadow-sm", a.text) : "text-slate-600 hover:text-ink",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
      {current?.content !== undefined && <div className="pt-4">{current.content}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Forms */

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-ink placeholder:text-slate-400 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:bg-slate-50 disabled:text-slate-400";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldClass, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, "min-h-[96px] py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(fieldClass, "h-11 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

/* -------------------------------------------------------------------- Stat */

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
  const valueTone: Record<string, string> = {
    neutral: "text-ink",
    critical: "text-critical",
    high: "text-high",
    medium: "text-medium",
    low: "text-low",
    primary: "text-primary",
    sos: "text-sos",
    arogya: "text-arogya",
    rythu: "text-rythu-700",
    scam: "text-scam",
  };
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="truncate">{label}</span>
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      </div>
      <div className={cn("mt-1.5 text-2xl font-extrabold tabular-nums", valueTone[tone] ?? "text-ink")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- PageHeader */

export function PageHeader({
  te,
  en,
  description,
  accent = "primary",
  icon,
  actions,
  eyebrow,
  className,
}: {
  /** Telugu title (primary). */
  te: string;
  /** English title (subtitle). */
  en: string;
  description?: ReactNode;
  accent?: Accent;
  icon?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  const a = accentClasses[accent];
  const { lang, tr } = useLang();
  const title = lang === "en" ? en : lang === "te" ? te : tr(en);
  const desc = typeof description === "string" && lang !== "en" && lang !== "te" ? tr(description) : description;
  return (
    <div className={cn("flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm", a.bg)}>{icon}</div>}
        <div className="min-w-0">
          {eyebrow && <div className={cn("mb-1 text-xs font-bold uppercase tracking-wider", a.text)}>{eyebrow}</div>}
          <h1 className="te text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{title}</h1>
          {title !== en && <div className="mt-0.5 text-base font-semibold text-slate-500">{en}</div>}
          {desc && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{desc}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ Small helpers */

/**
 * Language-aware pair. en → English only; te → Telugu with small English under it;
 * any other language → the English auto-translated, with small English under it (`sub={false}` hides it).
 */
export function Bi({ te, en, className, enClassName, sub = true }: { te: ReactNode; en: ReactNode; className?: string; enClassName?: string; sub?: boolean }) {
  const { lang, tr } = useLang();
  if (lang === "en") return <span className={cn("block", className)}>{en}</span>;
  const primary = lang === "te" ? te : typeof en === "string" ? tr(en) : en;
  return (
    <span className={cn("block", className)}>
      <span className="te block">{primary}</span>
      {sub && primary !== en && <span className={cn("block text-[0.85em] font-normal text-slate-500", enClassName)}>{en}</span>}
    </span>
  );
}

/** Translate an English string for the current language (inline). */
export function T({ children }: { children: string }) {
  const { tr } = useLang();
  return <>{tr(children)}</>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cn("h-5 w-5 animate-spin text-slate-400", className)} />;
}

export function EmptyState({ icon, title, hint, className }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon && <div className="text-slate-300">{icon}</div>}
      <div className="font-semibold text-slate-600">{title}</div>
      {hint && <div className="max-w-sm text-sm text-slate-500">{hint}</div>}
    </div>
  );
}

export function DemoNote({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {children ?? "Demo data"}
    </div>
  );
}
