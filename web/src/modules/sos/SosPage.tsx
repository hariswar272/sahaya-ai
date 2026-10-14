import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BatteryCharging, Droplets, Home, Loader2, MapPin, Phone, Send, ShieldCheck, Siren, Zap } from "lucide-react";
import * as VC from "@/components/VoiceCall";
import { useLang } from "@/lib/i18n";
import { CallIntro } from "../_kit";
import "./sos.css";
import { CHANNEL, PRIORITY, Panel, PrioBadge, WATER, sosApi, vulnText, type Channel, type Incident, type Triage } from "./shared";

// Accept either a named or a default export from the shared component.
const VoiceCall = ((VC as unknown as { VoiceCall?: ComponentType<any> }).VoiceCall ??
  (VC as unknown as { default?: ComponentType<any> }).default) as ComponentType<any>;

type T = (te: string, en: string) => string;
type Fields = Partial<Incident> & { no_vulnerable?: boolean; no_medical?: boolean };
type Reply = {
  sessionId?: string;
  said?: string;
  done?: boolean;
  fields?: Fields;
  captured?: Record<string, unknown>;
  preview?: Triage | null;
  result?: { incident?: Incident };
};

const SAMPLES_EN = [
  "We are near the Ramalayam temple in Singh Nagar",
  "There are five of us",
  "The water has reached the first floor",
  "My grandmother is diabetic and her insulin has run out",
  "Please send a boat, we need medicines",
  "My name is Lakshmi",
  "We're at Payakapuram water tank, 6 people, 2 kids, water up to the chest, send a boat",
];
const SAMPLES_TE = [
  "మేము సింగ్ నగర్ రామాలయం దగ్గర ఉన్నాం",
  "ఐదుగురు ఉన్నాం",
  "ఫస్ట్ ఫ్లోర్ వరకు నీళ్ళు వచ్చాయి",
  "అమ్మమ్మకి షుగర్, ఇన్సులిన్ అయిపోయింది",
  "బోట్ పంపండి, మందులు కావాలి",
  "నా పేరు లక్ష్మి",
  "Payakapuram water tank daggara unnam, 6 mandi, 2 pillalu, water chest varaku, boat pampandi",
];

const TEXT_SAMPLES_EN = [
  "Help! 4 of us stuck on the terrace at Krishna Lanka near the school, 2 small kids, no food since yesterday",
  "We're near the Payakapuram water tank, 6 people at home, my mother needs dialysis today, water is up to the waist, please send a boat",
  "Vambay Colony block 7, 3 of us, knee-level water, we need food and drinking water",
];
const TEXT_SAMPLES_TE = [
  "అన్నా మేము పాయకాపురం వాటర్ ట్యాంక్ దగ్గర ఉన్నాం, ఇంట్లో 6 మంది, మా అమ్మకి డయాలసిస్ ఉంది ఈరోజు, నీళ్ళు నడుము వరకు వచ్చాయి, బోట్ పంపండి",
  "కృష్ణ లంక స్కూల్ టెర్రస్ మీద 4 మంది ఉన్నాం, ఇద్దరు చిన్న పిల్లలు, నిన్నటి నుంచి ఆహారం లేదు",
  "Vambay colony block 7 lo 3 members unnam, water knee level, food water kavali",
];

const TIPS = [
  { icon: Zap, te: "కరెంట్ మెయిన్ స్విచ్ ఆఫ్ చేయండి", en: "Switch off the main power" },
  { icon: Home, te: "ఇంట్లో ఎత్తైన చోటికి / టెర్రస్ మీదకు వెళ్ళండి", en: "Move to the highest floor or the terrace" },
  { icon: BatteryCharging, te: "ఫోన్ ఛార్జ్ దాచుకోండి, అవసరమైతేనే వాడండి", en: "Save your phone battery for calls that matter" },
  { icon: Droplets, te: "వరద నీటిలో నడవకండి; కాచిన నీళ్ళే తాగండి", en: "Don't walk through flood water; drink only boiled water" },
];

