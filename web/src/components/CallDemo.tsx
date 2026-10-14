// Animated demo of a Sahaya voice call used on the landing page hero.
import { useEffect, useRef, useState } from "react";
import { BellRing, Mic, Phone, PhoneOff, Volume2 } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { useLang } from "@/lib/i18n";

type Line = { who: "agent" | "caller"; te: string; en: string };

// Sample outbound health follow-up call, played as an animation.
const SCRIPT: Line[] = [
  { who: "agent", te: "నమస్కారం లక్ష్మి గారు, సహాయ AI నుంచి మాట్లాడుతున్నాను. మీ ఆరోగ్యం ఎలా ఉంది?", en: "Hello Lakshmi garu, this is Sahaya AI. How are you feeling today?" },
  { who: "caller", te: "బాగానే ఉంది, కానీ రెండు రోజులుగా కాళ్ళు బాగా వాచాయి.", en: "I'm okay, but my legs have been badly swollen for two days." },
  { who: "agent", te: "అర్థమైంది. తలనొప్పి లేదా కళ్ళు మసకబారడం ఉందా?", en: "Understood. Any headache or blurred vision?" },
  { who: "caller", te: "అవును, నిన్నటి నుంచి తలనొప్పి ఉంది.", en: "Yes, I've had a headache since yesterday." },
];

type Phase = "ringing" | "call" | "result";

function Waveform({ active, tone }: { active: boolean; tone: "agent" | "caller" }) {
  const heights = [40, 70, 100, 60, 85, 50, 95, 65, 45, 80, 55, 35];
  return (
    <div className="flex h-8 items-center gap-[3px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn("w-[3px] origin-center rounded-full transition-colors", tone === "agent" ? "bg-primary" : "bg-green-600", active ? "animate-wave" : "opacity-40")}
          style={{ height: `${h}%`, animationDelay: `${i * 90}ms`, transform: active ? undefined : "scaleY(.25)" }}
        />
      ))}
    </div>
  );
}

