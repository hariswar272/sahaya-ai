import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Gavel,
  Globe,
  HeartPulse,
  Languages,
  LayoutDashboard,
  Map as MapIcon,
  Mic,
  PhoneCall,
  Play,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  Sprout,
  Terminal,
  Workflow,
} from "lucide-react";
import { ButtonLink, Reveal } from "@/components/ui";
import { CallDemo } from "@/components/CallDemo";
import { AppPromo } from "@/components/AppPromo";
import { AndroidIcon } from "@/components/AndroidIcon";
import { accentClasses, cn, type Accent } from "@/lib/utils";
import { useBootReady } from "@/lib/boot";
import { APK_URL, inApp, isAndroid } from "@/lib/platform";

type Lifeline = { to: string; console: string; icon: LucideIcon; accent: Accent; en: string; chip: string; dEn: string; ctaEn: string; consoleEn: string };

const LIFELINES: Lifeline[] = [
  {
    to: "/sos",
    console: "/console/sos",
    icon: Siren,
    accent: "sos",
    en: "Disaster SOS",
    chip: "Flood? Rescue on the way",
    dEn: "Stuck in a flood? Say it in Telugu. Sahaya triages the call and sends the nearest rescue team.",
    ctaEn: "Send SOS",
    consoleEn: "Control room",
  },
  {
    to: "/arogya",
    console: "/console/arogya",
    icon: HeartPulse,
    accent: "arogya",
    en: "Arogya Call",
    chip: "Pregnant? Health check-ins",
    dEn: "Follow-up calls for pregnant women, BP/diabetes and TB patients. Danger signs alert the ASHA worker at once.",
    ctaEn: "Try a demo call",
    consoleEn: "ASHA dashboard",
  },
  {
    to: "/rythu",
    console: "/console/rythu",
    icon: Sprout,
    accent: "rythu",
    en: "Rythu Call",
    chip: "Farmer? Best price today",
    dEn: "Weather, mandi prices and crop advice. Farmers ask in Telugu and hear the answer.",
    ctaEn: "Ask a question",
    consoleEn: "Alerts console",
  },
  {
    to: "/scam",
    console: "/console/scam",
    icon: ShieldAlert,
    accent: "scam",
    en: "Scam Shield",
    chip: "Scam call? Know instantly",
    dEn: "A suspicious message or call? Sahaya checks it, warns you in Telugu and helps you report it to 1930.",
    ctaEn: "Check now",
    consoleEn: "Scam trends",
  },
];

const STEPS = [
  { icon: Mic, en: "Tell Sahaya your problem", dEn: "Tap Talk to Sahaya, or call, and speak in Telugu. A Telugu–English mix is fine." },
  { icon: Sparkles, en: "Sahaya understands", dEn: "It asks only what's missing and picks out the facts. Clear rules then set the priority." },
  { icon: CheckCircle2, en: "Help is on the way", dEn: "A rescue team, an ASHA worker, farm advice or the 1930 cyber helpline, in seconds." },
];

const PIPELINE = [
  { icon: AudioLines, title: "Voice · Text", sub: "Telugu today, more coming" },
  { icon: Languages, title: "Sarvam AI", sub: "Indian-language speech ↔ text" },
  { icon: Brain, title: "Google Gemini", sub: "Understanding + extraction" },
  { icon: Gavel, title: "Rules engine", sub: "Explainable priority" },
  { icon: LayoutDashboard, title: "4 lifelines", sub: "Live officials' consoles" },
];

const WHY = [
  { icon: Mic, en: "No reading needed", dEn: "If you can speak, you can use it. No menus, no forms." },
  { icon: Languages, en: "Telugu first", dEn: "Natural Telugu, including Telugu–English mix. Hindi, Tamil and 8 more Indian languages are next." },
  { icon: PhoneCall, en: "Any basic phone", dEn: "The same agent works over a normal phone call. No app or internet needed." },
  { icon: ShieldCheck, en: "Explainable", dEn: "AI extracts the facts; transparent rules decide. Every priority shows its reason." },
];

const POWERED = [
  { icon: AudioLines, t: "Sarvam AI" },
  { icon: Sparkles, t: "Google Gemini-ready" },
  { icon: MapIcon, t: "OpenStreetMap" },
  { icon: Terminal, t: "Built with Claude Code" },
];

const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * Entrance-only blur reveal, started once the preloader has gone (`ready`).
 * The filter is set to `none` when it finishes so nothing stays on a GPU blur layer.
 */
