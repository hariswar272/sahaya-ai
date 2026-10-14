// ASHA / PHC console: patient risk list, check-in details and call campaigns for Arogya Call.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, ExternalLink, Loader2, PhoneCall, PhoneMissed, PhoneOutgoing, RotateCcw, ShieldAlert, Stethoscope, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { useStream } from "@/lib/sse";
import { useLang } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CountUp, DemoNote, EmptyState, Select, Spinner } from "@/components/ui";
import { PageHeader, Stat } from "../_kit";
import { AnswerList, CallPanel, HistoryList, PROGRAM_UI, ProgramBadge, Reasons, RiskBadge, dueLabel, usePatients, type Patient, type ProgramId, type Risk, type Stats } from "./shared";

type CampaignEvent = {
  status: "started" | "calling" | "done" | "no_answer" | "finished";
  index?: number;
  total?: number;
  patientId?: string;
  name?: string;
  program?: ProgramId;
  village?: string;
  risk?: Risk;
  summary?: string;
  high?: number;
  medium?: number;
  low?: number;
  noAnswer?: number;
};

const RISK_COLORS: Record<string, string> = { High: "#ea580c", Medium: "#ca8a04", Low: "#16a34a", "Not called": "#94a3b8" };

export default function ArogyaConsole() {
  const { lang, t } = useLang();
  const { patients, programs, error, reload } = usePatients();
  const [stats, setStats] = useState<Stats | null>(null);
  const [program, setProgram] = useState<"all" | ProgramId>("all");
  const [risk, setRisk] = useState<"all" | Risk | "none">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const statsTimer = useRef<number>();

  const loadStats = useCallback(() => {
    window.clearTimeout(statsTimer.current);
    statsTimer.current = window.setTimeout(() => {
      api<Stats>("/api/arogya/stats").then(setStats).catch(() => {});
    }, 150);
  }, []);
  useEffect(() => loadStats(), [loadStats]);
  useStream("arogya:patient", loadStats);
  useStream("arogya:reset", () => {
    setEvents([]);
    loadStats();
  });
  useStream("arogya:campaign", (e: CampaignEvent) => {
    if (e.status === "started") {
      setRunning(true);
      setEvents([e]);
      return;
    }
    setEvents((list) => {
      // A finished call replaces its own "calling" row.
      const rest = e.patientId && e.status !== "calling" ? list.filter((x) => !(x.patientId === e.patientId && x.status === "calling")) : list;
      return [...rest, e];
    });
    if (e.status === "finished") setRunning(false);
  });

  const list = useMemo(
    () =>
      (patients || []).filter(
        (p) => (program === "all" || p.program === program) && (risk === "all" || (risk === "none" ? !p.lastCall : p.lastCall?.risk === risk)),
      ),
    [patients, program, risk],
  );
  const open = patients?.find((p) => p.id === openId) || null;

  const chart = stats
    ? [
        { name: "High", value: stats.highRisk },
        { name: "Medium", value: stats.mediumRisk },
        { name: "Low", value: stats.lowRisk },
        { name: "Not called", value: stats.notCalled },
      ]
    : [];

  async function runCampaign() {
    setNote("");
    try {
      const r = await api<{ started: boolean; total: number; message?: string }>("/api/arogya/campaign", program === "all" ? {} : { program });
      if (!r.started) setNote(r.message || "No calls are due right now.");
      else setRunning(true);
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function resetDemo() {
    setNote("");
    await api("/api/arogya/reset", {}).catch((e) => setNote((e as Error).message));
    setEvents([]);
    reload();
    loadStats();
  }

  const last = events[events.length - 1];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <PageHeader
        te="ASHA డ్యాష్‌బోర్డ్: ఆరోగ్య కాల్స్"
        en="ASHA dashboard: today's AI follow-up calls"
        eyebrow={t("ఆరోగ్య కాల్ · అధికారుల కన్సోల్", "Arogya Call · Officials console")}
        accent="arogya"
        icon={<Stethoscope aria-hidden="true" className="h-6 w-6" />}
        description={t(
          "AI కాల్ చేయాల్సిన ప్రతి పేషెంట్‌కు కాల్ చేసి, జవాబులు నమోదు చేసి, ఈరోజు ఎవరిని కలవాలో చూపిస్తుంది. ప్రతి అలర్ట్‌కు కారణం కూడా చూపిస్తుంది.",
          "The AI calls every due patient, records their answers and flags who needs a home visit today. Each flag shows the rule that raised it.",
        )}
        actions={
          <>
            <Button accent="arogya" className="press" icon={<PhoneOutgoing aria-hidden="true" className="h-4 w-4" />} loading={running} onClick={runCampaign}>
              {running ? t("కాల్స్ చేస్తోంది…", "Calling patients…") : t("ఈరోజు కాల్స్ మొదలుపెట్టండి", "Run today's call campaign")}
            </Button>
            <Button variant="secondary" className="press" icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />} onClick={resetDemo}>
              {t("డెమో రీసెట్", "Reset demo")}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 text-arogya" />
          {t("డెమో కన్సోల్ · రికార్డులు 48 గంటల తర్వాత ఆటోమేటిక్‌గా తొలగిపోతాయి", "Demo console · records auto-delete after 48 h")}
        </span>
        <Link to="/arogya" className="inline-flex items-center gap-1 text-sm font-semibold text-arogya-700 hover:underline">
          {t("పేషెంట్‌గా కాల్ ప్రయత్నించండి", "Try a call as a patient")} <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        {note && <span className="text-sm font-medium text-amber-700">{note}</span>}
        {error && <span role="alert" className="text-sm font-medium text-red-700">{error}</span>}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("పేషెంట్లు", "Patients")}
          value={stats ? <CountUp value={stats.patients} /> : "–"}
          hint={stats ? `ANC ${stats.byProgram.anc} · NCD ${stats.byProgram.ncd} · TB ${stats.byProgram.tb}` : undefined}
          icon={<Users aria-hidden="true" className="h-4 w-4" />}
        />
        <Stat
          label={t("ఈరోజు AI కాల్స్", "AI calls today")}
          value={stats ? <CountUp value={stats.callsToday} /> : "–"}
          hint={stats ? t(`${stats.dueNow} ఇప్పుడు చేయాలి`, `${stats.dueNow} due now`) : undefined}
          icon={<PhoneCall aria-hidden="true" className="h-4 w-4" />}
          tone="arogya"
        />
        <Stat
          label={t("ప్రమాదం ఎక్కువ", "High risk")}
          value={stats ? <CountUp value={stats.highRisk} /> : "–"}
          hint={t("ఈరోజే ASHA సందర్శన", "ASHA visit today")}
          icon={<ShieldAlert aria-hidden="true" className="h-4 w-4" />}
          tone="high"
        />
        <Stat
          label={t("మందులు సక్రమంగా", "Medicine adherence")}
          value={stats ? <CountUp value={stats.adherencePct} suffix="%" /> : "–"}
          hint={t("తాజా కాల్స్ ప్రకారం", "from latest calls")}
          icon={<Activity aria-hidden="true" className="h-4 w-4" />}
          tone="low"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title={t("పేషెంట్లు", "Patients")}
            subtitle={t("ప్రమాదం, తదుపరి కాల్ సమయం ప్రకారం", "Sorted by risk, then by when the next call is due")}
            action={
              <div className="flex gap-2">
                <Select className="h-9 w-auto text-sm" value={program} onChange={(e) => setProgram(e.target.value as typeof program)} aria-label="Programme">
                  <option value="all">All programmes</option>
                  <option value="anc">Pregnancy (ANC)</option>
                  <option value="ncd">BP / Diabetes</option>
                  <option value="tb">TB</option>
                </Select>
                <Select className="h-9 w-auto text-sm" value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)} aria-label="Risk">
                  <option value="all">All risks</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">Not called</option>
                </Select>
              </div>
            }
          />
          {!patients ? (
            <div className="grid h-40 place-items-center">
              <Spinner />
            </div>
          ) : !patients.length ? (
            <EmptyState
              icon={<PhoneCall aria-hidden="true" className="h-8 w-8" />}
              title={t("ఇంకా కాల్స్ లేవు", "No patient calls yet")}
              hint={t("ఎవరైనా /arogya నుంచి కాల్ చేసిన వెంటనే వారు ఇక్కడ లైవ్‌గా కనిపిస్తారు.", "When someone talks to Sahaya on the Arogya page, their record appears here live.")}
            />
          ) : !list.length ? (
            <EmptyState icon={<Users aria-hidden="true" className="h-8 w-8" />} title="No patients match these filters" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p, i) => (
                <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, animationFillMode: "both" }}>
                  <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5">
                    <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", p.lastCall?.risk === "high" ? "animate-pulse-ring bg-high" :p.lastCall?.risk === "medium" ? "bg-medium" : p.lastCall ? "bg-low" : "bg-slate-300")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="te font-semibold text-ink">{p.name}</span>
                        {p.createdAt ? <span className="text-xs text-slate-400">{timeAgo(p.createdAt)}</span> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <ProgramBadge program={p.program} />
                        {p.detail && <span>{p.detail}</span>}
                        {p.source && <span className="capitalize">· {p.source}</span>}
                      </div>
                      <div className="mt-1 line-clamp-1 text-sm text-slate-600">{p.lastCall ? `${p.lastCall.summary} · ${timeAgo(p.lastCall.at)}` : "Not called yet"}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <RiskBadge risk={p.lastCall?.risk} />
                      <span className={cn("text-xs font-medium", p.nextCallDue <= Date.now() ? "text-arogya-700" : "text-slate-400")}>{dueLabel(p.nextCallDue)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("తాజా కాల్స్ ప్రమాద స్థాయి", "Risk from latest calls")} subtitle={t("కాల్ అయిన వెంటనే మారుతుంది", "Live as calls finish")} icon={<Activity aria-hidden="true" className="h-4 w-4" />} />
            <div className="h-48 px-2 py-3">
              {stats ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {chart.map((d) => (
                        <Cell key={d.name} fill={RISK_COLORS[d.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center">
                  <Spinner />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("కాల్ క్యాంపెయిన్", "Call campaign")}
              subtitle={running ? t("AI పేషెంట్లకు కాల్ చేస్తోంది…", "AI is calling due patients…") : t("కాల్ చేయాల్సిన ప్రతి ఒక్కరికీ వరుసగా", "Calls every patient who is due, one after another")}
              icon={<PhoneOutgoing aria-hidden="true" className="h-4 w-4" />}
            />
            <div className="max-h-[360px] overflow-y-auto px-4 py-3">
              {!events.length ? (
                <div className="text-sm text-slate-500">{t("ఈరోజు లిస్ట్‌ను AI ఎలా పూర్తి చేస్తుందో చూడటానికి పై బటన్ నొక్కండి.", "Press \"Run today's call campaign\" to watch the AI work through today's list.")}</div>
              ) : (
                <ul className="space-y-2">
                  {events
                    .filter((e) => e.status !== "started" && e.status !== "finished")
                    .map((e, i) => (
                      <li key={`${e.patientId}-${e.status}-${i}`} className="flex animate-slide-in-right items-start gap-2.5 text-sm">
                        {e.status === "calling" ? (
                          <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-arogya" />
                        ) : e.status === "no_answer" ? (
                          <PhoneMissed aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        ) : e.risk === "high" ? (
                          <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-high" />
                        ) : (
                          <CheckCircle2 aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", e.risk === "medium" ? "text-medium" : "text-low")} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="font-semibold text-ink hover:underline" onClick={() => e.patientId && setOpenId(e.patientId)}>
                              {e.name}
                            </button>
                            <span className="text-xs text-slate-400">
                              {e.index}/{e.total} · {e.village}
                            </span>
                            {e.status === "done" && <RiskBadge risk={e.risk} />}
                            {e.status === "no_answer" && <Badge>No answer · retry in 2 h</Badge>}
                          </div>
                          {e.status === "calling" && <div className="text-slate-500">Calling…</div>}
                          {e.summary && <div className="text-slate-600">{e.summary}</div>}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
              {last?.status === "finished" && (
                <div className="mt-3 rounded-xl border border-arogya-200 bg-arogya-50 px-3 py-2 text-sm font-medium text-arogya-700">
                  Done: {last.total} calls · {last.high} high · {last.medium} medium · {last.low} low · {last.noAnswer} no answer
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {open && <PatientDrawer patient={open} programs={programs} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function PatientDrawer({ patient, programs, onClose }: { patient: Patient; programs: ReturnType<typeof usePatients>["programs"]; onClose: () => void }) {
  const { lang, t } = useLang();
  const [calling, setCalling] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className={cn("h-full w-full animate-slide-in-right overflow-y-auto bg-page shadow-2xl", calling ? "max-w-5xl" : "max-w-xl")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${patient.name} details`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="te text-lg font-extrabold text-ink">{patient.name}</h2>
              <RiskBadge risk={patient.lastCall?.risk} />
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {[patient.createdAt ? `${t("నమోదు", "Added")} ${timeAgo(patient.createdAt)}` : "", patient.source ?? ""].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-arogya-700">{PROGRAM_UI[patient.program].icon}</span>
              <span className="font-medium text-ink">{patient.detail || t(PROGRAM_UI[patient.program].te, PROGRAM_UI[patient.program].en)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {calling ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-600">You answer as {patient.name}. The AI asks the questions.</div>
                <Button variant="ghost" size="sm" onClick={() => setCalling(false)}>
                  Back to details
                </Button>
              </div>
              <CallPanel patient={patient} programs={programs} />
            </div>
          ) : (
            <>
              <Button accent="arogya" size="lg" className="press w-full" icon={<PhoneCall aria-hidden="true" className="h-5 w-5" />} onClick={() => setCalling(true)}>
                {t("ఇప్పుడే AI కాల్ చేయండి", "Call now (AI)")}
              </Button>
              {patient.lastCall && (
                <Card className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest call · {timeAgo(patient.lastCall.at)}</div>
                    <RiskBadge risk={patient.lastCall.risk} />
                  </div>
                  {patient.lastCall.action && <div className="mb-2 text-sm font-semibold text-ink">Next step: {patient.lastCall.action}</div>}
                  <Reasons reasons={patient.lastCall.reasons} risk={patient.lastCall.risk} />
                  {patient.lastCall.answers && (
                    <div className="mt-3">
                      <AnswerList program={patient.program} answers={patient.lastCall.answers} programs={programs} />
                    </div>
                  )}
                  {patient.lastCall.transcript && patient.lastCall.transcript.length > 0 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-semibold text-arogya-700">Call transcript</summary>
                      <div className="mt-2 space-y-1.5">
                        {patient.lastCall.transcript.map((t, i) => (
                          <div key={i} className="te leading-relaxed">
                            <span className="mr-1 text-xs font-bold uppercase text-slate-400">{t.who === "agent" ? "AI" : "Patient"}</span>
                            {t.text}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </Card>
              )}
              <Card className="p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Call history</div>
                <HistoryList history={patient.history} programs={programs} program={patient.program} />
              </Card>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