/** Animated phone: incoming call → live Telugu conversation → ASHA alert. Loops. */
export function CallDemo({ className }: { className?: string }) {
  const { t } = useLang();
  // Conversation content is Telugu (the voice language), with English subtitles.
  const texts = SCRIPT.map((l) => l.te);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const reduced = useRef(prefersReducedMotion());
  const [phase, setPhase] = useState<Phase>(reduced.current ? "result" : "ringing");
  const [done, setDone] = useState(reduced.current ? SCRIPT.length : 0);
  const [typed, setTyped] = useState(0);
  const [secs, setSecs] = useState(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Drive the animation with one timer chain.
  useEffect(() => {
    if (reduced.current) return;
    let alive = true;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));

    (async () => {
      while (alive) {
        setPhase("ringing");
        setDone(0);
        setTyped(0);
        setSecs(0);
        await wait(2600);
        if (!alive) return;
        setPhase("call");
        for (let i = 0; i < SCRIPT.length && alive; i++) {
          const text = textsRef.current[i];
          for (let c = 1; c <= text.length && alive; c += 2) {
            setTyped(c);
            await wait(SCRIPT[i].who === "agent" ? 32 : 26);
          }
          if (!alive) return;
          setTyped(0);
          setDone(i + 1);
          await wait(650);
        }
        if (!alive) return;
        setPhase("result");
        await wait(4200);
      }
    })();

    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Call timer.
  useEffect(() => {
    if (phase === "ringing" || reduced.current) return;
    const id = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [done, typed, phase]);

  const current = phase === "call" && done < SCRIPT.length ? SCRIPT[done] : null;
  const speaking = current?.who ?? "agent";
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className={cn("relative mx-auto w-[290px] sm:w-[310px]", className)}>
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary-100 via-white to-sos-100 opacity-80 blur-2xl" />
      <div className="relative h-[560px] overflow-hidden rounded-[2.6rem] border-[9px] border-slate-900 bg-white shadow-lift">
        <div className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />

        {phase === "ringing" ? (
          <div key="ring" className="flex h-full animate-fade-in flex-col items-center justify-between bg-gradient-to-b from-primary-50 via-white to-sos-50 px-6 pb-10 pt-16">
            <div className="text-center">
              <div className="te text-xs font-semibold uppercase tracking-widest text-slate-500">{t("ఇన్‌కమింగ్ కాల్", "Incoming call")}</div>
            </div>
            <div className="relative grid place-items-center">
              <span className="absolute h-28 w-28 animate-ping rounded-full bg-primary/15" />
              <span className="absolute h-36 w-36 animate-ping rounded-full bg-sos/10 [animation-delay:400ms]" />
              <LogoMark className="relative h-20 w-20 rounded-3xl shadow-lift" iconClassName="h-10 w-10" />
              <div className="mt-5 text-xl font-extrabold text-ink">Sahaya AI</div>
              <div className="te text-sm text-slate-500">{t("ఆరోగ్య ఫాలో-అప్ కాల్", "Health follow-up call")}</div>
            </div>
            <div className="flex w-full items-center justify-between px-4">
              <div className="flex flex-col items-center gap-1.5">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-critical text-white shadow-sm">
                  <PhoneOff aria-hidden="true" className="h-6 w-6" />
                </span>
                <span className="te text-xs text-slate-500">{t("తిరస్కరించు", "Decline")}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="grid h-14 w-14 animate-ring-pulse place-items-center rounded-full bg-green-600 text-white shadow-sm">
                  <Phone aria-hidden="true" className="h-6 w-6 animate-bounce" />
                </span>
                <span className="te text-xs text-slate-500">{t("స్వీకరించు", "Accept")}</span>
              </div>
            </div>
          </div>
        ) : (
          <div key="call" className="flex h-full animate-fade-in flex-col bg-white pt-7">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 pb-3">
              <LogoMark />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">Sahaya AI</div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  {phase === "result" ? t("కాల్ పూర్తయింది", "Call complete") : t("కాల్‌లో ఉంది", "On call")} · {mm}:{ss}
                </div>
              </div>
              <Volume2 aria-hidden="true" className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2">
              <span className={cn("text-[11px] font-semibold", speaking === "agent" ? "text-primary" : "text-green-700")}>
                {phase === "result"
                  ? t("ASHA డ్యాష్‌బోర్డ్‌లో సేవ్ అయింది", "Saved to ASHA dashboard")
                  : speaking === "agent"
                    ? t("AI మాట్లాడుతోంది", "AI speaking")
                    : t("పేషెంట్ మాట్లాడుతున్నారు", "Patient speaking")}
              </span>
              <Waveform active={phase === "call"} tone={speaking} />
            </div>
            <div ref={logRef} className="scrollbar-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
              {SCRIPT.slice(0, done).map((l, i) => (
                <Bubble key={i} line={l} text={texts[i]} sub />
              ))}
              {current && typed > 0 && <Bubble line={current} text={texts[done].slice(0, typed)} typing sub />}
              {phase === "result" && (
                <div className="mt-1 animate-scale-in rounded-2xl border border-orange-200 bg-orange-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-high">
                    <BellRing aria-hidden="true" className="h-4 w-4" />
                    ASHA alerted · High risk
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink">Danger signs: swelling + headache</div>
                  <div className="text-xs text-slate-600">ASHA worker alerted instantly</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-6 border-t border-slate-100 py-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500">
                <Mic aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-critical text-white">
                <PhoneOff aria-hidden="true" className="h-5 w-5" />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ line, text, typing, sub }: { line: Line; text: string; typing?: boolean; sub?: boolean }) {
  const agent = line.who === "agent";
  return (
    <div
      className={cn(
        "max-w-[88%] animate-fade-up rounded-2xl px-3 py-2",
        agent ? "self-start rounded-tl-md border border-primary-100 bg-primary-50" : "self-end rounded-tr-md border border-green-200 bg-green-50",
      )}
    >
      <div className="te text-[13px] leading-relaxed text-ink">
        {text}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-slate-500" />}
      </div>
      {sub && line.en !== text && !typing && <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{line.en}</div>}
    </div>
  );
}