function blurIn(i: number, reduce: boolean | null, ready: boolean, px = 10) {
  if (reduce) return {};
  const hidden = { opacity: 0, filter: `blur(${px}px)`, y: 12 };
  return {
    initial: hidden,
    animate: ready ? { opacity: 1, filter: "blur(0px)", y: 0, transitionEnd: { filter: "none" } } : hidden,
    transition: { duration: 0.6, delay: 0.05 + i * 0.06, ease: EASE },
  };
}

/** Section header: eyebrow + h2 + sub, blur-fades in once. */
function Heading({ eyebrow, title, sub, center, className }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; center?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("max-w-2xl", center && "mx-auto text-center", className)}
      initial={reduce ? false : { opacity: 0, filter: "blur(6px)", y: 10 }}
      whileInView={{ opacity: 1, filter: "blur(0px)", y: 0, transitionEnd: { filter: "none" } }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <div className={cn("inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.14em] text-primary", center && "justify-center")}>{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">{sub}</p>}
    </motion.div>
  );
}

/** Little animated voice bars. */
function Bars({ className, tone = "bg-white" }: { className?: string; tone?: string }) {
  return (
    <span className={cn("inline-flex h-4 items-center gap-[2px]", className)} aria-hidden>
      {[55, 90, 70, 100, 60].map((h, i) => (
        <span key={i} className={cn("w-[3px] animate-wave rounded-full", tone)} style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

/** A premium iPhone-style device (titanium frame, black bezel, Dynamic Island) around a real app screenshot. */
function Device({ src, alt, front }: { src: string; alt: string; front?: boolean }) {
  const key = "absolute w-[3px] bg-gradient-to-b from-[#d9dde4] via-[#9aa3b1] to-[#6b7482]";
  return (
    <div
      className={cn(
        // Brushed-titanium outer frame
        "relative rounded-[3.15rem] bg-gradient-to-br from-[#eef0f4] via-[#a7afbc] to-[#5d6675] p-[3px]",
        front ? "shadow-[0_50px_100px_-30px_rgba(15,23,42,.6),0_20px_40px_-20px_rgba(29,78,216,.35)]" : "shadow-[0_34px_70px_-28px_rgba(15,23,42,.5)]",
      )}
    >
      {/* Side keys: action + volume (left), power (right) */}
      <span aria-hidden className={cn(key, "-left-[2px] top-[17%] h-[5%] rounded-l-[3px]")} />
      <span aria-hidden className={cn(key, "-left-[2px] top-[25%] h-[8.5%] rounded-l-[3px]")} />
      <span aria-hidden className={cn(key, "-left-[2px] top-[35%] h-[8.5%] rounded-l-[3px]")} />
      <span aria-hidden className={cn(key, "-right-[2px] top-[28%] h-[12%] rounded-r-[3px]")} />
      {/* Inner edge highlight + black bezel */}
      <div className="relative rounded-[3rem] bg-black p-[7px] ring-1 ring-white/10">
        <div className="relative overflow-hidden rounded-[2.55rem] bg-white" style={{ aspectRatio: "540 / 1230" }}>
          <img src={src} alt={alt} className="h-full w-full object-cover" loading={front ? "eager" : "lazy"} decoding="async" />
          {/* Dynamic Island */}
          <div aria-hidden className="absolute left-1/2 top-[1.1%] h-[3.4%] w-[31%] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
            <span className="absolute right-[14%] top-1/2 h-[38%] w-auto aspect-square -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#3b4a6b,#0b0f19_70%)]" />
          </div>
          {/* Glass glare */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(118deg,rgba(255,255,255,.24)_0%,rgba(255,255,255,.05)_30%,rgba(255,255,255,0)_44%)]" />
          {!front && <div aria-hidden className="pointer-events-none absolute inset-0 bg-slate-900/[.05]" />}
        </div>
      </div>
    </div>
  );
}

/** The real Android app: a fanned trio of phones with floating status badges. */
function HeroDevice({ mx, my, reduce, ready }: { mx: MotionValue<number>; my: MotionValue<number>; reduce: boolean | null; ready: boolean }) {
  const bx = useTransform(mx, (v) => v * -18);
  const by = useTransform(my, (v) => v * -18);
  const dx = useTransform(mx, (v) => v * 6);
  const dy = useTransform(my, (v) => v * 6);
  const ex = useTransform(mx, (v) => v * 2.5);
  const ey = useTransform(my, (v) => v * 2.5);

  // Staggered blur-up entrance, once; the filter is cleared afterwards.
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 34, filter: "blur(8px)" },
          animate: ready ? { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } } : undefined,
          transition: { delay, duration: 0.8, ease: EASE },
        };

  return (
    <div className="relative mx-auto w-full max-w-[540px] lg:mr-0">
      {/* layered glow behind the group */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[80%] w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(29,78,216,.28),rgba(225,29,72,.14)_45%,transparent_70%)]"
      />
      <div aria-hidden className="absolute bottom-0 left-1/2 h-10 w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,.22),transparent_70%)]" />

      {/* back-left: home */}
      <motion.div style={{ x: ex, y: ey }} className="absolute left-0 top-14 hidden w-[250px] sm:block lg:top-[7%] lg:w-[clamp(180px,calc((100svh-9rem)*0.4),250px)]">
        <motion.div {...enter(0.42)}>
          <div className="-rotate-[8deg] scale-[.86]">
            <div className="animate-float [animation-delay:-2.5s] [animation-duration:8s]">
              <Device src="/app/real-home.png" alt="Sahaya Android app home screen" />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* back-right: SOS */}
      <motion.div style={{ x: ex, y: ey }} className="absolute right-0 top-14 hidden w-[250px] sm:block lg:top-[7%] lg:w-[clamp(180px,calc((100svh-9rem)*0.4),250px)]">
        <motion.div {...enter(0.54)}>
          <div className="rotate-[8deg] scale-[.86]">
            <div className="animate-float [animation-delay:-5s] [animation-duration:8.5s]">
              <Device src="/app/real-sos.png" alt="Sahaya Android app Disaster SOS screen" />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* front: live call */}
      <motion.div style={{ x: dx, y: dy }} className="relative z-10 mx-auto w-[236px] sm:w-[282px] lg:w-[clamp(200px,calc((100svh-9.5rem)*0.44),286px)]">
        <motion.div {...enter(0.28)}>
          <div className="animate-float [animation-duration:7s]">
            <Device src="/app/real-call.png" alt="The Sahaya Android app during a live Telugu AI call" front />
          </div>
        </motion.div>
      </motion.div>

      {/* floating badges (transform-only parallax + float) */}
      <motion.div style={{ x: bx, y: by }} className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute -left-1 -top-3 sm:-left-6">
          <div className="animate-float [animation-delay:-1.5s]">
            <div className="glass-badge flex items-center gap-2.5 rounded-2xl px-3 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white">
                <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
              </span>
              <div className="leading-tight">
                <div className="text-xs font-bold text-ink">Live · AI speaking Telugu</div>
                <Bars tone="bg-green-600" className="mt-1 h-3" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -right-1 top-[46%] sm:-right-4">
          <div className="animate-float [animation-delay:-3.5s]">
            <div className="glass-badge rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-critical px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Critical</span>
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-bold text-ink">Boat team dispatched</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Singh Nagar · 5 people · ETA 9 min</div>
            </div>
          </div>
        </div>

        {!inApp && (
          <div className="absolute -left-1 bottom-6 sm:-left-4">
            <div className="animate-float [animation-delay:-5s]">
              <a
                href="#app"
                className="glass-badge focus-ring pointer-events-auto flex items-center gap-3 rounded-2xl p-2 pr-3.5 transition hover:shadow-xl"
                aria-label="Get the Android app"
              >
                <img src="/app/qr-apk.svg" alt="" className="h-12 w-12 rounded-lg ring-1 ring-slate-200" />
                <span className="leading-tight">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <AndroidIcon className="h-4 w-4 text-[#3ddc84]" />
                    Available on Android
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">Free · 15 MB · scan to install</span>
                </span>
              </a>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();
  const ready = useBootReady();
  const location = useLocation();
  const heroRef = useRef<HTMLElement | null>(null);
  const heroInView = useInView(heroRef, { margin: "0px 0px -10% 0px" });

  // Links like /#app or /#how from other pages: scroll to the section once it exists.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const tm = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 80);
    return () => window.clearTimeout(tm);
  }, [location.hash, location.key, reduce]);

  // Gentle mouse parallax: transform-only, rAF-throttled.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 60, damping: 18 });
  const my = useSpring(rawY, { stiffness: 60, damping: 18 });
  const b1x = useTransform(mx, (v) => v * 40);
  const b1y = useTransform(my, (v) => v * 40);
  const b2x = useTransform(mx, (v) => v * -30);
  const b2y = useTransform(my, (v) => v * -30);
  const frame = useRef(0);

  const onMove = (e: MouseEvent<HTMLElement>) => {
    if (reduce || frame.current) return;
    const { clientX, clientY, currentTarget } = e;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const r = currentTarget.getBoundingClientRect();
      rawX.set((clientX - r.left) / r.width - 0.5);
      rawY.set((clientY - r.top) / r.height - 0.5);
    });
  };

  const paused = heroInView ? "" : "[animation-play-state:paused]";
  const h1 = "Call Sahaya. Get real help, fast.".split(" ");

  return (
    <div>
      {/* Hero */}
      <section ref={heroRef} onMouseMove={onMove} className="relative -mt-20 overflow-hidden bg-gradient-to-b from-white to-page pt-20">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <motion.div aria-hidden style={{ x: b1x, y: b1y }} className="pointer-events-none absolute -right-40 -top-40">
          <div className={cn("h-[34rem] w-[34rem] animate-blob rounded-full bg-[radial-gradient(circle_at_center,rgba(225,29,72,.16),transparent_62%)]", paused)} />
        </motion.div>
        <motion.div aria-hidden style={{ x: b2x, y: b2y }} className="pointer-events-none absolute -bottom-48 -left-40">
          <div className={cn("h-[34rem] w-[34rem] animate-blob rounded-full bg-[radial-gradient(circle_at_center,rgba(29,78,216,.16),transparent_62%)] [animation-delay:-5s]", paused)} />
        </motion.div>

        <div className="container-wide relative grid gap-14 py-14 sm:py-20 lg:min-h-[560px] lg:h-[calc(100svh-5rem)] lg:max-h-[880px] lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-10 lg:py-6">
          <div>
            <motion.div {...blurIn(0, reduce, ready)} className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <AudioLines aria-hidden="true" className="h-4 w-4 text-green-600" />
              AI helpline · speaks Telugu
            </motion.div>

            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.06] tracking-tight text-ink sm:text-6xl lg:mt-[clamp(.75rem,2.4vh,1.5rem)] lg:text-[clamp(2.6rem,7.4vh,4rem)]">
              {h1.map((w, i) => (
                <motion.span key={`${w}-${i}`} {...blurIn(1 + i, reduce, ready)} className={cn("inline-block", i >= 3 && "bg-gradient-to-r from-primary to-sos bg-clip-text text-transparent")}>
                  {w}
                  {i < h1.length - 1 ? " " : ""}
                </motion.span>
              ))}
            </h1>

            <motion.p {...blurIn(h1.length + 1, reduce, ready)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mt-[clamp(.75rem,2.2vh,1.5rem)] lg:text-[clamp(.98rem,2.5vh,1.125rem)]">
              Tell Sahaya your problem in Telugu. It understands, takes action and connects you to the right help in seconds: rescue teams, health workers, farm
              advice or fraud protection.
            </motion.p>

            <div className="mt-6 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 lg:mt-[clamp(.75rem,2.2vh,1.5rem)]">
              {LIFELINES.map((l, i) => {
                const a = accentClasses[l.accent];
                return (
                  <motion.div key={l.to} {...blurIn(h1.length + 2 + i, reduce, ready)}>
                    <Link
                      to={l.to}
                      className="focus-ring group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md active:scale-[.98] lg:py-[clamp(.3rem,1vh,.5rem)]"
                    >
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white", a.bg)}>
                        <l.icon aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span className="truncate">{l.chip}</span>
                      <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            <motion.div {...blurIn(h1.length + 6, reduce, ready)} className="mt-8 flex flex-col gap-3 sm:flex-row lg:mt-[clamp(1rem,3.2vh,2rem)]">
              <ButtonLink to="/sos" size="lg" icon={<Bars />} className="h-14 px-6 text-base shadow-lift lg:h-[clamp(2.9rem,7vh,3.5rem)]">
                Talk to Sahaya
              </ButtonLink>
              {!inApp && (
                <a
                  href={isAndroid ? APK_URL : "#app"}
                  {...(isAndroid ? { download: true } : {})}
                  className="focus-ring inline-flex h-14 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-ink px-6 text-base font-bold text-white shadow-lift transition hover:-translate-y-px hover:bg-slate-800 active:scale-[.97] lg:h-[clamp(2.9rem,7vh,3.5rem)]"
                >
                  <AndroidIcon className="h-5 w-5 text-[#3ddc84]" />
                  Download the app
                  <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">15 MB</span>
                </a>
              )}
            </motion.div>

            <motion.div {...blurIn(h1.length + 7, reduce, ready)} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 lg:mt-[clamp(.6rem,1.8vh,1rem)]">
              {["Free", "Android 7+", "Works on any phone"].map((x) => (
                <span key={x} className="inline-flex items-center gap-1.5">
                  <Check aria-hidden="true" className="h-4 w-4 text-green-600" />
                  {x}
                </span>
              ))}
              <a href="#how" className="focus-ring inline-flex items-center gap-0.5 rounded font-semibold text-slate-500 transition hover:text-ink">
                See how it works
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </motion.div>
          </div>

          <HeroDevice mx={mx} my={my} reduce={reduce} ready={ready} />
        </div>
      </section>

      {/* Powered by */}
      <section className="border-y border-slate-200 bg-white">
        <div className="container-wide flex flex-col items-center gap-4 py-6 md:flex-row md:justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[.2em] text-slate-400">Powered by</span>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {POWERED.map((p) => (
              <span key={p.t} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-slate-600">
                <p.icon aria-hidden="true" className="h-4 w-4" />
                {p.t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: soft colour band */}
      <section id="how" className="scroll-mt-24 bg-gradient-to-br from-indigo-50 via-rose-50 to-amber-50">
        <div className="container-wide py-16 sm:py-24">
          <Heading eyebrow="How it works" title="One call. Three steps. Real help." sub="No app skills, forms or typing. Speak, and Sahaya handles the rest." />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.en} delay={i * 110}>
                <li className="hover-lift relative h-full rounded-2xl border border-white bg-white/85 p-7 shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-sos text-white shadow-sm">
                      <s.icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="text-3xl font-extrabold text-slate-200">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-ink">{s.en}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.dEn}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* It really calls */}
      <section id="calling" className="bg-dots scroll-mt-24 border-y border-slate-200 bg-white">
        <div className="container-wide grid gap-14 py-16 sm:py-24 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-xl">
            <Heading
              eyebrow={
                <span className="inline-flex items-center gap-1.5 text-green-700">
                  <PhoneCall aria-hidden="true" className="h-4 w-4" />
                  Real calling agent
                </span>
              }
              title="It really calls. In Telugu."
              sub="Sahaya places calls, answers calls and talks naturally, like a trained helpline operator who never gets tired."
            />
            <ul className="mt-8 space-y-4">
              {[
                { icon: Languages, en: "Natural Telugu voice (Sarvam bulbul), and it understands Telugu–English mix." },
                { icon: Sparkles, en: "Asks only what's missing, then acts: dispatch, ASHA alert, advice or a fraud warning." },
                { icon: Smartphone, en: "Works on any basic phone. The caller needs no app and no internet." },
              ].map((p, i) => (
                <Reveal key={p.en} delay={120 + i * 90}>
                  <li className="flex gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">
                      <p.icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="pt-2 text-[15px] leading-relaxed text-slate-700">{p.en}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
            <Reveal delay={420}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink to="/arogya" size="lg" icon={<Mic aria-hidden="true" className="h-5 w-5" />}>
                  Try in browser
                </ButtonLink>
                <ButtonLink to="/console/phone" size="lg" variant="secondary" icon={<PhoneCall aria-hidden="true" className="h-5 w-5 text-green-600" />}>
                  Get a real call
                </ButtonLink>
              </div>
              <div className="mt-6 flex flex-col gap-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck aria-hidden="true" className="h-4 w-4 text-green-600" />
                  Built on our production Telugu calling engine
                </span>
                <span className="inline-flex items-start gap-2">
                  <Globe aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <strong className="font-semibold text-green-700">Telugu today</strong> · Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia,
                    English coming soon
                  </span>
                </span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={150}>
            <CallDemo />
          </Reveal>
        </div>
      </section>

      {/* Lifelines */}
      <section id="lifelines" className="scroll-mt-24 bg-page">
        <div className="container-wide py-16 sm:py-24">
          <Heading eyebrow="Four lifelines" title="One helper for every emergency" sub="Each lifeline is a conversation flow on the same engine, with its own live console for officials." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {LIFELINES.map((l, i) => {
              const a = accentClasses[l.accent];
              return (
                <Reveal key={l.to} delay={i * 90}>
                  <div className="hover-lift group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
                    <div className={cn("absolute inset-x-0 top-0 h-1", a.bg)} />
                    <div className="flex items-start gap-4">
                      <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm transition-transform group-hover:scale-105", a.bg)}>
                        <l.icon aria-hidden="true" className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-extrabold text-ink">{l.en}</h3>
                        <div className={cn("text-sm font-semibold", a.text)}>{l.chip}</div>
                      </div>
                    </div>
                    <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{l.dEn}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                      <ButtonLink to={l.to} accent={l.accent} icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />} className="flex-row-reverse">
                        {l.ctaEn}
                      </ButtonLink>
                      <Link to={l.console} className="focus-ring inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-500 transition hover:text-ink">
                        <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                        {l.consoleEn}
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* One engine, four lifelines */}
      <section className="bg-dots border-y border-slate-200 bg-white">
        <div className="container-wide py-16 sm:py-24">
          <Heading
            eyebrow={
              <span className="inline-flex items-center gap-1.5">
                <Workflow aria-hidden="true" className="h-4 w-4" />
                Architecture
              </span>
            }
            title="One engine, 4 lifelines"
            sub="A new lifeline is a new conversation flow, not a new app."
          />
          <div className="mt-12 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            {PIPELINE.map((p, i) => (
              <div key={p.title} className="flex flex-col items-center gap-3 lg:flex-1 lg:flex-row">
                <Reveal delay={i * 90} className="w-full">
                  <div className="hover-lift w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-soft lg:min-h-[124px]">
                    <p.icon aria-hidden="true" className="h-6 w-6 text-primary" />
                    <div className="mt-3 font-bold text-ink">{p.title}</div>
                    <div className="text-sm text-slate-500">{p.sub}</div>
                  </div>
                </Reveal>
                {i < PIPELINE.length - 1 && <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 rotate-90 text-slate-300 lg:rotate-0" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why voice-first */}
      <section className="bg-page">
        <div className="container-wide py-16 sm:py-24">
          <Heading eyebrow="Why voice-first" title="Built for everyone, not just smartphone experts" sub="Designed for people who can't type, read English or navigate apps, which is who needs help most." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w, i) => (
              <Reveal key={w.en} delay={i * 90}>
                <div className="hover-lift h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary">
                    <w.icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-extrabold text-ink">{w.en}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{w.dEn}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Officials */}
          <Reveal className="mt-16">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-rose-50 to-amber-50 p-7 shadow-soft sm:p-12">
              <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="max-w-xl">
                  <div className="text-xs font-bold uppercase tracking-[.14em] text-primary">For officials</div>
                  <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Every request, live on one dashboard</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                    Control rooms, ASHA supervisors, agriculture officers and cyber cells each get a live console: priority queue, maps, risk flags and AI situation
                    reports.
                  </p>
                  <div className="mt-6">
                    <ButtonLink to="/console" size="lg" icon={<LayoutDashboard aria-hidden="true" className="h-5 w-5" />}>
                      Open officials' console
                    </ButtonLink>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-[340px]">
                  {LIFELINES.map((l) => {
                    const a = accentClasses[l.accent];
                    return (
                      <Link key={l.console} to={l.console} className="focus-ring hover-lift rounded-2xl border border-white bg-white/85 p-4 hover:bg-white">
                        <l.icon aria-hidden="true" className={cn("h-5 w-5", a.text)} />
                        <div className="mt-2 text-sm font-bold text-ink">{l.consoleEn}</div>
                        <div className="text-xs text-slate-500">{l.en}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Android app */}
      <AppPromo />

      {/* Final CTA: deep navy band */}
      <section className="bg-gradient-to-r from-[#0b1b3f] to-[#1d4ed8]">
        <Reveal>
          <div className="container-wide flex flex-col items-start gap-6 py-14 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">In trouble? Talk to Sahaya now.</div>
              <div className="mt-1.5 text-white/75">In a life-threatening emergency, also call 112.</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/sos"
                className="inline-flex h-12 animate-pulse-ring items-center gap-2 rounded-xl bg-white px-5 font-bold text-sos shadow-sm transition hover:bg-sos-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1d4ed8] active:scale-95"
              >
                <Siren aria-hidden="true" className="h-5 w-5" />
                Talk to Sahaya
              </Link>
              <Link
                to="/scam"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/40 px-5 font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95"
              >
                <ShieldAlert aria-hidden="true" className="h-5 w-5" />
                Check a message
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
