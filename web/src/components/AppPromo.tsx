import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Download, Mic, MonitorSmartphone, PhoneCall, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { Reveal } from "@/components/ui";
import { AndroidIcon } from "@/components/AndroidIcon";
import { useInstallPrompt } from "@/lib/install";
import { APK_URL, inApp } from "@/lib/platform";
import { cn } from "@/lib/utils";

const POINTS = [
  { icon: Smartphone, text: "Works on any Android 7+ phone, even budget ones" },
  { icon: Mic, text: "Talk to Sahaya in Telugu with one tap" },
  { icon: PhoneCall, text: "Real AI calls: the same agent as the helpline" },
  { icon: Zap, text: "Light and fast: about 15 MB, opens instantly" },
  { icon: MonitorSmartphone, text: "Also installs as a web app on iPhone and desktop" },
];

// Real screenshots from the Android app; the site screenshots stand in until they exist.
// [left, center, right]: the live call is the hero phone.
const SHOTS = [
  { real: "/app/real-home.png", fallback: "/app/screen-home.png", alt: "Sahaya Android app: home screen" },
  { real: "/app/real-call.png", fallback: "/app/screen-sos.png", alt: "Sahaya Android app: live AI call in Telugu" },
  { real: "/app/real-sos.png", fallback: "/app/screen-sos.png", alt: "Sahaya Android app: Disaster SOS screen" },
];

const EASE = [0.2, 0.7, 0.2, 1] as const;

function Phone({
  shot,
  big,
  className,
  delay,
  onReal,
}: {
  shot: (typeof SHOTS)[number];
  big?: boolean;
  className?: string;
  delay: string;
  onReal?: (ok: boolean) => void;
}) {
  const [src, setSrc] = useState(shot.real);
  return (
    <div className={className}>
      <div className="animate-float" style={{ animationDelay: delay }}>
        <div
          className={cn(
            "relative overflow-hidden rounded-[2.6rem] border-[9px] border-slate-900 bg-slate-900 shadow-lift",
            big ? "h-[540px] w-[248px] sm:h-[580px] sm:w-[266px]" : "h-[460px] w-[212px]",
          )}
        >
          <img
            src={src}
            alt={shot.alt}
            loading="lazy"
            decoding="async"
            onLoad={() => src === shot.real && onReal?.(true)}
            onError={() => {
              if (src !== shot.fallback) {
                setSrc(shot.fallback);
                onReal?.(false);
              }
            }}
            className="h-full w-full rounded-[2rem] bg-white object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}

/** "Get the Sahaya app" section: Android download, QR code and web-app install. */
export function AppPromo() {
  const reduce = useReducedMotion();
  const { canInstall, install } = useInstallPrompt();
  const [real, setReal] = useState(false);

  return (
    <section id="app" className="scroll-mt-24 overflow-hidden border-y border-slate-200 bg-gradient-to-br from-primary-50 via-white to-sos-50">
      <div className="container-wide grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1fr_1fr]">
        <div>
          <motion.div
            initial={reduce ? false : { opacity: 0, filter: "blur(6px)", y: 12 }}
            whileInView={{ opacity: 1, filter: "blur(0px)", y: 0, transitionEnd: { filter: "none" } }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-white">
              <AndroidIcon className="h-3.5 w-3.5 text-[#3ddc84]" />
              Android app
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Sahaya in your pocket</h2>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
              One tap to the AI helpline, on any Android phone. Built for the people who need help most.
            </p>
          </motion.div>

          <ul className="mt-6 space-y-3">
            {POINTS.map((p, i) => (
              <Reveal key={p.text} delay={80 + i * 70}>
                <li className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-slate-200">
                    <p.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[15px] font-medium text-slate-700">{p.text}</span>
                </li>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={450}>
            {inApp ? (
              <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-green-800">
                <BadgeCheck className="h-6 w-6 text-green-600" />
                <span>
                  <span className="block font-bold">You're using the Sahaya app ✓</span>
                  <span className="block text-sm text-green-700">Share it with family: they can download it from sahaya.hmgenx.in</span>
                </span>
              </div>
            ) : (
            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div>
                <a
                  href={APK_URL}
                  download
                  className="inline-flex h-14 items-center gap-3 rounded-2xl bg-ink px-6 text-base font-bold text-white shadow-lift transition hover:-translate-y-px hover:bg-slate-800 active:scale-[.97]"
                >
                  <AndroidIcon className="h-6 w-6 text-[#3ddc84]" />
                  Download for Android
                  <Download className="h-4 w-4 text-white/60" />
                </a>
                <div className="mt-2 flex items-center gap-1.5 pl-1 text-xs font-medium text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                  15 MB · v1.0 · Android 7+
                </div>
                <div className="mt-4">
                  {canInstall ? (
                    <button
                      type="button"
                      onClick={() => void install()}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-px hover:shadow-md active:scale-[.97]"
                    >
                      <MonitorSmartphone className="h-4 w-4 text-primary" />
                      Install web app
                    </button>
                  ) : (
                    <div className="max-w-xs text-xs leading-relaxed text-slate-500">
                      <span className="font-semibold text-slate-600">iPhone / desktop:</span> open this site and choose "Add to Home Screen" or "Install app" in the
                      browser menu.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:flex-col sm:items-center sm:gap-2 sm:p-4">
                <img src="/app/qr-apk.svg" alt="QR code: download the Sahaya Android app" width={112} height={112} className="h-24 w-24 sm:h-28 sm:w-28" />
                <div className="text-left sm:text-center">
                  <div className="text-sm font-bold text-ink">Scan to download</div>
                  <div className="text-[11px] text-slate-500">sahaya.hmgenx.in</div>
                </div>
              </div>
            </div>
            )}
          </Reveal>
        </div>

        <motion.div
          className="relative mx-auto w-full max-w-[540px]"
          initial={reduce ? false : { opacity: 0, y: 30, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <div className="relative h-[580px] sm:h-[620px]">
            <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(29,78,216,.18),transparent_65%)]" />
            <Phone shot={SHOTS[0]} className="absolute left-0 top-14 hidden -rotate-[8deg] sm:block" delay="-2s" />
            <Phone shot={SHOTS[2]} className="absolute right-0 top-14 hidden rotate-[8deg] sm:block" delay="-4s" />
            <Phone shot={SHOTS[1]} big className="absolute left-1/2 top-0 z-10 -translate-x-1/2" delay="0s" onReal={setReal} />
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-slate-500">
            <BadgeCheck className="h-4 w-4 text-green-600" />
            {real ? "Real screenshots from the Sahaya Android app" : "Screens from the Sahaya app"}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
