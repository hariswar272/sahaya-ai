import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Baby, CheckCircle2, HeartPulse, Pill, ShieldAlert } from "lucide-react";
import { api, type VoiceReply } from "@/lib/api";
import { useStream } from "@/lib/sse";
import { useLang } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Badge, PriorityBadge } from "@/components/ui";
import { VoiceCall } from "@/components/VoiceCall";

export type Risk = "high" | "medium" | "low";
export type ProgramId = "anc" | "ncd" | "tb";
export type CallRecord = {
  at: number;
  risk: Risk | null;
  reasons: string[];
  summary: string;
  answers?: Record<string, boolean | number>;
  action?: string;
  via: string;
  transcript?: { who: string; text: string }[];
};
export type Patient = {
  id: string;
  name: string;
  program: ProgramId;
  detail: string;
  createdAt?: number;
  source?: string;
  lang?: string;
  nextCallDue: number;
  lastCall: CallRecord | null;
  history: CallRecord[];
};
export type FieldMeta = { en: string; te: string; type: "bool" | "int"; bad?: boolean };
export type ProgramMeta = { label: string; te: string; fields: Record<string, FieldMeta>; questions: { key: string; te: string; en: string; fields: string[] }[] };
export type Programs = Record<ProgramId, ProgramMeta>;
export type Stats = {
  patients: number;
  callsToday: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  notCalled: number;
  adherencePct: number;
  dueNow: number;
  byProgram: Record<ProgramId, number>;
};

export const PROGRAM_UI: Record<ProgramId, { icon: ReactNode; te: string; en: string; short: string; asks: string; asksTe: string }> = {
  anc: {
    icon: <Baby aria-hidden="true" className="h-5 w-5" />, te: "గర్భిణీ సంరక్షణ", en: "Pregnancy care (ANC)", short: "Pregnancy care",
    asks: "Bleeding, swelling, headache or blurred vision, baby movements, iron tablets, next check-up",
    asksTe: "రక్తస్రావం, వాపు, తలనొప్పి / మసక చూపు, బిడ్డ కదలికలు, ఐరన్ మాత్రలు, తదుపరి చెకప్",
  },
  ncd: {
    icon: <HeartPulse aria-hidden="true" className="h-5 w-5" />, te: "బీపీ / షుగర్", en: "BP & diabetes (NCD)", short: "BP & diabetes",
    asks: "Tablets today, missed days, chest pain or dizziness, last sugar / BP reading",
    asksTe: "ఈరోజు మాత్రలు, మిస్ అయిన రోజులు, ఛాతీ నొప్పి / కళ్ళు తిరగడం, షుగర్ / బీపీ రీడింగ్",
  },
  tb: {
    icon: <Pill aria-hidden="true" className="h-5 w-5" />, te: "టీబీ చికిత్స", en: "TB treatment (DOTS)", short: "TB treatment",
    asks: "Daily tablets, missed doses, blood in cough, fever, yellow eyes or rash",
    asksTe: "రోజూ మాత్రలు, మిస్ అయిన డోసులు, దగ్గులో రక్తం, జ్వరం, కళ్ళు పసుపు / దద్దుర్లు",
  },
};

// Tappable patient replies for the demo call, in the visitor's language.
export const SAMPLES: Record<"te" | "en", Record<ProgramId, string[]>> = {
  te: {
    anc: ["లేదు, ఏమీ లేదు", "అవును, బిడ్డ బాగా కదులుతోంది", "ఐరన్ మాత్రలు వేసుకోవట్లేదు", "కొంచెం రక్తస్రావం అవుతోంది", "తెలుసు, వచ్చే సోమవారం"],
    ncd: ["అవును, ఈరోజు వేసుకున్నా", "రెండు రోజులు మిస్ అయ్యాయి", "ఏమీ లేవు", "ఛాతీ నొప్పిగా ఉంది", "షుగర్ 250"],
    tb: ["అవును, రోజూ వేసుకుంటున్నా", "ఒక్క డోస్ కూడా మిస్ కాలేదు", "ఏమీ లేవు", "దగ్గులో రక్తం పడుతోంది"],
  },
  en: {
    anc: ["No, nothing like that", "Yes, the baby is moving well", "I'm not taking the iron tablets", "There is some bleeding", "Yes, it's next Monday"],
    ncd: ["Yes, I took them today", "I missed two days", "No, nothing", "I have chest pain", "My sugar was 250"],
    tb: ["Yes, I take them every day", "I haven't missed any dose", "No, nothing", "There is blood when I cough"],
  },
};