function Understood({ fields, captured, preview, t }: { fields: Fields; captured: Record<string, unknown>; preview: Triage | null; t: T }) {
  const rows: { label: string; value: string; keys: string[]; wide?: boolean }[] = [
    { label: t("ప్రాంతం", "Location"), value: [fields.area, fields.landmark].filter(Boolean).join(" · "), keys: ["area", "landmark"], wide: true },
    { label: t("మనుషులు", "People"), value: fields.people ? String(fields.people) : "", keys: ["people"] },
    { label: t("నీటి మట్టం", "Water level"), value: fields.water ? WATER[fields.water] || fields.water : "", keys: ["water"] },
    { label: t("బలహీనులు", "Vulnerable people"), value: vulnText(fields), keys: ["elderly", "children", "pregnant", "disabled", "sick", "no_vulnerable"], wide: true },
    { label: t("వైద్యం", "Medical"), value: (fields.medical || []).join(", ") || (fields.no_medical ? "None" : ""), keys: ["medical", "no_medical"] },
    { label: t("పేరు", "Name"), value: fields.name || "", keys: ["name"] },
    { label: t("అవసరాలు", "Needs"), value: (fields.needs || []).join(", ").replace(/_/g, " "), keys: ["needs"], wide: true },
  ];
  return (
    <Panel
      title={t("AI అర్థం చేసుకున్నది", "What the AI understood")}
      right={preview ? <PrioBadge p={preview.priority} size="md" /> : <span className="text-xs text-slate-400">{t("వేచి ఉంది…", "waiting…")}</span>}
    >
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => {
          const fresh = r.keys.some((k) => k in captured);
          return (
            <div
              key={r.keys[0]}
              className={`rounded-xl border px-3 py-2 transition-colors ${r.wide ? "col-span-2" : ""} ${
                fresh ? "border-emerald-300 bg-emerald-50" : r.value ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"
              }`}
            >
              <div className="text-[11px] text-slate-500">{r.label}</div>
              <div className={`text-sm font-semibold ${r.value ? "text-slate-900" : "font-normal text-slate-400"}`}>{r.value || "—"}</div>
            </div>
          );
        })}
      </div>
      {preview && preview.reasons.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{t("ఈ ప్రాధాన్యత ఎందుకు:", "Why this priority:")}</span> {preview.reasons.join("; ")}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {t(
          "Sarvam మాటను టెక్స్ట్‌గా మారుస్తుంది, AI వివరాలు తీస్తుంది, స్థిర నియమాలు ప్రాధాన్యత నిర్ణయిస్తాయి, అందుకే ప్రతి నిర్ణయాన్ని వివరించవచ్చు.",
          "Sarvam turns speech into text, the AI model pulls out the facts, and fixed rules set the priority, so every decision can be explained.",
        )}
      </p>
    </Panel>
  );
}

