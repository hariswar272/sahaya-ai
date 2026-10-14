// Public Scam Shield page: check a message, screenshot or call and act on the verdict.
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Lock,
  Mic,
  Phone,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Select, Tabs, Textarea } from "@/components/ui";
import { CallIntro } from "../_kit";
import * as VC from "@/components/VoiceCall";
import { api, type VoiceReply } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  SAMPLES,
  SOURCE_LABEL,
  VERDICT,
  VOICE_SAMPLES,
  VOICE_SAMPLES_EN,
  VOICE_SAMPLES_HI,
  imageToBase64,
  type Pair,
  type ScamResult,
  type Source,
} from "./shared";

// Accept either a named or a default export from the shared component.
const VoiceCall = ((VC as unknown as { VoiceCall?: ComponentType<any> }).VoiceCall ??
  (VC as unknown as { default?: ComponentType<any> }).default) as ComponentType<any>;

type CheckResponse = { result: ScamResult; audio: string | null };
type Shot = { b64: string; mime: string; preview: string; name: string };

/** UI text helpers: the user's language first, English underneath when the UI isn't English. */
function useText() {
  const { lang, t } = useLang();
  const pick = (x: Pair) => x.loc || (lang === "te" ? x.te : x.en);
  const sub = (en: string, primary?: string) => (lang === "en" || !en || en === primary ? null : en);
  return { lang, t, pick, sub };
}

