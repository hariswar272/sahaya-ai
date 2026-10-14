// Full-screen preloader shown once per session while the app boots.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HeartHandshake } from "lucide-react";
import { markBootReady, shouldShowPreloader } from "@/lib/boot";

const R = 52;
const C = 2 * Math.PI * R;
const NAME = "Sahaya AI".split("");
const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * Branded first-load animation (once per session, skipped with reduced motion):
 * glowing logo tile → ring draws with a 0–100% counter → name blur-reveals letter by letter
 * → tagline → exit (fade + scale 1.04 + short blur) → hero reveal starts.
 */
export function Preloader() {
  const [show, setShow] = useState(shouldShowPreloader);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!show) return;
    const t0 = performance.now();
    const RUN = 1150;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / RUN);
      setPct(Math.round(100 * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      setShow(false);
    };
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    const minWait = new Promise((r) => window.setTimeout(r, 1250));
    Promise.all([minWait, fonts?.ready ?? Promise.resolve()]).then(close, close);
    const cap = window.setTimeout(close, 1700);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(cap);
    };
  }, [show]);

  if (!shouldShowPreloader) return null;

  return (
    <AnimatePresence onExitComplete={markBootReady}>
      {show && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[100] grid place-items-center bg-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)", transition: { duration: 0.42, ease: "easeOut" } }}
          aria-hidden
        >
          <div className="flex flex-col items-center">
            <div className="relative grid h-32 w-32 place-items-center">
              {/* soft glow */}
              <motion.div
                className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_center,rgba(29,78,216,.35),rgba(225,29,72,.18)_45%,transparent_70%)]"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1.25 }}
                transition={{ duration: 0.9, ease: EASE }}
              />
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 128 128">
                <defs>
                  <linearGradient id="pl-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
                <circle cx="64" cy="64" r={R} fill="none" stroke="#eef2f7" strokeWidth="3" />
                <motion.circle
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke="url(#pl-ring)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: C }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: 1.15, ease: "easeInOut", delay: 0.1 }}
                />
              </svg>
              <motion.span
                className="relative grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-sos text-white"
                initial={{ scale: 0.55, opacity: 0, boxShadow: "0 0 0 0 rgba(29,78,216,0)" }}
                animate={{ scale: 1, opacity: 1, boxShadow: "0 18px 50px -12px rgba(29,78,216,.55)" }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
              >
                <HeartHandshake aria-hidden="true" className="h-10 w-10" strokeWidth={2.2} />
              </motion.span>
            </div>

            <div className="mt-6 flex text-2xl font-extrabold tracking-tight text-ink" aria-label="Sahaya AI">
              {NAME.map((ch, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 6, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                  transition={{ delay: 0.25 + i * 0.045, duration: 0.45, ease: EASE }}
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              ))}
            </div>
            <motion.div
              className="mt-1 text-sm font-medium text-slate-500"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75, duration: 0.45, ease: EASE }}
            >
              Real help, fast.
            </motion.div>

            <div className="mt-6 flex w-44 items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-sos" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-400">{pct}%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
