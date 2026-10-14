import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Check, Copy, Megaphone, Radio, RefreshCw, Share2, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge, Button, Card, CardHeader, CountUp, DemoNote, EmptyState, Select, Spinner } from "@/components/ui";
import { PageHeader, Stat } from "../_kit";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useStream } from "@/lib/sse";
import { cn } from "@/lib/utils";
import { SCAM_TYPES, SOURCE_LABEL, TYPE_COLORS, VERDICT, istTime, type CheckEntry, type Pair, type ScamStats } from "./shared";

type Awareness = { scam_type: string; label: Pair; te: string; en: string; loc?: string; lang?: string; engine?: string };

export default function ScamConsole() {
  const { t } = useLang();
  const [stats, setStats] = useState<ScamStats | null>(null);
  const [feed, setFeed] = useState<(CheckEntry & { fresh?: boolean })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const s = await api<ScamStats>("/api/scam/stats");
      setStats(s);
      setFeed((f) => (f.length ? f : s.recent));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(reloadTimer.current);
  }, [load]);

  useStream("scam:check", (e: CheckEntry) => {
    setFeed((f) => [{ ...e, fresh: true }, ...f.filter((x) => x.id !== e.id)].slice(0, 25));
    window.setTimeout(() => setFeed((f) => f.map((x) => (x.id === e.id ? { ...x, fresh: false } : x))), 4000);
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(load, 800);
  });
  useStream("scam:reset", () => {
    setFeed([]);
    load();
  });

  const labelOf = (type: string): Pair => stats?.labels?.[type] ?? SCAM_TYPES.find((x) => x.id === type)?.label ?? { te: type, en: type };
  const name = (p: Pair) => t(p.te, p.en);

  const chart = useMemo(() => {
    if (!stats) return { data: [], keys: [] as string[] };
    const keys = stats.top.slice(0, 7).map((x) => x.type);
    const data = stats.days.map((d) => {
      const row: Record<string, number | string> = { label: d.label };
      let others = 0;
      for (const [type, n] of Object.entries(d.byType)) {
        if (keys.includes(type)) row[type] = n;
        else others += n;
      }
      if (others) row.others = others;
      return row;
    });
    const hasOthers = data.some((r) => r.others);
    return { data, keys: hasOthers ? [...keys, "others"] : keys };
  }, [stats]);

  const weekTotal = stats ? stats.verdicts.scam + stats.verdicts.suspicious + stats.verdicts.safe : 0;
  const top = stats?.top[0];
  const maxTop = Math.max(1, ...(stats?.top.map((x) => x.count) ?? [1]));
  const othersLabel = t("ఇతరాలు", "Others");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <PageHeader
        te={t("సైబర్ సెల్ కన్సోల్", "Cyber cell console")}
        en="Scam Shield · officials"
        accent="scam"
        icon={<ShieldAlert aria-hidden="true" className="h-6 w-6" />}
        eyebrow={t("అధికారులు", "Officials")}
        description={t(
          "ప్రజలు ఏ మోసాలను చెక్ చేస్తున్నారో లైవ్‌గా చూడండి, ముందుగానే హెచ్చరించండి. అనామక లెక్కలు మాత్రమే, మెసేజ్ టెక్స్ట్ సేవ్ చేయము.",
          "Which scams people are checking right now, so the cyber cell can warn the public early. Only anonymous counts are kept, never message text.",
        )}
        actions={
          <>
            {stats?.demo && <DemoNote>{t("డెమో ట్రెండ్ + లైవ్ చెక్‌లు", "Demo trend data + live checks")}</DemoNote>}
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
              onClick={async () => {
                await api("/api/scam/reset", {}).catch(() => {});
                load();
              }}
            >
              {t("డెమో రీసెట్", "Reset demo")}
            </Button>
            <Link to="/scam" className="press inline-flex h-8 items-center gap-1.5 rounded-lg bg-scam px-3 text-sm font-semibold text-white shadow-sm hover:bg-scam-700">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" /> {t("ప్రజల చెకర్", "Citizen checker")}
            </Link>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="animate-fade-up" label={t("ఈ వారం చెక్‌లు", "Checks this week")} value={stats ? <CountUp value={weekTotal} /> : "–"} icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />} />
        <Stat
          className="animate-fade-up [animation-delay:60ms]"
          label={t("మోసాలు", "Scams caught")}
          value={stats ? <CountUp value={stats.verdicts.scam} /> : "–"}
          tone="critical"
          icon={<ShieldAlert aria-hidden="true" className="h-4 w-4" />}
        />
        <Stat
          className="animate-fade-up [animation-delay:120ms]"
          label={t("అనుమానాస్పదం", "Suspicious")}
          value={stats ? <CountUp value={stats.verdicts.suspicious} /> : "–"}
          tone="high"
          icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
        />
        <Stat
          className="animate-fade-up [animation-delay:180ms]"
          label={t("ఈ వారం టాప్ మోసం", "Top scam this week")}
          value={<span className="te text-lg leading-tight">{top ? name(top.label) : "–"}</span>}
          hint={top ? `${top.count} ${t("చెక్‌లు", "checks")}` : undefined}
          tone="scam"
          icon={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="animate-fade-up [animation-delay:120ms]">
          <CardHeader
            icon={<TrendingUp aria-hidden="true" className="h-5 w-5 text-scam" />}
            title={<span className="te">{t("వారం ట్రెండ్", "Weekly trend")}</span>}
            subtitle={t("రోజువారీ మోసం / అనుమానాస్పద చెక్‌లు, రకం వారీగా (7 రోజులు)", "Scam and suspicious checks per day, by type (last 7 days)")}
          />
          <div className="h-[320px] p-3 sm:p-4">
            {stats ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(124,58,237,0.06)" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    formatter={(v: number, k: string) => [v, k === "others" ? othersLabel : name(labelOf(k))]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k: string) => (k === "others" ? othersLabel : name(labelOf(k)))} />
                  {chart.keys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="a"
                      fill={k === "others" ? "#cbd5e1" : TYPE_COLORS[k] ?? "#94a3b8"}
                      radius={i === chart.keys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                      animationDuration={900}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center">
                <Spinner />
              </div>
            )}
          </div>
        </Card>

        <Card className="animate-fade-up [animation-delay:180ms]">
          <CardHeader icon={<ShieldAlert aria-hidden="true" className="h-5 w-5 text-scam" />} title={<span className="te">{t("ఈ వారం టాప్ మోసాలు", "Top scams this week")}</span>} subtitle={t("గత 7 రోజులు", "Last 7 days")} />
          <ul className="space-y-2.5 p-4">
            {(stats?.top ?? []).slice(0, 7).map((x, i) => (
              <li key={x.type} className="animate-fade-up" style={{ animationDelay: `${240 + i * 60}ms` }}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="te min-w-0 truncate font-semibold text-ink">{name(x.label)}</span>
                  <span className="shrink-0 font-bold tabular-nums text-ink">{x.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(x.count / maxTop) * 100}%`, background: TYPE_COLORS[x.type] ?? "#94a3b8" }} />
                </div>
              </li>
            ))}
            {stats && !stats.top?.length && (
              <li>
                <EmptyState
                  icon={<ShieldCheck aria-hidden="true" className="h-8 w-8" />}
                  title={t("ఈ వారం ఇంకా మోసాలు లేవు", "No scams reported this week")}
                  hint={t("ప్రజలు చెక్ చేసిన మోసాలు ఇక్కడ రకాల వారీగా కనిపిస్తాయి.", "Scams people check on the citizen page show up here by type.")}
                />
              </li>
            )}
            {!stats && (
              <li className="grid place-items-center py-6">
                <Spinner />
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="animate-fade-up [animation-delay:200ms]">
          <CardHeader
            icon={<Radio aria-hidden="true" className="h-5 w-5 text-scam" />}
            title={
              <span className="flex items-center gap-2">
                <span className="te">{t("లైవ్ ఫీడ్", "Live feed")}</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-critical" />
                </span>
              </span>
            }
            subtitle={t("చెక్‌లు జరిగిన వెంటనే, అనామకంగా. మెసేజ్ టెక్స్ట్ సేవ్ చేయము.", "Anonymous checks as they happen. No message text is stored.")}
          />
          <ul className="scrollbar-thin max-h-[360px] divide-y divide-slate-100 overflow-auto">
            {feed.length === 0 && (
              <EmptyState icon={<Radio aria-hidden="true" className="h-8 w-8" />} title={t("ఇంకా చెక్‌లు లేవు", "No checks yet")} hint={t("ప్రజల పేజీలో చేసిన చెక్‌లు ఇక్కడ వెంటనే కనిపిస్తాయి.", "Checks made on the citizen page appear here instantly.")} />
            )}
            {feed.map((c) => {
              const v = VERDICT[c.verdict] ?? VERDICT.suspicious;
              const l = c.verdict === "safe" ? { te: "మోసం కాదు", en: "No scam" } : labelOf(c.type);
              const src = SOURCE_LABEL[c.source] ?? { te: c.source, en: c.source };
              return (
                <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors duration-1000", c.fresh && "animate-slide-in-right bg-scam-50/60")}>
                  <span className="w-14 shrink-0 text-xs tabular-nums text-slate-500">{istTime(c.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="te block truncate text-sm font-semibold text-ink">{name(l)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {name(src)}
                      {c.demo ? ` · ${t("డెమో", "demo")}` : ""}
                    </span>
                  </span>
                  <Badge tone={v.tone} className="shrink-0">
                    {name(c.verdict === "scam" ? { te: "మోసం", en: "Scam" } : c.verdict === "safe" ? { te: "సురక్షితం", en: "Safe" } : { te: "అనుమానం", en: "Suspicious" })}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>

        <AwarenessCard />
      </div>
    </div>
  );
}

function AwarenessCard() {
  const { lang, t } = useLang();
  const [type, setType] = useState(SCAM_TYPES[0].id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Awareness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setMsg(await api<Awareness>("/api/scam/awareness", { scam_type: type, lang }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // The user's language first; English underneath only when the UI isn't English.
  const blocks: { id: string; title: string; text: string }[] = msg
    ? [
        { id: "loc", title: t("మీ భాష", "Message"), text: msg.loc || (lang === "te" ? msg.te : msg.en) },
        ...(lang !== "en" && (msg.loc || msg.te) !== msg.en ? [{ id: "en", title: "English", text: msg.en }] : []),
      ]
    : [];

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Card className="animate-fade-up [animation-delay:260ms]">
      <CardHeader
        icon={<Megaphone aria-hidden="true" className="h-5 w-5 text-scam" />}
        title={<span className="te">{t("అవగాహన సందేశం", "Awareness message")}</span>}
        subtitle={t("వాట్సాప్ గ్రూప్‌లకు పంపదగిన హెచ్చరిక", "Generate a WhatsApp-ready public warning")}
      />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-10 min-w-0 flex-1" aria-label={t("మోసం రకం", "Scam type")}>
            {SCAM_TYPES.map((x) => (
              <option key={x.id} value={x.id}>
                {t(x.label.te, x.label.en)}
              </option>
            ))}
          </Select>
          <Button accent="scam" loading={busy} icon={<Megaphone aria-hidden="true" className="h-4 w-4" />} onClick={generate}>
            {t("తయారు చేయండి", "Generate")}
          </Button>
        </div>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {msg ? (
          <div className="space-y-2.5">
            {blocks.map((b) => (
              <div key={b.id} className="animate-fade-up rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{b.title}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => copy(b.id, b.text)} className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">
                      {copied === b.id ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-low" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                      {copied === b.id ? t("కాపీ అయింది", "Copied") : t("కాపీ", "Copy")}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(b.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-white"
                    >
                      <Share2 aria-hidden="true" className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </div>
                </div>
                <p className="te whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{b.text}</p>
              </div>
            ))}
            <div className="text-xs text-slate-400">
              {msg.engine === "template" ? t("టెంప్లేట్ (AI అందుబాటులో లేదు)", "Template (AI unavailable)") : `AI (${msg.engine})`} · {t("పోస్ట్ చేసే ముందు చూడండి.", "Review before posting.")}
            </div>
          </div>
        ) : (
          <p className="te text-sm text-slate-500">
            {t(
              "ఒక మోసం రకం ఎంచుకుని తయారు చేయండి నొక్కండి: గ్రూప్‌లకు పంపదగిన చిన్న హెచ్చరిక వస్తుంది.",
              "Pick a scam type and press Generate to get a short warning ready to post in WhatsApp groups.",
            )}
          </p>
        )}
      </div>
    </Card>
  );
}