export const RISK_LABEL: Record<Risk, [string, string]> = {
  high: ["ప్రమాదం ఎక్కువ", "Needs care today"],
  medium: ["జాగ్రత్త అవసరం", "Follow up soon"],
  low: ["బాగానే ఉంది", "All fine"],
};

export function RiskBadge({ risk, className }: { risk: Risk | null | undefined; className?: string }) {
  const { lang, t } = useLang();
  if (!risk) return <Badge className={className}>{t("ఇంకా కాల్ చేయలేదు", "Not called yet")}</Badge>;
  return <PriorityBadge p={risk} bilingual={lang === "te"} className={className} />;
}

export function ProgramBadge({ program }: { program: ProgramId }) {
  const { t } = useLang();
  return (
    <Badge tone="arogya" className="gap-1">
      {t(PROGRAM_UI[program].te, PROGRAM_UI[program].short)}
    </Badge>
  );
}

export function dueLabel(ts: number) {
  const d = ts - Date.now();
  if (d <= 0) return "Due now";
  const h = Math.round(d / 3600000);
  if (h < 24) return `Due in ${Math.max(1, h)} h`;
  return `Due in ${Math.round(h / 24)} d`;
}

/** Patients + programme metadata, kept live from the server stream. */
export function usePatients() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [programs, setPrograms] = useState<Programs | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const r = await api<{ patients: Patient[]; programs: Programs }>("/api/arogya/patients");
      setPatients(r.patients);
      setPrograms(r.programs);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  // Records are created by real calls, so a patient we haven't seen yet is new: put it on top.
  useStream("arogya:patient", (p: Patient) =>
    setPatients((list) => (list ? (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]) : [p])),
  );
  useStream("arogya:reset", () => reload());
  return { patients, programs, error, reload };
}

