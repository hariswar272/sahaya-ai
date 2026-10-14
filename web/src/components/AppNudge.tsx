import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Download, X } from "lucide-react";
import { AndroidIcon } from "@/components/AndroidIcon";
import { APK_URL, inApp, isAndroid } from "@/lib/platform";

const KEY = "sahaya.appNudgeClosed";

function closedBefore(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Get the Android app": a floating pill bottom-right on desktop (after 2 s) and a slim banner
 * under the navbar on mobile web. Never shown inside our Android app or an installed PWA.
 */
export function AppNudge() {
  const [open, setOpen] = useState(false);
  const [appInView, setAppInView] = useState(false);

  // On the landing page, wait until the visitor has scrolled past the hero so the pill
  // never covers the hero phones; elsewhere, show it after 2 s.
  useEffect(() => {
    if (inApp || closedBefore()) return;
    let timeUp = false;
    const maybeOpen = () => {
      const pastHero = window.location.pathname !== "/" || window.scrollY > window.innerHeight * 0.6;
      if (timeUp && pastHero) {
        setOpen(true);
        window.removeEventListener("scroll", maybeOpen);
      }
    };
    const id = window.setTimeout(() => {
      timeUp = true;
      maybeOpen();
    }, 2000);
    window.addEventListener("scroll", maybeOpen, { passive: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("scroll", maybeOpen);
    };
  }, []);

  // The #app section already sells the app: hide the floating pill while it's on screen.
  useEffect(() => {
    if (inApp || typeof IntersectionObserver === "undefined") return;
    let io: IntersectionObserver | null = null;
    let tries = 0;
    const attach = () => {
      const el = document.getElementById("app");
      if (!el) {
        if (tries++ < 20) timer = window.setTimeout(attach, 500);
        return;
      }
      io = new IntersectionObserver((entries) => setAppInView(entries.some((e) => e.isIntersecting)), { threshold: 0.15 });
      io.observe(el);
    };
    let timer = window.setTimeout(attach, 300);
    return () => {
      window.clearTimeout(timer);
      io?.disconnect();
    };
  }, []);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  };

  if (inApp) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Desktop: floating pill */}
          {!appInView && (
          <motion.div
            key="pill"
            className="fixed bottom-6 right-6 z-40 hidden md:block"
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1.5 pl-2 shadow-lift">
              <Link to="/#app" className="group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-50">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#3ddc84] text-ink">
                  <AndroidIcon className="h-5 w-5" />
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-bold text-ink">Get the Android app</span>
                  <span className="block text-[11px] text-slate-500">Free · 15 MB · scan or download</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
              </Link>
              <button type="button" onClick={close} aria-label="Dismiss" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
          )}

          {/* Mobile web: slim banner under the navbar */}
          <motion.div
            key="banner"
            className="fixed inset-x-3 top-[84px] z-40 md:hidden"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-ink py-2 pl-3 pr-1.5 text-white shadow-lift">
              <AndroidIcon className="h-5 w-5 shrink-0 text-[#3ddc84]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Install the Sahaya app</span>
              {isAndroid ? (
                <a href={APK_URL} download onClick={close} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-xs font-bold text-ink">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              ) : (
                <Link to="/#app" onClick={close} className="inline-flex h-8 shrink-0 items-center rounded-xl bg-white px-3 text-xs font-bold text-ink">
                  Get app
                </Link>
              )}
              <button type="button" onClick={close} aria-label="Dismiss" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white/70 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
