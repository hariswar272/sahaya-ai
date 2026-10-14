import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, PhoneCall, PhoneOff, Radio, ShieldCheck } from "lucide-react";
import type { ModuleDef } from "../types";
import { api } from "@/lib/api";
import { useStream } from "@/lib/sse";
import { useLang } from "@/lib/i18n";
import { Badge, Bi, Button, Card, CardHeader, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { PageHeader } from "../_kit";
import { cn } from "@/lib/utils";

type Status = {
  provider: "samvaad" | "plivo" | null;
  configured: boolean;
  missing: string[];
  whitelisted: number;
  active: number;
  maxActive: number;
  maxMinutes: number;
  webhook: { url: string; secretSet: boolean } | null;
};
type Line = { who: "agent" | "caller"; te?: string; en?: string; text?: string };
type Call = { id: string; flow: string; provider: string; to: string; status: string; createdAt: number; transcript: Line[]; result?: any; error?: string };
type Patient = { id: string; name: string; program: string; detail?: string; village?: string };

const FLOWS = [
  { id: "arogya", te: "ఆరోగ్య కాల్ (ఆరోగ్య ఫాలో-అప్)", en: "Arogya Call (health follow-up)" },
  { id: "sos", te: "అత్యవసర సహాయం (వరదలు)", en: "Disaster SOS" },
  { id: "rythu", te: "రైతు కాల్", en: "Rythu Call (farmer)" },
  { id: "scam", te: "మోసం గుర్తింపు", en: "Scam Shield" },
];

const LIVE = ["dialing", "ringing", "answered", "turn", "processing"];

const STATUS: Record<string, { te: string; en: string; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  dialing: { te: "డయల్ చేస్తోంది", en: "Dialing", tone: "info" },
  ringing: { te: "రింగ్ అవుతోంది", en: "Ringing", tone: "info" },
  answered: { te: "కాల్ ఎత్తారు", en: "Answered", tone: "success" },
  turn: { te: "మాట్లాడుతున్నారు", en: "In conversation", tone: "success" },
  processing: { te: "ఫలితం తయారవుతోంది", en: "Processing", tone: "info" },
  completed: { te: "పూర్తయింది", en: "Completed", tone: "success" },
  failed: { te: "విఫలమైంది", en: "Failed", tone: "danger" },
  busy: { te: "బిజీ", en: "Busy", tone: "warning" },
  "no-answer": { te: "ఎత్తలేదు", en: "No answer", tone: "warning" },
  unknown: { te: "తెలియదు", en: "Unknown", tone: "neutral" },
};

function resultLine(r: any): string {
  if (!r) return "";
  const inc = r.incident ?? (r.id && r.priority ? r : null);
  if (inc) return `SOS ${inc.id} · ${inc.priority}${inc.team ? ` · ${inc.team.name}, ETA ${inc.team.eta} min` : ""}`;
  if (r.risk) return `Risk: ${String(r.risk).toUpperCase()}${r.reasons?.length ? ` · ${r.reasons.join("; ")}` : ""}`;
  if (r.verdict) return `Verdict: ${r.verdict}${r.scam_type && r.scam_type !== "none" ? ` · ${r.scam_type}` : ""}`;
  if (r.said) return `Caller asked: ${r.said}`;
  return "";
}

function StatusBadge({ s }: { s: string }) {
  const { t } = useLang();
  const m = STATUS[s] ?? STATUS.unknown;
  return <Badge tone={m.tone}>{t(m.te, m.en)}</Badge>;
}

/** Animated bars shown while a call is live. */
function Wave() {
  return (
    <span className="inline-flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-1 rounded-full bg-emerald-500 animate-wave" style={{ height: "100%", animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

function Transcript({ lines }: { lines: Line[] }) {
  const { t } = useLang();
  if (!lines.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "max-w-[88%] rounded-2xl px-3 py-2 text-sm animate-slide-in-right",
            l.who === "agent" ? "self-start bg-slate-100" : "self-end bg-emerald-50 text-emerald-900",
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{l.who === "agent" ? t("AI ఏజెంట్", "AI agent") : t("కాలర్", "Caller")}</div>
          <div className="te">{l.te || l.text}</div>
          {l.en ? <div className="mt-0.5 text-xs text-slate-500">{l.en}</div> : null}
        </div>
      ))}
    </div>
  );
}

function PhoneConsole() {
  const { t } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [flow, setFlow] = useState("arogya");
  const [patientId, setPatientId] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api<Status>("/api/phone/status").then(setStatus).catch(() => {});
    api<{ calls: Call[] }>("/api/phone/calls").then((j) => setCalls(j.calls)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    api<any>("/api/arogya/patients")
      .then((j) => {
        const list: Patient[] = Array.isArray(j) ? j : j.patients || [];
        setPatients(list);
        if (list[0]) setPatientId(String(list[0].id));
      })
      .catch(() => {});
  }, [refresh]);

  useStream("phone:call", (e: any) => {
    setCalls((prev) => {
      const i = prev.findIndex((c) => c.id === e.id);
      const base: Call = i >= 0 ? prev[i] : { id: e.id, flow: e.flow, provider: e.provider, to: e.to, status: e.status, createdAt: e.at, transcript: [] };
      let transcript = base.transcript;
      if (Array.isArray(e.transcript)) transcript = e.transcript;
      else if (e.said || e.reply?.length) {
        transcript = [
          ...transcript,
          ...(e.said ? [{ who: "caller" as const, text: e.said }] : []),
          ...(e.reply || []).map((l: any) => ({ who: "agent" as const, te: l.te, en: l.en })),
        ];
      }
      const next: Call = { ...base, status: e.status, transcript, result: e.result ?? base.result, error: e.error ?? base.error };
      const out = i >= 0 ? prev.map((c, k) => (k === i ? next : c)) : [next, ...prev];
      return out.slice(0, 15);
    });
    if (!LIVE.includes(e.status)) api<Status>("/api/phone/status").then(setStatus).catch(() => {});
  });

  async function place() {
    setError("");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/phone/call", { flow, to, startBody: flow === "arogya" ? { patientId } : {} });
      setCurrent(r.id);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function end(id: string) {
    try {
      await api("/api/phone/end", { id });
    } catch (e: any) {
      setError(e.message);
    }
  }

  const ready = !!status?.configured;
  const live = calls.find((c) => c.id === current) ?? null;
  const isLive = !!live && LIVE.includes(live.status);
  const providerName = status?.provider === "samvaad" ? "Sarvam Samvaad" : status?.provider === "plivo" ? "Plivo" : t("కాన్ఫిగర్ కాలేదు", "Not configured");
  const flowName = (id: string) => {
    const f = FLOWS.find((x) => x.id === id);
    return f ? t(f.te, f.en) : id;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <PageHeader
        te="నిజమైన ఫోన్ కాల్"
        en="Real phone call with the AI agent"
        accent="primary"
        eyebrow={t("నిజమైన కాల్స్ · తెలుగు AI ఏజెంట్", "Real calls · Telugu AI agent")}
        icon={<PhoneCall aria-hidden="true" className="h-6 w-6" />}
        description={t(
          "బ్రౌజర్ డెమోలోని అదే తెలుగు AI ఏజెంట్ నిజమైన ఫోన్‌కి కాల్ చేస్తుంది. అనుమతించిన డెమో నంబర్లకు మాత్రమే.",
          "The same Telugu AI agent from the browser demo calls a real phone. Only verified demo numbers can be dialled.",
        )}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-5">
          <Card className="animate-fade-up">
            <CardHeader
              title={<Bi te="కాలింగ్ స్థితి" en="Calling status" />}
              icon={<Radio aria-hidden="true" className="h-4 w-4" />}
              action={status ? <Badge tone={ready ? "success" : "warning"}>{providerName}</Badge> : <Spinner />}
            />
            <div className="space-y-2 px-4 py-4 text-sm sm:px-5">
              {status && !ready && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {t("ఈ సర్వర్‌లో నిజమైన కాల్స్ ఆఫ్ లో ఉన్నాయి.", "Real calls are switched off on this server.")}
                    {status.missing?.length ? ` ${t("కావాల్సినవి", "Missing")}: ${status.missing.join(", ")}.` : ` ${t("సర్వర్ env లో Samvaad లేదా Plivo సెట్టింగ్స్ జోడించండి.", "Add the Samvaad or Plivo settings to the server environment.")}`}{" "}
                    {t("ప్రతి మాడ్యూల్‌లో బ్రౌజర్ కాల్ పని చేస్తుంది.", "Browser calls on every module still work.")}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                <span>
                  {t("అనుమతించిన నంబర్లు", "Allowed numbers")}: <b className="text-ink">{status?.whitelisted ?? "–"}</b>
                </span>
                <span>
                  {t("లైవ్ కాల్స్", "Live calls")}: <b className="text-ink">{status ? `${status.active}/${status.maxActive}` : "–"}</b>
                </span>
                <span>
                  {t("గరిష్ఠ నిడివి", "Max length")}: <b className="text-ink">{status?.maxMinutes ?? 4} min</b>
                </span>
              </div>
              {status?.webhook && (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {t("Samvaad కాల్ తర్వాతి webhook", "Samvaad post-call webhook")}: <code className="break-all">{status.webhook.url}</code>{" "}
                  {status.webhook.secretSet ? <Badge tone="success">secret set</Badge> : <Badge tone="warning">PHONE_WEBHOOK_SECRET missing</Badge>}
                </div>
              )}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title={<Bi te="AI తో కాల్ చేయండి" en="Place an AI call" />} icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />} />
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <label className="block text-sm font-medium text-slate-600">
                {t("సేవ", "Flow")}
                <Select value={flow} onChange={(e) => setFlow(e.target.value)} className="mt-1">
                  {FLOWS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {t(f.te, f.en)}
                    </option>
                  ))}
                </Select>
              </label>
              {flow === "arogya" && (
                <label className="block text-sm font-medium text-slate-600">
                  {t("పేషెంట్ (డెమో డేటా)", "Patient (demo data)")}
                  <Select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="mt-1">
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.program}
                        {p.detail ? ` · ${p.detail}` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <label className="block text-sm font-medium text-slate-600">
                {t("మొబైల్ నంబర్", "Mobile number")}
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">+91</span>
                  <Input inputMode="tel" placeholder="98XXXXXXXX" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </label>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 animate-fade-up">{error}</div>}
              <Button
                size="lg"
                className="press w-full"
                icon={<PhoneCall aria-hidden="true" className="h-4 w-4" />}
                loading={busy}
                disabled={!ready || !to.trim() || (flow === "arogya" && !patientId)}
                onClick={place}
              >
                {t("ఈ నంబర్‌కి కాల్ చేయండి", "Call this number")}
              </Button>
              <p className="text-xs text-slate-500">
                {t(
                  "సర్వర్‌లో అనుమతించిన నంబర్లకు మాత్రమే కాల్ వెళ్తుంది. కాల్ చార్జీలు కాల్ చేసే అకౌంట్‌కి పడతాయి.",
                  "Calls only go to numbers on the server's allowed list. Call charges go to the account that places the call.",
                )}
              </p>
            </div>
          </Card>
        </div>

        <Card className="min-h-[420px] animate-fade-up">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Bi te="లైవ్ కాల్" en="Live call" />
                {isLive && <Wave />}
              </span>
            }
            icon={<PhoneCall aria-hidden="true" className="h-4 w-4" />}
            action={
              isLive && live?.provider === "plivo" ? (
                <Button size="sm" variant="danger" className="press" icon={<PhoneOff aria-hidden="true" className="h-4 w-4" />} onClick={() => end(live.id)}>
                  {t("ముగించు", "End")}
                </Button>
              ) : null
            }
          />
          <div className="px-4 py-4 sm:px-5">
            {!live ? (
              <EmptyState
                icon={<PhoneCall aria-hidden="true" className="h-10 w-10" />}
                title={t("ఇంకా కాల్ లేదు", "No call yet")}
                hint={t(
                  "కాల్ చేసి ఇక్కడ చూడండి: రింగ్, ప్రతి సంభాషణ మలుపు, డాష్‌బోర్డ్‌లకు వెళ్ళే ఫలితం.",
                  "Place a call and follow it here: ringing, every turn of the conversation, and the result the dashboards receive.",
                )}
              />
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge s={live.status} />
                  <span className="text-sm text-slate-500">
                    {flowName(live.flow)} · {live.to}
                  </span>
                </div>
                {live.error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 animate-fade-up">{live.error}</div>}
                {resultLine(live.result) && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 animate-fade-up">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    {resultLine(live.result)}
                  </div>
                )}
                <Transcript lines={live.transcript} />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-5 animate-fade-up">
        <CardHeader title={<Bi te="ఇటీవలి కాల్స్" en="Recent calls" />} />
        <div className="divide-y divide-slate-100">
          {calls.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">{t("ఇంకా కాల్స్ లేవు.", "No calls yet.")}</div>
          ) : (
            calls.map((c) => (
              <button
                key={c.id}
                onClick={() => setCurrent(c.id)}
                className={cn("press flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 sm:px-5", c.id === current && "bg-slate-50")}
              >
                <StatusBadge s={c.status} />
                <span className="font-medium text-ink">{flowName(c.flow)}</span>
                <span className="text-slate-500">{c.to}</span>
                <span className="text-slate-400">{c.provider}</span>
                <span className="ml-auto text-xs text-slate-400">{new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// "phone" isn't in ModuleDef's id union; the registry only reads `routes`, so the cast is safe.
const mod = { id: "phone", routes: [{ path: "/console/phone", element: <PhoneConsole /> }] } as unknown as ModuleDef;

export default mod;