export default function ScamPage() {
  const { lang, t, sub } = useText();
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>("sms");
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScamResult | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const player = usePlayer();

  function show(r: ScamResult, a: string | null, autoplay: boolean) {
    setResult(r);
    setAudio(a);
    requestAnimationFrame(() => {
      if (window.innerWidth < 1024) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (autoplay && a) player.play(a);
  }

  async function check(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    player.stop();
    try {
      const r = await api<CheckResponse>("/api/scam/check", { ...body, lang });
      show(r.result, r.audio, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const img = await imageToBase64(f);
      setShot({ ...img, name: f.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const tabLabel = (te: string, en: string) => (
    <span>
      {t(te, en)}
      {lang !== "en" && <span className="font-normal text-slate-500"> · {en}</span>}
    </span>
  );

  const tabs = [
    {
      id: "paste",
      icon: <ClipboardPaste aria-hidden="true" className="h-4 w-4" />,
      label: tabLabel("మెసేజ్", "Paste message"),
      content: (
        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("అనుమానాస్పద SMS / WhatsApp మెసేజ్ ఇక్కడ పేస్ట్ చేయండి…", "Paste the suspicious SMS or WhatsApp message here…")}
            className="te min-h-[140px]"
            maxLength={4000}
            aria-label={t("అనుమానాస్పద మెసేజ్", "Suspicious message")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={source} onChange={(e) => setSource(e.target.value as Source)} className="h-10 w-auto min-w-[150px]" aria-label={t("ఎక్కడ వచ్చింది?", "Where did you get it?")}>
              {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                <option key={s} value={s}>
                  {t(SOURCE_LABEL[s].te, SOURCE_LABEL[s].en)}
                </option>
              ))}
            </Select>
            <Button accent="scam" size="lg" className="flex-1 sm:flex-none" loading={busy} disabled={!text.trim()} icon={<ShieldAlert aria-hidden="true" className="h-5 w-5" />} onClick={() => check({ text, source })}>
              {t("చెక్ చేయండి", "Check now")}
            </Button>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("ఉదాహరణలు", "Try a sample")}</div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => {
                const sampleText = lang === "te" && s.textTe ? s.textTe : s.text;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setText(sampleText);
                      setSource(s.source);
                      check({ text: sampleText, source: s.source });
                    }}
                    className={cn(
                      "press te rounded-full border px-3 py-1 text-[13px] font-medium transition disabled:opacity-50",
                      s.safe ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" : "border-scam-200 bg-scam-50 text-scam-700 hover:bg-scam-100",
                    )}
                  >
                    {s.safe && <Check aria-hidden="true" className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />}
                    {t(s.label.te, s.label.en)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "shot",
      icon: <Upload aria-hidden="true" className="h-4 w-4" />,
      label: tabLabel("స్క్రీన్‌షాట్", "Screenshot"),
      content: (
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label={t("స్క్రీన్‌షాట్ ఎంచుకోండి", "Choose a screenshot")} onChange={(e) => pickFile(e.target.files?.[0])} />
          {shot ? (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img src={shot.preview} alt={t("చెక్ చేయాల్సిన స్క్రీన్‌షాట్", "Screenshot to check")} className="mx-auto max-h-80 w-auto object-contain" />
              <button
                type="button"
                onClick={() => setShot(null)}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-600 shadow hover:bg-white"
                aria-label={t("తీసివేయండి", "Remove screenshot")}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-scam-200 bg-scam-50/50 px-4 py-10 text-center transition hover:border-scam-500 hover:bg-scam-50"
            >
              <Upload aria-hidden="true" className="h-8 w-8 text-scam" />
              <span className="te font-semibold text-ink">{t("స్క్రీన్‌షాట్ ఎంచుకోండి", "Choose a screenshot")}</span>
              <span className="text-sm text-slate-500">{t("SMS, చాట్ లేదా పేమెంట్ రిక్వెస్ట్ స్క్రీన్‌షాట్", "Pick or drop a screenshot of the SMS, chat or payment request")}</span>
            </button>
          )}
          <Button
            accent="scam"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={!shot}
            icon={<Sparkles aria-hidden="true" className="h-5 w-5" />}
            onClick={() => shot && check({ imageBase64: shot.b64, mime: shot.mime, source: "other" })}
          >
            {t("AI తో చదివి చెక్ చేయండి", "Read & check with AI")}
          </Button>
          <p className="text-xs text-slate-500">{t("Gemini Vision స్క్రీన్‌షాట్ చదువుతుంది. ఇమేజ్ సేవ్ చేయము.", "Gemini Vision reads the text in your screenshot. The image is not stored.")}</p>
        </div>
      ),
    },
    {
      id: "voice",
      icon: <Mic aria-hidden="true" className="h-4 w-4" />,
      label: tabLabel("వాయిస్", "Describe by voice"),
      content: (
        <div className="space-y-2">
          <p className="te text-sm text-slate-600">
            {t("మీకు వచ్చిన కాల్ గురించి చెప్పండి. AI విని, మోసమా కాదా వెంటనే చెబుతుంది.", "Describe the call you got, in Telugu. The AI listens and tells you right away if it's a scam.")}
          </p>
          {VoiceCall ? (
            <VoiceCall
              base="/api/scam/call"
              title={t("మీకు వచ్చిన కాల్ గురించి చెప్పండి", "Describe the call you got")}
              samples={VOICE_SAMPLES}
              samplesEn={VOICE_SAMPLES_EN}
              samplesByLang={{ te: VOICE_SAMPLES, en: VOICE_SAMPLES_EN, hi: VOICE_SAMPLES_HI }}
              accent="scam"
              onDone={(r: VoiceReply) => r?.result && show(r.result as ScamResult, null, false)}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">{t("వాయిస్ లోడ్ అవుతోంది…", "Voice is loading…")}</div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="relative mb-6 mt-2 animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] p-5 text-white shadow-[0_18px_40px_-22px_rgba(124,58,237,0.6)] sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-24 h-56 w-56 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:h-14 sm:w-14">
              <ShieldAlert aria-hidden="true" className="h-6 w-6 sm:h-7 sm:w-7" />
            </span>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/80">{t("డిజిటల్ భద్రత · స్కామ్ షీల్డ్", "Digital safety · Scam Shield")}</div>
              <h1 className="te text-[26px] font-extrabold leading-tight tracking-tight sm:text-4xl">{t("మోసం గుర్తింపు", "Scam Shield")}</h1>
              <p className="text-base font-medium text-violet-100 sm:text-lg">{t("Scam Shield · మీ భాషలో AI మోసం చెక్", "AI fraud check · explained in Telugu")}</p>
              <p className="te mt-2 max-w-2xl text-sm text-violet-50/90">
                {t(
                  "అనుమానాస్పద మెసేజ్, స్క్రీన్‌షాట్ లేదా కాల్: సెకన్లలో నిజమో మోసమో తెలుసుకోండి. మీ భాషలో గట్టిగా వివరిస్తుంది.",
                  "Digital arrest, KYC, OTP, lottery, job and courier scams, checked in seconds and explained aloud in Telugu.",
                )}
              </p>
            </div>
          </div>
          <a
            href="tel:1930"
            className="press inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-scam-700 shadow-sm transition hover:bg-violet-50"
          >
            <Phone aria-hidden="true" className="h-4 w-4" />
            1930 · {t("సైబర్ హెల్ప్‌లైన్", "Cyber helpline")}
          </a>
        </div>
      </div>

      <CallIntro
        accent="scam"
        flow="scam"
        onTalk={() => {
          setTab("voice");
          document.getElementById("scam-check")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card id="scam-check" className="min-w-0 scroll-mt-24 animate-fade-up [animation-delay:80ms]">
          <CardHeader
            icon={<ShieldAlert aria-hidden="true" className="h-5 w-5 text-scam" />}
            title={<span className="te">{t("ఏం చెక్ చేయాలి?", "What do you want to check?")}</span>}
            subtitle={sub("Paste a message, upload a screenshot, or describe a call") ?? t("", "Paste a message, upload a screenshot, or describe a call")}
          />
          <div className="min-w-0 p-4 sm:p-5">
            <Tabs tabs={tabs} value={tab} onChange={setTab} accent="scam" />
            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="te">{error}</span>
              </div>
            )}
          </div>
        </Card>

        <div ref={resultRef} className="scroll-mt-20">
          {result ? <ResultCard key={result.id} result={result} audio={audio} player={player} /> : <HowItWorks />}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
        <span className="flex items-center gap-2">
          <Lock aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="te">
            {t("మీ మెసేజ్ సేవ్ చేయము: మోసం రకం మాత్రమే అనామకంగా లెక్కిస్తాం.", "We never store your message, only an anonymous count of the scam type.")}
          </span>
        </span>
        <Link to="/console/scam" className="font-semibold text-scam-700 hover:underline">
          {t("సైబర్ సెల్ కన్సోల్", "Cyber cell console")} →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- result */

function ResultCard({ result, audio, player }: { result: ScamResult; audio: string | null; player: Player }) {
  const { lang, t, pick, sub } = useText();
  const v = VERDICT[result.verdict];
  const Icon = result.verdict === "scam" ? ShieldX : result.verdict === "suspicious" ? AlertTriangle : ShieldCheck;
  const [copied, setCopied] = useState(false);
  const [fill, setFill] = useState(0);
  const verdictText = result.verdict_label ? pick(result.verdict_label) : t(v.te, v.en);
  const explanation = result.explanation || (lang === "te" ? result.explanation_te : result.explanation_en);
  // Family alert goes out in English and Telugu, so elders can read it too.
  const shareText = `${result.share.en}\n\n${result.share.te}`;
  const playing = player.playing && player.current === audio;

  // Start the meter empty so it visibly fills to the confidence.
  useEffect(() => {
    const id = window.setTimeout(() => setFill(Math.max(5, Math.min(100, result.confidence))), 120);
    return () => window.clearTimeout(id);
  }, [result.confidence]);

  return (
    <Card className="animate-scale-in overflow-hidden" role="status" aria-live="polite">
      <div className={cn("bg-gradient-to-br p-5 text-white", v.banner)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15", result.verdict === "scam" && "animate-pulse-ring")}>
              <Icon aria-hidden="true" className="h-8 w-8" />
            </span>
            <div>
              <div className="te text-2xl font-extrabold leading-tight sm:text-3xl">{verdictText}</div>
              {sub(v.en.toUpperCase(), verdictText.toUpperCase()) && <div className="text-sm font-bold tracking-wide text-white/85">{v.en.toUpperCase()}</div>}
            </div>
          </div>
          {audio && (
            <button
              type="button"
              onClick={() => (playing ? player.stop() : player.play(audio))}
              className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
              aria-label={playing ? "Stop" : "Listen in Telugu"}
            >
              {playing ? <Square aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
              <span>{playing ? "Stop" : "Listen in Telugu"}</span>
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {result.verdict !== "safe" && <span className="te rounded-full bg-white/15 px-3 py-1 font-semibold">{pick(result.type_label)}</span>}
          <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">
            {t("నమ్మకం", "Confidence")} {result.confidence}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-[width] duration-1000 ease-out" style={{ width: `${fill}%` }} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="animate-fade-up [animation-delay:120ms]">
          <p className="te text-lg font-semibold leading-relaxed text-ink">{explanation}</p>
          {sub(result.explanation_en, explanation) && <p className="mt-1 text-sm leading-relaxed text-slate-500">{result.explanation_en}</p>}
        </div>

        {result.red_flags.length > 0 && (
          <Section title={t("ఎందుకు?", "Red flags")}>
            <ul className="space-y-1.5">
              {result.red_flags.map((f, i) => (
                <li key={i} className="flex animate-fade-up items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2" style={{ animationDelay: `${180 + i * 70}ms` }}>
                  <AlertTriangle aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", result.verdict === "safe" ? "text-slate-400" : "text-high")} />
                  <span className="min-w-0 flex-1">
                    <span className="te block text-[15px] font-medium text-ink">{pick(f)}</span>
                    {sub(f.en, pick(f)) && <span className="block text-xs text-slate-500">{f.en}</span>}
                  </span>
                  <Badge tone={f.source === "ai" ? "scam" : "neutral"} className="shrink-0">
                    {f.source === "ai" ? "AI" : t("నియమం", "Rule")}
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="grid animate-fade-up gap-4 sm:grid-cols-2" style={{ animationDelay: `${240 + result.red_flags.length * 70}ms` }}>
          <Advice title={t("ఇప్పుడు చేయండి", "Do now")} items={result.do_now} good />
          <Advice title={t("చేయకండి", "Don't")} items={result.dont} />
        </div>

        {result.extracted_text && (
          <details className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-600">{t("స్క్రీన్‌షాట్ నుండి AI చదివింది", "AI read this from your screenshot")}</summary>
            <pre className="te mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-slate-600">{result.extracted_text}</pre>
          </details>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionLink href="tel:1930" icon={<Phone aria-hidden="true" className="h-4 w-4" />} label={t("1930 కి కాల్", "Call 1930")} strong={result.verdict !== "safe"} />
          <ActionLink href="https://cybercrime.gov.in" external icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />} label={t("ఆన్‌లైన్ ఫిర్యాదు", "Report online")} />
          <ActionLink href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} external icon={<Share2 aria-hidden="true" className="h-4 w-4" />} label={t("ఇంట్లో చెప్పండి", "Alert family")} />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                /* clipboard blocked: nothing to do */
              }
            }}
            className="press flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center shadow-sm transition hover:bg-slate-50"
          >
            {copied ? <Check aria-hidden="true" className="h-4 w-4 text-low" /> : <Copy aria-hidden="true" className="h-4 w-4 text-slate-500" />}
            <span className="te text-sm font-semibold text-ink">{copied ? t("కాపీ అయింది", "Copied") : t("అలర్ట్ కాపీ", "Copy alert")}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span>
            {t("చెక్ చేసింది", "Checked by")}: {t("నియమాలు", "rules")}
            {result.ai ? ` + AI (${result.engine})` : ""}
          </span>
          {result.rules && (
            <span>
              {t("నియమ స్కోర్", "Rule score")} {result.rules.score}/100
            </span>
          )}
          <span>{t("సలహా మాత్రమే. అనుమానం ఉంటే 1930 కి కాల్ చేయండి.", "Advice only. When in doubt, call 1930.")}</span>
        </div>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="te mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Advice({ title, items, good }: { title: string; items: Pair[]; good?: boolean }) {
  const { pick, sub } = useText();
  if (!items?.length) return null;
  return (
    <div className={cn("rounded-2xl border p-3.5", good ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60")}>
      <div className={cn("te mb-2 text-sm font-bold", good ? "text-green-800" : "text-red-800")}>{title}</div>
      <ul className="space-y-2">
        {items.map((x, i) => (
          <li key={i} className="flex items-start gap-2">
            {good ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-low" /> : <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-critical" />}
            <span>
              <span className="te block text-[15px] leading-snug text-ink">{pick(x)}</span>
              {sub(x.en, pick(x)) && <span className="block text-xs text-slate-500">{x.en}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionLink({ href, icon, label, external, strong }: { href: string; icon: ReactNode; label: string; external?: boolean; strong?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "press flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center shadow-sm transition",
        strong ? "border-scam bg-scam text-white hover:bg-scam-700" : "border-slate-200 bg-white text-ink hover:bg-slate-50",
      )}
    >
      <span className={strong ? "text-white" : "text-slate-500"}>{icon}</span>
      <span className="te text-sm font-semibold">{label}</span>
    </a>
  );
}

function HowItWorks() {
  const { t } = useText();
  const steps: [ReactNode, string, string][] = [
    [<ClipboardPaste aria-hidden="true" key="a" className="h-5 w-5" />, "మెసేజ్ పేస్ట్ చేయండి, స్క్రీన్‌షాట్ ఇవ్వండి లేదా కాల్ గురించి చెప్పండి", "Paste the message, upload a screenshot, or describe the call"],
    [<ShieldAlert aria-hidden="true" key="b" className="h-5 w-5" />, "20+ తెలిసిన మోసం నియమాలు + AI కలిసి చెక్ చేస్తాయి", "20+ known-scam rules and the AI check it together. The stricter verdict wins."],
    [<Volume2 aria-hidden="true" key="c" className="h-5 w-5" />, "మీ భాషలో గట్టిగా వివరిస్తుంది, ఏం చేయాలో చెబుతుంది", "Explains aloud in Telugu and tells you exactly what to do"],
    [<Share2 aria-hidden="true" key="d" className="h-5 w-5" />, "1930 కి ఫిర్యాదు, కుటుంబానికి వాట్సాప్ అలర్ట్", "One tap to call 1930, report online, or warn your family"],
  ];
  return (
    <Card className="animate-fade-up h-full [animation-delay:140ms]">
      <CardHeader icon={<Sparkles aria-hidden="true" className="h-5 w-5 text-scam" />} title={<span className="te">{t("ఎలా పని చేస్తుంది?", "How Scam Shield works")}</span>} />
      <ol className="space-y-3 p-5">
        {steps.map(([icon, te, en], i) => (
          <li key={i} className="flex animate-fade-up items-start gap-3" style={{ animationDelay: `${200 + i * 80}ms` }}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-scam-50 text-scam">{icon}</span>
            <span className="te pt-2 font-semibold text-ink">{t(te, en)}</span>
          </li>
        ))}
      </ol>
      <div className="mx-5 mb-5 rounded-2xl border border-scam-200 bg-scam-50 p-4">
        <div className="te font-bold text-scam-700">{t("గుర్తుంచుకోండి", "Remember")}</div>
        <ul className="te mt-1.5 space-y-1 text-sm text-ink">
          <li>• {t("పోలీసులు వీడియో కాల్‌లో అరెస్ట్ చేయరు, డబ్బులు అడగరు.", "Police never arrest anyone on a video call or ask for money.")}</li>
          <li>• {t("బ్యాంక్ ఎప్పుడూ OTP, PIN అడగదు.", "Banks never ask for your OTP or PIN.")}</li>
          <li>• {t("డబ్బులు రావడానికి UPI PIN అవసరం లేదు.", "Receiving money never needs a UPI PIN.")}</li>
        </ul>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- audio */

type Player = { play: (b64: string) => void; stop: () => void; playing: boolean; current: string | null };

function usePlayer(): Player {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => () => ref.current?.pause(), []);
  return {
    playing,
    current,
    play(b64) {
      ref.current?.pause();
      const a = new Audio(`data:audio/wav;base64,${b64}`);
      ref.current = a;
      setCurrent(b64);
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    },
    stop() {
      ref.current?.pause();
      setPlaying(false);
    },
  };
}
