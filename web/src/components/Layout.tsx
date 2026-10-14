// App shell: floating navbar, skip link, mobile tab bar, footer and the routed <main> outlet.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, ChevronDown, Download, HeartPulse, Home, LayoutDashboard, Menu, Phone, ShieldAlert, Siren, Smartphone, Sprout, X, type LucideIcon } from "lucide-react";
import { cn, type Accent } from "@/lib/utils";
import { LANGS, LIVE_VOICE_LANGS, useLang } from "@/lib/i18n";
import { useInstallPrompt } from "@/lib/install";
import { Logo, LogoMark } from "@/components/Logo";
import { Preloader } from "@/components/Preloader";
import { AppNudge } from "@/components/AppNudge";
import { inApp } from "@/lib/platform";

type NavItem = { to: string; te: string; en: string; icon: LucideIcon; accent: Accent; end?: boolean };

const NAV: NavItem[] = [
  { to: "/sos", te: "వరద SOS", en: "SOS", icon: Siren, accent: "sos" },
  { to: "/arogya", te: "ఆరోగ్యం", en: "Arogya", icon: HeartPulse, accent: "arogya" },
  { to: "/rythu", te: "రైతు", en: "Rythu", icon: Sprout, accent: "rythu" },
  { to: "/scam", te: "స్కామ్ షీల్డ్", en: "Scam Shield", icon: ShieldAlert, accent: "scam" },
  { to: "/console", te: "కన్సోల్", en: "Console", icon: LayoutDashboard, accent: "primary" },
];

const pillBg: Record<Accent, string> = {
  primary: "bg-primary-50",
  sos: "bg-sos-50",
  arogya: "bg-arogya-50",
  rythu: "bg-rythu-50",
  scam: "bg-scam-50",
};
const activeIcon: Record<Accent, string> = {
  primary: "text-primary",
  sos: "text-sos",
  arogya: "text-arogya",
  rythu: "text-rythu-700",
  scam: "text-scam",
};

const EMERGENCY = [
  { n: "112", te: "అత్యవసరం", en: "Emergency" },
  { n: "108", te: "అంబులెన్స్", en: "Ambulance" },
  { n: "1930", te: "సైబర్ మోసం", en: "Cyber fraud" },
  { n: "181", te: "మహిళా హెల్ప్‌లైన్", en: "Women helpline" },
];

