import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bug, CloudRain, Megaphone, PhoneCall, Play, RotateCcw, Send, Sprout, Sun, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, DemoNote, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { PageHeader, Stat } from "../_kit";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useStream } from "@/lib/sse";
import { cn, timeAgo } from "@/lib/utils";
import { RISK_LABEL, RISK_TONE, TrendIcon, cap, rupee, type Alert, type FarmerCall, type Meta } from "./parts";

type RiskRow = { district: string; te: string; risk: "high" | "medium" | "low"; rainDays: number; totalRain: number; maxProb: number; maxTemp: number; maxWind: number; flags: { heavyRain: boolean; heat: boolean } };
type BoardMandi = {
  mandi: string;
  te?: string;
  today?: number | null;
  modal?: number | null;
  min?: number | null;
  max?: number | null;
  change7d?: number | null;
  trend?: "rising" | "falling" | "steady" | null;
  district?: string;
  state?: string;
  date?: string;
};
type Board = { date?: string; note?: string; live?: boolean; source?: string; fetchedAt?: string | number; crops?: { crop: string; te: string; mandis: BoardMandi[] }[] };
type AlertType = "rain" | "heat" | "pest";

const TYPES: { id: AlertType; te: string; en: string }[] = [
  { id: "rain", te: "భారీ వర్షం", en: "Heavy rain" },
  { id: "heat", te: "వడగాలులు", en: "Heatwave" },
  { id: "pest", te: "పురుగు ఉధృతి", en: "Pest outbreak" },
];

const TYPE_ICON = { rain: CloudRain, heat: Sun, pest: Bug } as const;
const TYPE_TONE = { rain: "info", heat: "high", pest: "warning" } as const;

const STATUS: Record<FarmerCall["status"], { te: string; en: string; cls: string }> = {
  queued: { te: "వరుసలో", en: "Queued", cls: "border-slate-200 bg-slate-50 text-slate-500" },
  ringing: { te: "కాల్ అవుతోంది…", en: "Calling…", cls: "border-amber-300 bg-amber-50 text-amber-800 animate-pulse" },
  answered: { te: "విన్నారు", en: "Listened", cls: "border-green-200 bg-green-50 text-green-800" },
  no_answer: { te: "ఎత్తలేదు", en: "No answer", cls: "border-red-200 bg-red-50 text-red-700" },
  busy: { te: "బిజీ", en: "Busy", cls: "border-slate-300 bg-slate-100 text-slate-600" },
};

function play(b64?: string | null) {
  if (!b64) return;
  new Audio(`data:audio/wav;base64,${b64}`).play().catch(() => {});
}