function IncidentResult({ incident, t }: { incident: Incident; t: T }) {
  const c = PRIORITY[incident.priority];
  return (
    <section className="animate-scale-in overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-emerald-800">
          <ShieldCheck className="h-5 w-5" /> {incident.id} {t("నమోదైంది", "registered")}
        </div>
        <PrioBadge p={incident.priority} size="md" />
      </div>
      <div className="space-y-2 p-4 text-sm">
        <p className="font-medium text-slate-900">{incident.summary}</p>
        <p className="text-xs text-slate-500">
          <span className="font-semibold" style={{ color: c.color }}>
            {t("ఎందుకు:", "Why:")}
          </span>{" "}
          {incident.reasons.join("; ")} · via {CHANNEL[incident.channel]}
        </p>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          {incident.team ? (
            <span className="font-semibold text-slate-900">
              {incident.team.type === "boat" ? "🚤" : incident.team.type === "medical" ? "🚑" : "🚚"} {t("ఆటో-డిస్పాచ్:", "Auto-dispatched:")} {incident.team.name} ·{" "}
              {incident.team.km} km · ETA {incident.team.eta} min
            </span>
          ) : (
            <span className="text-slate-700">
              {t("దగ్గరి టీమ్‌ని కేటాయించడానికి కంట్రోల్ రూమ్ క్యూలో ఉంది.", "Queued for the control-room operator to assign the nearest team.")}
            </span>
          )}
        </div>
        <Link
          to="/console/sos"
          className="press inline-flex items-center gap-1.5 rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]"
        >
          {t("కంట్రోల్ రూమ్ మ్యాప్‌లో చూడండి", "See it on the Control Room map")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function TextSos({ onIncident, t, lang }: { onIncident: (i: Incident) => void; t: T; lang: string }) {
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await sosApi<{ incident: Incident }>("/text", { message: msg, channel });
      onIncident(r.incident);
      setMsg("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={t("టెక్స్ట్ SOS పంపండి", "Send a text SOS")}
      sub={t(
        "మాట్లాడలేకపోతున్నారా? WhatsApp / SMS మెసేజ్ ఏ భాషలోనైనా టైప్ చేయండి. AI దాన్ని కూడా అలాగే చదువుతుంది.",
        "Can't talk? Type or paste a WhatsApp / SMS message in any language. The AI reads it the same way.",
      )}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {[...TEXT_SAMPLES_EN.map((s) => ({ label: s, text: s })), { label: `Telugu · ${TEXT_SAMPLES_TE[0]}`, text: TEXT_SAMPLES_TE[0] }].map((s) => (
          <button
            key={s.label}
            onClick={() => setMsg(s.text)}
            className="max-w-full truncate rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-solid hover:border-[#e11d48] hover:text-[#e11d48]"
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        placeholder={t("ఉదా: మేము సింగ్ నగర్ లో ఉన్నాం, 4 మంది, నీళ్ళు నడుము వరకు…", "e.g. We are in Singh Nagar, 4 people, water up to the waist…")}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-[#e11d48] focus:ring-2 focus:ring-rose-100"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="social">Social media</option>
        </select>
        <button
          onClick={send}
          disabled={busy || !msg.trim()}
          className="press inline-flex items-center gap-2 rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("SOS పంపండి", "Send SOS")}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </Panel>
  );
}

export default function SosPage() {
  const { lang, t } = useLang();
  const [fields, setFields] = useState<Fields>({});
  const [captured, setCaptured] = useState<Record<string, unknown>>({});
  const [preview, setPreview] = useState<Triage | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);

  function onUpdate(r: Reply) {
    if (!r) return;
    if (r.sessionId && r.said === undefined && !r.done) setIncident(null);
    setFields(r.fields || {});
    setCaptured(r.captured || {});
    setPreview(r.preview || null);
    if (r.done && r.result?.incident) setIncident(r.result.incident);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="relative mb-6 animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-[#e11d48] to-[#9f1239] p-5 text-white shadow-[0_18px_40px_-22px_rgba(225,29,72,0.6)] sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-24 h-56 w-56 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:h-14 sm:w-14">
              <Siren className="h-6 w-6 sm:h-7 sm:w-7" />
            </span>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/80">{t("ప్రజా భద్రత · అత్యవసర SOS", "Public safety · Disaster SOS")}</div>
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-4xl">{t("అత్యవసర సహాయం", "Disaster SOS")}</h1>
              <p className="text-base font-medium text-rose-100 sm:text-lg">{t("మీ భాషలో AI వాయిస్ హెల్ప్‌లైన్", "AI voice helpline · speaks Telugu")}</p>
              <p className="mt-2 max-w-2xl text-sm text-rose-50/90">
                {t(
                  "వరదలో చిక్కుకున్నారా? మీ భాషలో మాట్లాడండి. AI మీ వివరాలు అడిగి, ప్రాధాన్యత నిర్ణయించి, దగ్గర్లోని రెస్క్యూ టీమ్‌కి పంపిస్తుంది.",
                  "Stuck in a flood? Just speak. The AI asks what it needs, sets the priority and sends the nearest rescue team.",
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="tel:112" className="sos-ring-white press inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#be123c]">
              <Phone className="h-4 w-4" /> 112
            </a>
            <a href="tel:108" className="press inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white ring-1 ring-white/30">
              <Phone className="h-4 w-4" /> 108 {t("అంబులెన్స్", "Ambulance")}
            </a>
          </div>
        </div>
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-xs text-rose-50">
          <MapPin className="h-3.5 w-3.5" /> {t("పైలట్ ప్రాంతం: విజయవాడ · రెస్క్యూ టీమ్‌లు నమూనా", "Pilot area: Vijayawada · rescue teams are a sample deployment")}
        </p>
      </div>

      <CallIntro accent="sos" flow="sos" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 animate-fade-up space-y-5" style={{ animationDelay: "80ms" }}>
          <VoiceCall
            base="/api/sos/call"
            startBody={{}}
            title={t("మాట్లాడండి · AI వింటోంది", "Speak · the AI is listening")}
            accent="sos"
            samples={SAMPLES_TE}
            samplesByLang={{ te: SAMPLES_TE, en: SAMPLES_EN }}
            onUpdate={onUpdate}
            onDone={onUpdate}
          />
          <TextSos onIncident={(i) => setIncident(i)} t={t} lang={lang} />
        </div>
        <div className="min-w-0 animate-fade-up space-y-5" style={{ animationDelay: "160ms" }}>
          {incident && <IncidentResult incident={incident} t={t} />}
          <Understood fields={fields} captured={captured} preview={preview} t={t} />
          <Panel title={t("భద్రతా సూచనలు", "Stay safe")}>
            <ul className="space-y-2.5">
              {TIPS.map(({ icon: Icon, te, en }) => (
                <li key={en} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-[#e11d48]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1 text-sm font-medium text-slate-900">{t(te, en)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