/** AI voice language selector: Telugu is live, the rest are on the roadmap. */
function VoicePicker({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="AI voice language"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white/90 px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-slate-300 active:scale-95"
      >
        <AudioLines aria-hidden="true" className="h-4 w-4 text-primary" />
        {compact ? "Telugu" : "Voice: Telugu"}
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="AI voice language"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lift"
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">AI voice language</div>
            <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
              {LANGS.map((l) => {
                const live = LIVE_VOICE_LANGS.includes(l.code);
                return (
                  <div
                    key={l.code}
                    role="option"
                    aria-selected={live}
                    aria-disabled={!live}
                    onClick={() => live && setOpen(false)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm",
                      live ? "cursor-pointer bg-primary-50 font-semibold text-ink" : "cursor-not-allowed text-slate-400",
                    )}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate">{l.english}</span>
                      {l.code !== "en" && <span className="te truncate text-xs">{l.native}</span>}
                    </span>
                    {live ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">Live</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Coming soon</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LiveCallPill({ className }: { className?: string }) {
  const { t } = useLang();
  return (
    <NavLink
      to="/console/phone"
      className={({ isActive }) =>
        cn(
          "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-white shadow-sm transition active:scale-95",
          isActive ? "bg-primary-700" : "bg-primary hover:bg-primary-700",
          className,
        )
      }
      title="Get a real AI phone call"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      <Phone aria-hidden="true" className="h-3.5 w-3.5" />
      {t("కాల్ పొందండి", "Get a call")}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const { canInstall, install } = useInstallPrompt();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenu(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Preloader />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-ink focus:shadow-lift"
      >
        Skip to main content
      </a>
      <AppNudge />

      {/* Floating glass navbar */}
      <header className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3">
        <motion.div
          className={cn(
            "pointer-events-auto mx-auto flex max-w-6xl items-center gap-2 rounded-full border border-slate-200/70 bg-white/95 pl-3 pr-2 shadow-lift transition-[background-color,height,box-shadow] duration-300 md:backdrop-blur-xl",
            scrolled ? "h-14 md:bg-white/85" : "h-16 md:bg-white/70",
          )}
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <Link to="/" className="shrink-0" aria-label="Sahaya AI home">
            <span className="hidden sm:block">
              <Logo compact />
            </span>
            <span className="flex items-center gap-2 sm:hidden">
              <LogoMark />
              <span className="text-[15px] font-extrabold tracking-tight">Sahaya AI</span>
            </span>
          </Link>

          <nav className="mx-auto hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="relative inline-flex h-9 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-active" className={cn("absolute inset-0 rounded-full", pillBg[n.accent])} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    <span className={cn("relative z-10 inline-flex items-center gap-1.5", isActive ? activeIcon[n.accent] : "text-slate-600 hover:text-ink")}>
                      <n.icon aria-hidden="true" className={cn("h-4 w-4", isActive ? activeIcon[n.accent] : "text-slate-400")} />
                      <span className="te">{t(n.te, n.en)}</span>
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <LiveCallPill className="hidden md:inline-flex" />
            {!inApp && (
              <Link
                to="/#app"
                title="Get the Sahaya Android app"
                className="hidden h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-95 md:inline-flex"
              >
                <Smartphone aria-hidden="true" className="h-4 w-4 text-green-600" />
                App
              </Link>
            )}
            <VoicePicker compact />
            {canInstall && (
              <button
                type="button"
                onClick={() => void install()}
                title={t("ఇన్‌స్టాల్", "Install app")}
                aria-label={t("ఇన్‌స్టాల్", "Install app")}
                className="hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 active:scale-95 xl:grid"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95 lg:hidden"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
            >
              {menu ? <X aria-hidden="true" className="h-4 w-4" /> : <Menu aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>

        {/* Mobile sheet menu */}
        <AnimatePresence>
          {menu && (
            <motion.div
              className="pointer-events-auto mx-auto mt-2 max-w-5xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-2 shadow-lift lg:hidden"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="grid grid-cols-2 gap-1.5">
                {NAV.map((n, i) => (
                  <motion.div key={n.to} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
                    <NavLink
                      to={n.to}
                      className={({ isActive }) =>
                        cn("flex items-center gap-2.5 rounded-2xl px-3 py-3 text-sm font-semibold", isActive ? cn(pillBg[n.accent], activeIcon[n.accent]) : "text-slate-700 hover:bg-slate-50")
                      }
                    >
                      <n.icon aria-hidden="true" className="h-5 w-5" />
                      <span className="te">{t(n.te, n.en)}</span>
                    </NavLink>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <LiveCallPill className="h-full w-full justify-center rounded-2xl py-3" />
                </motion.div>
                {!inApp && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="col-span-2">
                    <a
                      href="/download/Sahaya-AI.apk"
                      download
                      className="flex items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-sm font-semibold text-white transition active:scale-[.98]"
                    >
                      <Smartphone aria-hidden="true" className="h-4 w-4" />
                      Download Android app
                      <span className="font-medium text-white/60">· 15 MB</span>
                    </a>
                  </motion.div>
                )}
              </div>
              {canInstall && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-white"
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  {t("ఫోన్‌లో యాప్‌గా ఇన్‌స్టాల్ చేయండి", "Install as an app on your phone")}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 pb-24 pt-20 outline-none lg:pb-12">
        <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}>
          {children}
        </motion.div>
      </main>

      <footer className="border-t border-slate-200 bg-white pb-24 lg:pb-0">
        <div className="container-wide py-14">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-10 md:flex-row md:items-end md:justify-between">
            <div className="max-w-md">
              <Logo />
              <p className="mt-4 text-[15px] font-medium leading-relaxed text-ink">Call Sahaya. Get real help, fast.</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                An AI helpline that speaks Telugu: disaster rescue, health check-ins, farm advice and fraud protection. Hackathon prototype; dashboards show
                simulated demo data.
              </p>
            </div>
            <p className="text-xs text-slate-400 md:text-right">Built on our production Telugu calling engine · Sarvam AI · Gemini-ready · OpenStreetMap</p>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-10 md:grid-cols-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Product</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  { to: "/#how", label: "How it works" },
                  { to: "/#calling", label: "Real calling agent" },
                  { to: "/console", label: "Officials' console" },
                  { to: "/console/phone", label: "Get a real call" },
                ].map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="focus-ring rounded font-medium text-slate-600 transition hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Lifelines</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                {NAV.slice(0, 4).map((n) => (
                  <li key={n.to}>
                    <Link to={n.to} className="focus-ring inline-flex items-center gap-2 rounded font-medium text-slate-600 transition hover:text-ink">
                      <n.icon aria-hidden="true" className={cn("h-4 w-4", activeIcon[n.accent])} />
                      {n.to === "/sos" ? "Disaster SOS" : n.to === "/arogya" ? "Arogya Call" : n.to === "/rythu" ? "Rythu Call" : "Scam Shield"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">App</div>
              {inApp ? (
                <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-green-700">
                  <Smartphone aria-hidden="true" className="h-4 w-4" />
                  You're using the Sahaya app
                </p>
              ) : (
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li>
                    <a href="/download/Sahaya-AI.apk" download className="focus-ring inline-flex items-center gap-2 rounded font-semibold text-ink transition hover:text-primary">
                      <Smartphone aria-hidden="true" className="h-4 w-4 text-green-600" />
                      Android app · 15 MB
                    </a>
                  </li>
                  <li>
                    <Link to="/#app" className="focus-ring rounded font-medium text-slate-600 transition hover:text-ink">
                      Scan QR to install
                    </Link>
                  </li>
                  {canInstall && (
                    <li>
                      <button type="button" onClick={() => void install()} className="focus-ring rounded font-medium text-slate-600 transition hover:text-ink">
                        Install web app
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">{t("అత్యవసర నంబర్లు", "Emergency numbers")}</div>
              <ul className="mt-4 space-y-2 text-sm">
                {EMERGENCY.map((e) => (
                  <li key={e.n}>
                    <a href={`tel:${e.n}`} className="focus-ring group inline-flex items-baseline gap-2 rounded">
                      <span className="w-11 font-extrabold tabular-nums text-ink group-hover:text-primary">{e.n}</span>
                      <span className="te text-slate-500">{t(e.te, e.en)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:justify-between">
            <span>© 2026 Sahaya AI · In a real emergency, call 112.</span>
            <span>Made in Andhra Pradesh & Telangana</span>
          </div>
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden" aria-label="Bottom">
        <div className="grid grid-cols-5">
          {[{ to: "/", te: "హోమ్", en: "Home", icon: Home, accent: "primary" as Accent, end: true }, ...NAV.slice(0, 4)].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors", isActive ? activeIcon[n.accent] : "text-slate-500")}
            >
              <n.icon aria-hidden="true" className="h-5 w-5" />
              <span className="te max-w-full truncate px-1">{t(n.te, n.en)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