function AlertCard({ a }: { a: Alert }) {
  const { lang, t } = useLang();
  const te = lang === "te";
  const Icon = TYPE_ICON[a.type];
  const c = a.counts;
  const seg = (n: number) => `${c.total ? (n / c.total) * 100 : 0}%`;
  return (
    <Card className="animate-fade-up p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TYPE_TONE[a.type]}><Icon aria-hidden="true" className="h-3.5 w-3.5" /> <span className={cn(te && "te")}>{t(a.labelTe, a.label)}</span></Badge>
        <span className={cn("font-semibold text-ink", te && "te")}>{t(a.districtTe, a.district)}</span>
        {(a.status as string) === "ready" || !c?.total ? (
          <Badge tone="info"><Send aria-hidden="true" className="h-3 w-3" /> {t("ప్రసారానికి సిద్ధం", "Ready to broadcast")}</Badge>
        ) : a.status === "calling" ? (
          <Badge tone="warning"><PhoneCall aria-hidden="true" className="h-3 w-3" /> {t("కాల్స్ జరుగుతున్నాయి", "Calling")}</Badge>
        ) : (
          <Badge tone="success">{t("పూర్తి", "Done")}</Badge>
        )}
        <span className="ml-auto text-xs text-slate-500">{a.id} · {timeAgo(a.createdAt)}</span>
      </div>
      <p className={cn("mt-3 text-[15px] leading-relaxed text-ink", te && "te")}>{te ? a.te : a.en}</p>
      {!c?.total ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200/70">
          <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {t("ప్రసారానికి సిద్ధంగా ఉంది. రైతుల జాబితా కాలింగ్ ఇంజిన్‌కి కలిపాక కాల్స్ వెళ్తాయి.", "Ready to broadcast. Calls go out once a farmer list is connected to the calling engine.")}
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label="Call progress">
            <div className="bg-low transition-all duration-500" style={{ width: seg(c.answered) }} />
            <div className="bg-critical/80 transition-all duration-500" style={{ width: seg(c.no_answer) }} />
            <div className="bg-slate-400 transition-all duration-500" style={{ width: seg(c.busy) }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            <span><b className="text-low">{c.answered}</b> {t("విన్నారు", "listened")}</span>
            <span><b className="text-critical">{c.no_answer}</b> {t("ఎత్తలేదు", "no answer")}</span>
            <span><b>{c.busy}</b> {t("బిజీ", "busy")}</span>
            <span><b>{c.pending}</b> {t("మిగిలినవి", "pending")}</span>
            <span className="ml-auto inline-flex items-center gap-1"><Users aria-hidden="true" className="h-3.5 w-3.5" /> {c.total} {t("రైతులు", "farmers")}</span>
          </div>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(a.farmers ?? []).map((f, i) => (
          <span
            key={f.id}
            title={`${f.phone} · ${f.crop} · ${STATUS[f.status].en}`}
            className={cn("animate-slide-in-right inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors", STATUS[f.status].cls)}
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
          >
            {f.name}
            <span className={cn("opacity-70", te && "te")}>· {t(STATUS[f.status].te, STATUS[f.status].en)}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

export default function RythuConsole() {
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const te = lang === "te";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [risk, setRisk] = useState<RiskRow[] | null>(null);
  const [riskErr, setRiskErr] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [boardOff, setBoardOff] = useState(false);
  const [district, setDistrict] = useState("Guntur");
  const [type, setType] = useState<AlertType>("rain");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ te: string; en: string; audio?: string | null; district: string; type: AlertType; lang?: string } | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "send" | "reset">("");
  const [err, setErr] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const loadAlerts = useCallback(() => {
    api<{ alerts: Alert[] }>("/api/rythu/alerts").then((r) => setAlerts(r.alerts)).catch(() => setAlerts([]));
  }, []);

  useEffect(() => {
    api<Meta>("/api/rythu/meta").then(setMeta).catch(() => {});
    api<Board>("/api/rythu/prices")
      .then((b) => (b && (b as { available?: boolean }).available === false ? setBoardOff(true) : setBoard(b)))
      .catch(() => setBoardOff(true));
    api<{ districts: RiskRow[] }>("/api/rythu/weather/risk").then((r) => setRisk(r.districts)).catch((e) => setRiskErr(e.message));
    loadAlerts();
  }, [loadAlerts]);

  useStream("rythu:alert", (a: Alert) => {
    setAlerts((prev) => {
      const list = prev ?? [];
      const i = list.findIndex((x) => x.id === a.id);
      if (i === -1) return [a, ...list];
      const next = list.slice();
      next[i] = a;
      return next;
    });
  });
  useStream("rythu:reset", loadAlerts);

  const stats = useMemo(() => {
    const list = alerts ?? [];
    const called = list.reduce((n, a) => n + a.counts.total - a.counts.pending, 0);
    const listened = list.reduce((n, a) => n + a.counts.answered, 0);
    return { sent: list.length, called, rate: called ? Math.round((listened / called) * 100) : 0, high: (risk ?? []).filter((r) => r.risk === "high").length };
  }, [alerts, risk]);

  const uiLang = te ? "te" : "en";
  const stale = !preview || preview.district !== district || preview.type !== type || (preview.lang ?? "te") !== uiLang;

  async function doPreview() {
    setBusy("preview");
    setErr("");
    try {
      const p = await api<{ te: string; en: string; audio?: string | null; district: string; type: AlertType; lang?: string }>("/api/rythu/alerts/preview", { district, type, note, lang: uiLang });
      setPreview(p);
      play(p.audio);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function doSend() {
    setBusy("send");
    setErr("");
    try {
      const body = stale ? { district, type, note } : { district, type, note, te: preview!.te, en: preview!.en };
      await api("/api/rythu/alerts", body);
      setPreview(null);
      setNote("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function doReset() {
    setBusy("reset");
    try {
      await api("/api/rythu/reset", {});
      loadAlerts();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  function prefill(r: RiskRow) {
    setDistrict(r.district);
    setType(r.flags.heat && !r.flags.heavyRain ? "heat" : "rain");
    setPreview(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const districts = meta?.districts ?? [{ key: "Guntur", te: "గుంటూరు" }];
  const dName = (d: { key: string; te: string }) => (te ? `${d.te} · ${d.key}` : d.key);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <PageHeader
        te="వ్యవసాయ అధికారి కన్సోల్"
        en="Agri officer console: Rythu Call alerts"
        accent="rythu"
        icon={<Megaphone aria-hidden="true" className="h-6 w-6" />}
        eyebrow={t("అధికారులు · వ్యవసాయం", "Officials · Agriculture")}
        description={t(
          "జిల్లాల వారీగా వాతావరణ ప్రమాదం చూడండి, AI తో తెలుగు వాయిస్ హెచ్చరిక రాయండి, ప్రతి రైతుకు కాల్ స్థితి లైవ్‌గా చూడండి.",
          "Spot weather risk by district, write a voice alert with AI, and watch each farmer's call status live. In production every farmer gets a real phone call from our calling engine.",
        )}
        actions={
          <>
            <Button variant="secondary" icon={<Sprout aria-hidden="true" className="h-4 w-4" />} onClick={() => navigate("/rythu")}>{t("రైతు వీక్షణ", "Farmer view")}</Button>
            <Button variant="ghost" icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />} loading={busy === "reset"} onClick={doReset}>{t("డెమో రీసెట్", "Reset demo")}</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("పంపిన హెచ్చరికలు", "Alerts sent")} value={stats.sent} icon={<Megaphone aria-hidden="true" className="h-4 w-4" />} tone="rythu" />
        <Stat label={t("కాల్ చేసిన రైతులు", "Farmers called")} value={stats.called} icon={<PhoneCall aria-hidden="true" className="h-4 w-4" />} />
        <Stat label={t("విన్నవారు", "Listened")} value={`${stats.rate}%`} icon={<Users aria-hidden="true" className="h-4 w-4" />} tone="low" />
        <Stat label={t("ప్రమాద జిల్లాలు", "High-risk districts")} value={risk ? stats.high : "–"} hint={t("రాబోయే 3 రోజులు, లైవ్", "Next 3 days, live")} icon={<CloudRain aria-hidden="true" className="h-4 w-4" />} tone={stats.high ? "critical" : "neutral"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <div ref={formRef} className="scroll-mt-24" />
          <Card>
            <CardHeader
              icon={<Megaphone aria-hidden="true" className="h-5 w-5" />}
              title={<span className={cn(te && "te")}>{t("హెచ్చరిక పంపండి", "Broadcast an alert")}</span>}
              subtitle={t("AI సందేశం రాస్తుంది; జిల్లాలోని ప్రతి రైతుకు వాయిస్ కాల్ వెళ్తుంది.", "AI writes the message; every farmer in the district gets a voice call.")}
            />
            <div className="space-y-3 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  {t("జిల్లా", "District")}
                  <Select className="mt-1" value={district} onChange={(e) => { setDistrict(e.target.value); setPreview(null); }}>
                    {districts.map((d) => <option key={d.key} value={d.key}>{dName(d)}</option>)}
                  </Select>
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  {t("హెచ్చరిక రకం", "Alert type")}
                  <Select className="mt-1" value={type} onChange={(e) => { setType(e.target.value as AlertType); setPreview(null); }}>
                    {TYPES.map((x) => <option key={x.id} value={x.id}>{te ? `${x.te} · ${x.en}` : x.en}</option>)}
                  </Select>
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                {t("అధికారి నోట్", "Officer note")} <span className="font-normal text-slate-400">({t("ఐచ్ఛికం", "optional")})</span>
                <Input className="mt-1" value={note} maxLength={200} placeholder="e.g. Pink bollworm seen in cotton near Hanamkonda" onChange={(e) => { setNote(e.target.value); setPreview(null); }} />
              </label>
              {preview && !stale && (
                <div className="animate-scale-in rounded-xl border border-rythu-200 bg-rythu-50 p-3.5">
                  <div className="flex items-start gap-3">
                    <Button size="sm" accent="rythu" icon={<Play aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => play(preview.audio)} disabled={!preview.audio}>{t("వినండి", "Play")}</Button>
                    <p className={cn("min-w-0 text-[15px] leading-relaxed text-ink", te && "te")}>{te ? preview.te : preview.en}</p>
                  </div>
                </div>
              )}
              {err && <p role="alert" className="text-sm text-critical">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<Play aria-hidden="true" className="h-4 w-4" />} loading={busy === "preview"} onClick={doPreview}>{t("AI తో ముందుగా చూడండి", "Preview with AI")}</Button>
                <Button accent="rythu" icon={<Send aria-hidden="true" className="h-4 w-4" />} loading={busy === "send"} onClick={doSend}>{t("రైతులకు పంపండి", "Send to farmers")}</Button>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className={cn("text-lg font-bold text-ink", te && "te")}>{t("పంపిన హెచ్చరికలు", "Alerts")}</h2>
            <span className="text-xs font-medium text-slate-500">{t("లైవ్", "Live")}</span>
          </div>
          {alerts === null ? (
            <Card className="flex items-center gap-3 p-5 text-sm text-slate-500"><Spinner /> {t("లోడ్ అవుతోంది…", "Loading alerts…")}</Card>
          ) : alerts.length === 0 ? (
            <Card><EmptyState icon={<Megaphone aria-hidden="true" className="h-8 w-8" />} title={t("ఇంకా హెచ్చరికలు లేవు", "No alerts yet")} hint={t("పైన ఒకటి పంపండి.", "Preview and send one above.")} /></Card>
          ) : (
            alerts.map((a) => <AlertCard key={a.id} a={a} />)
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              icon={<CloudRain aria-hidden="true" className="h-5 w-5" />}
              title={<span className={cn(te && "te")}>{t("జిల్లా వాతావరణ ప్రమాదం", "District weather risk")}</span>}
              subtitle={t("రాబోయే 3 రోజులు · Open-Meteo (లైవ్)", "Next 3 days · Open-Meteo (live)")}
            />
            {risk === null ? (
              <div className="flex items-center gap-3 p-5 text-sm text-slate-500">{riskErr ? riskErr : <><Spinner /> {t("లోడ్ అవుతోంది…", "Loading…")}</>}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-slate-50/95 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2 font-semibold">{t("జిల్లా", "District")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("వర్షం", "Rain")}</th>
                      <th className="px-2 py-2 text-right font-semibold">Max</th>
                      <th className="px-2 py-2 font-semibold">{t("ప్రమాదం", "Risk")}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {risk.map((r, i) => (
                      <tr key={r.district} className="animate-fade-up border-t border-slate-100 transition-colors hover:bg-slate-50/80" style={{ animationDelay: `${i * 35}ms`, animationFillMode: "both" }}>
                        <td className="px-4 py-2">{te ? <><span className="te font-semibold">{r.te}</span> <span className="text-xs text-slate-500">{r.district}</span></> : <span className="font-semibold">{r.district}</span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.totalRain} mm<span className="block text-[11px] text-slate-500">{r.maxProb}%</span></td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.maxTemp}°</td>
                        <td className="px-2 py-2"><Badge tone={RISK_TONE[r.risk]}>{t(RISK_LABEL[r.risk][0], RISK_LABEL[r.risk][1])}</Badge></td>
                        <td className="px-4 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => prefill(r)} aria-label={`Prepare alert for ${r.district}`}>{t("హెచ్చరిక", "Alert")}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={<span className={cn(te && "te")}>{t("మండీ ధరలు", "Mandi price board")}</span>}
              subtitle={board?.date ? `₹/${t("క్వింటా", "quintal")} · ${board.date}` : `₹/${t("క్వింటా", "quintal")}`}
              action={
                board?.live ? (
                  <Badge tone="success" className="whitespace-nowrap">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live · Agmarknet{board.date ? ` · ${board.date}` : ""}
                  </Badge>
                ) : (
                  <Badge className="whitespace-nowrap">{t("మూలం: data.gov.in", "Source: data.gov.in")}</Badge>
                )
              }
            />
            {boardOff ? (
              <div className="m-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                <CloudRain aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <div className="font-semibold">{t("లైవ్ మండీ ధరలు తాత్కాలికంగా అందుబాటులో లేవు", "Live mandi prices are temporarily unavailable")}</div>
                  <div className="mt-0.5 text-amber-800/90">{t("data.gov.in Agmarknet స్పందించడం లేదు. వాతావరణం, సలహా పని చేస్తాయి.", "The data.gov.in Agmarknet feed isn't responding. Weather and advice still work.")}</div>
                </div>
              </div>
            ) : !board ? (
              <div className="flex items-center gap-3 p-5 text-sm text-slate-500"><Spinner /> {t("లోడ్ అవుతోంది…", "Loading…")}</div>
            ) : !board.crops?.length ? (
              <EmptyState
                icon={<Sprout aria-hidden="true" className="h-8 w-8" />}
                title={t("లైవ్ ధరలు ప్రస్తుతం అందుబాటులో లేవు", "Live mandi prices unavailable right now")}
                hint={t("data.gov.in (Agmarknet) నుంచి ధరలు రాగానే ఇక్కడ కనిపిస్తాయి.", "Prices from data.gov.in (Agmarknet) appear here as soon as the feed responds.")}
              />
            ) : (
              <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
                {board.crops.map((c) => (
                  <div key={c.crop} className="bg-white p-3.5">
                    <div className="mb-1.5 font-semibold text-ink">{te ? <><span className="te">{c.te}</span> <span className="text-xs font-medium text-slate-500">{cap(c.crop)}</span></> : cap(c.crop)}</div>
                    <ul className="space-y-1 text-sm">
                      {(c.mandis ?? []).map((m) => {
                        const price = m.today ?? m.modal ?? m.max ?? null;
                        const ch = typeof m.change7d === "number" ? m.change7d : null;
                        return (
                          <li key={`${m.mandi}-${m.district ?? ""}`} className="flex items-center justify-between gap-2" title={[m.district, m.state, m.date].filter(Boolean).join(" · ")}>
                            <span className="min-w-0 truncate text-slate-600">
                              {m.mandi}
                              {m.district && m.district !== m.mandi && <span className="text-xs text-slate-400"> · {m.district}</span>}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                              <b className="text-ink">{typeof price === "number" ? rupee(price) : "—"}</b>
                              {ch !== null && (
                                <span className={cn("text-xs", ch > 0 ? "text-low" : ch < 0 ? "text-critical" : "text-slate-400")}>
                                  {ch > 0 ? "+" : ""}
                                  {ch}%
                                </span>
                              )}
                              {m.trend && <TrendIcon t={m.trend} className="h-3.5 w-3.5" />}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {board?.note && <p className="px-4 py-2.5 text-[11px] text-slate-400">{board.note}</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