/** The answers the AI recorded, coloured by whether each one is a warning sign. */
export function AnswerList({ program, answers, programs, compact }: { program: ProgramId; answers: Record<string, any> | undefined; programs: Programs | null; compact?: boolean }) {
  const { lang, t } = useLang();
  const meta = programs?.[program];
  if (!meta || !answers) return null;
  const rows = Object.entries(meta.fields).filter(([k]) => answers[k] !== undefined && answers[k] !== null);
  if (!rows.length) return <div className="text-sm text-slate-400">{t("ఇంకా జవాబులు లేవు.", "No answers yet.")}</div>;
  return (
    <div className={cn("grid gap-1.5", compact ? "" : "sm:grid-cols-2")}>
      {rows.map(([k, f]) => {
        const v = answers[k];
        const warn = f.type === "bool" ? (f.bad === true ? v === true : f.bad === false ? v === false : false) : false;
        const text = f.type === "bool" ? (v ? t("అవును", "Yes") : t("లేదు", "No")) : String(v);
        return (
          <div key={k} className={cn("flex animate-fade-up items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm", warn ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50")}>
            <span className="min-w-0">
              <span className="te block font-medium text-ink">{t(f.te, f.en)}</span>
              {lang === "te" && <span className="block text-xs text-slate-500">{f.en}</span>}
            </span>
            <span className={cn("shrink-0 font-bold", warn ? "text-critical" : "text-low")}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Reasons({ reasons, risk }: { reasons: string[]; risk: Risk | null }) {
  return (
    <ul className="space-y-1">
      {reasons.map((r) => (
        <li key={r} className="flex items-start gap-2 text-sm text-slate-700">
          {risk === "low" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-low" /> : <ShieldAlert aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", risk === "high" ? "text-critical" : "text-medium")} />}
          {r}
        </li>
      ))}
    </ul>
  );
}

/**
 * An AI follow-up call where the browser user answers as the patient.
 * Pass `patient` to re-call an existing record, or `intake` ({name, program})
 * to start a brand-new record from the public page.
 */
export function CallPanel({
  patient,
  intake,
  programs,
  onDone,
}: {
  patient?: Patient;
  intake?: { name: string; program: ProgramId };
  programs: Programs | null;
  onDone?: (result: any) => void;
}) {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [preview, setPreview] = useState<{ risk: Risk; reasons: string[] } | null>(null);
  const [result, setResult] = useState<any>(null);
  const { t } = useLang();
  const name = patient?.name ?? intake?.name ?? "";
  const program: ProgramId = patient?.program ?? intake?.program ?? "anc";
  const startBody = patient ? { patientId: patient.id } : { name, program };
  const callKey = patient ? patient.id : `${name}|${program}`;

  const side = (
    <div className="space-y-3">
      <div className="rounded-2xl border border-arogya-200 bg-arogya-50 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-arogya-700">{t("కాల్ చేస్తోంది", "Calling")}</div>
        <div className="te mt-1 text-lg font-bold text-ink">{name || t("మీరు", "You")}</div>
        <div className="mt-1 text-sm font-medium text-arogya-700">{patient?.detail || t(PROGRAM_UI[program].te, PROGRAM_UI[program].en)}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("AI నమోదు చేసినవి", "What the AI recorded")}</div>
          {preview && <RiskBadge risk={preview.risk} />}
        </div>
        {Object.keys(fields).length ? (
          <AnswerList program={program} answers={fields} programs={programs} compact />
        ) : (
          <div className="text-sm text-slate-400">{t("పేషెంట్ మాట్లాడుతున్నప్పుడు జవాబులు ఇక్కడ కనిపిస్తాయి.", "Answers appear here as the patient speaks.")}</div>
        )}
      </div>
      {result && (
        <div className={cn("animate-scale-in rounded-2xl border p-4", result.risk === "high" ? "border-red-200 bg-red-50" : result.risk === "medium" ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50")}>
          <div className="mb-1 flex items-center gap-2">
            <RiskBadge risk={result.risk} />
            <span className="te text-sm font-semibold">{t(...(RISK_LABEL[result.risk as Risk] ?? RISK_LABEL.low))}</span>
          </div>
          <div className="mb-2 text-sm font-semibold text-ink">
            {t("తదుపరి చర్య", "Next step")}: {result.action}
          </div>
          <Reasons reasons={result.reasons} risk={result.risk} />
        </div>
      )}
    </div>
  );

  return (
    <VoiceCall
      key={callKey}
      base="/api/arogya/call"
      startBody={startBody}
      title={t(`AI ఫాలో-అప్ కాల్ · ${name}`, `AI follow-up call · ${name}`)}
      accent="arogya"
      startLabel={t("సహాయతో మాట్లాడండి", "Talk to Sahaya now")}
      samples={SAMPLES.te[program]}
      samplesEn={SAMPLES.en[program]}
      side={side}
      onUpdate={(r: VoiceReply) => {
        // The start reply carries no `captured`; it opens a fresh call.
        if (r.captured === undefined && !r.done) {
          setResult(null);
          setFields({});
          setPreview(null);
          return;
        }
        if (r.fields) setFields({ ...r.fields });
        if (r.preview !== undefined) setPreview(r.preview);
      }}
      onDone={(r: VoiceReply) => {
        setResult(r.result);
        onDone?.(r.result);
      }}
    />
  );
}

export function HistoryList({ history, programs, program }: { history: CallRecord[]; programs: Programs | null; program: ProgramId }) {
  const { t } = useLang();
  if (!history.length) return <div className="text-sm text-slate-400">{t("ఇంకా కాల్స్ లేవు.", "No calls yet.")}</div>;
  return (
    <ol className="space-y-3">
      {history.map((h, i) => (
        <li key={`${h.at}-${i}`} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {h.via === "no-answer" ? <Badge>No answer</Badge> : <RiskBadge risk={h.risk} />}
            <span className="text-xs text-slate-500">
              {timeAgo(h.at)} · {h.via === "ai-campaign" ? "Campaign call" : h.via === "no-answer" ? "Campaign call" : "AI call"}
            </span>
          </div>
          <div className="mt-1.5 text-sm text-slate-700">{h.summary}</div>
          {i === 0 && h.answers && (
            <div className="mt-2">
              <AnswerList program={program} answers={h.answers} programs={programs} compact />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
