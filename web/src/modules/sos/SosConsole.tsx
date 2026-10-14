import "./sos.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { divIcon, type LatLngExpression } from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  HeartPulse,
  Inbox,
  LifeBuoy,
  Loader2,
  MessageCircle,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Siren,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CHANNEL,
  PRIORITY,
  Panel,
  PrioBadge,
  TEAM_ICON,
  WATER,
  beep,
  sosApi,
  timeAgo,
  useSosStream,
  vulnOf,
  type Channel,
  type Forecast,
  type Incident,
  type Team,
} from "./shared";
import { Skeleton } from "@/components/ui";
import { useLang } from "@/lib/i18n";

type Filter = "open" | "new" | "resolved" | "all";
type Tab = "sim" | "forecast" | "report";
type Toast = { id: number; text: string; critical: boolean };

const CENTER: LatLngExpression = [16.527, 80.635];
const TEAM_COLOR: Record<Team["type"], string> = { boat: "#2563eb", medical: "#dc2626", food: "#16a34a" };

const SIM_SAMPLES_EN: { label: string; text: string; channel: Channel }[] = [
  {
    label: "WhatsApp · dialysis",
    channel: "whatsapp",
    text: "We're near the Payakapuram water tank, 6 people at home, my mother needs dialysis today, water is up to the waist, please send a boat",
  },
  { label: "SMS · kids on a terrace", channel: "sms", text: "Help! 4 of us stuck on the terrace at Krishna Lanka near the school, 2 small kids, no food since yesterday" },
  { label: "WhatsApp · food", channel: "whatsapp", text: "Vambay Colony block 7, 3 of us, knee-level water, we need food and drinking water" },
  { label: "Social · chest pain", channel: "social", text: "My grandfather in Singh Nagar has chest pain, the water is chest-deep, please come now" },
];

const SIM_SAMPLES_TE: { label: string; text: string; channel: Channel }[] = [
  {
    label: "తెలుగు · WhatsApp",
    channel: "whatsapp",
    text: "అన్నా మేము పాయకాపురం వాటర్ ట్యాంక్ దగ్గర ఉన్నాం, ఇంట్లో 6 మంది, మా అమ్మకి డయాలసిస్ ఉంది ఈరోజు, నీళ్ళు నడుము వరకు వచ్చాయి, బోట్ పంపండి",
  },
  { label: "English · SMS", channel: "sms", text: "Help! 4 of us stuck on the terrace at Krishna Lanka near the school, 2 small kids, no food since yesterday" },
  { label: "Mixed · WhatsApp", channel: "whatsapp", text: "Vambay colony block 7 lo 3 members unnam, water knee level, food water kavali" },
  { label: "తెలుగు · Social", channel: "social", text: "సింగ్ నగర్ లో మా తాతయ్యకి గుండె నొప్పి వస్తోంది, ఛాతీ వరకు నీళ్ళు, వెంటనే రండి" },
];

function ChannelIcon({ c }: { c: Channel }) {
  const Icon = c === "voice" ? Phone : c === "whatsapp" ? MessageCircle : c === "sms" ? MessageSquare : Globe;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Icon aria-hidden="true" className="h-3 w-3" /> {CHANNEL[c]}
    </span>
  );
}

function FlyTo({ target }: { target: { pos: [number, number]; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.pos, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function pinIcon(i: Incident, selected: boolean) {
  return divIcon({
    className: "sos-divicon",
    html: `<div class="sos-pin sos-pin--${i.priority}${i.status === "resolved" ? " is-resolved" : ""}${selected ? " is-selected" : ""}"><span>${i.people}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function teamIcon(t: Team) {
  return divIcon({
    className: "sos-divicon",
    html: `<div class="sos-team${t.busyWith ? " is-busy" : ""}">${TEAM_ICON[t.type]}<b>${t.id}</b></div>`,
    iconSize: [54, 24],
    iconAnchor: [27, 12],
  });
}

/** Eases from the previous value to the new one, so live counters glide instead of restarting at 0. */
function useTween(target: number, duration = 700) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const next = start + (target - start) * (1 - Math.pow(1 - p, 3));
      from.current = next;
      setV(next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return Math.round(v);
}

function Stat({ label, te, value, total, tone = "#0f172a", icon: Icon, hint, delay = 0, className }: { label: string; te: string; value: number; total?: number; tone?: string; icon: LucideIcon; hint?: string; delay?: number; className?: string }) {
  const shown = useTween(value);
  const { t } = useLang();
  return (
    <div
      className={`min-w-0 animate-fade-up rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70 ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(te, label)}</div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${tone}14`, color: tone }}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 text-3xl font-extrabold leading-none tracking-tight tabular-nums" style={{ color: tone }}>
        {shown}
        {total !== undefined && <span className="text-xl font-bold text-slate-300">/{total}</span>}
      </div>
      {hint && <div className="mt-1.5 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function ForecastTab({ signature }: { signature: string }) {
  const [fc, setFc] = useState<Forecast | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    sosApi<Forecast>("/forecast")
      .then((f) => alive && (setFc(f), setErr("")))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [signature]);
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!fc) return <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        Next 24 h estimate for open requests: 3 food packets and 4 L water per person per day, one boat per 3 rescue requests. Hotspot = a
        critical case or 3+ requests in the last hour.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-3 font-semibold">Area</th>
              <th className="py-2 pr-3 text-right font-semibold">Requests</th>
              <th className="py-2 pr-3 text-right font-semibold">People</th>
              <th className="py-2 pr-3 text-right font-semibold">Vulnerable</th>
              <th className="py-2 pr-3 text-right font-semibold">Food packets</th>
              <th className="py-2 pr-3 text-right font-semibold">Water (L)</th>
              <th className="py-2 pr-3 text-right font-semibold">Boats</th>
              <th className="py-2 text-right font-semibold">Med kits</th>
            </tr>
          </thead>
          <tbody>
            {fc.areas.map((a) => (
              <tr key={a.area} className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
                <td className="py-2 pr-3 font-medium text-slate-900">
                  {a.area}{" "}
                  {a.hotspot && (
                    <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 ring-1 ring-red-200">Hotspot</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.requests}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.people}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.vulnerable}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.food_packets}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.water_litres}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.boats}</td>
                <td className="py-2 text-right tabular-nums">{a.medical_kits}</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-900">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.requests}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.people}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.vulnerable}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.food_packets}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.water_litres}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fc.totals.boats}</td>
              <td className="py-2 text-right tabular-nums">{fc.areas.reduce((s, a) => s + a.medical_kits, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportTab() {
  const { lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ text: string; engine: string; at: number } | null>(null);
  const [err, setErr] = useState("");
  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const r = await sosApi<{ report: string; engine: string }>("/report", { lang });
      setReport({ text: r.report, engine: r.engine, at: Date.now() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />} Generate report for the Collector
        </button>
        {report && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
            AI: {report.engine} · {new Date(report.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {err && <span role="alert" className="text-sm text-red-600">{err}</span>}
      </div>
      {report ? (
        <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-4 text-[13.5px] leading-relaxed text-slate-800">
          {report.text.split("\n").filter(Boolean).map((line, k) => (
            <p key={k} className={line.trim().startsWith("-") ? "pl-3" : k === 0 ? "font-semibold text-slate-900" : ""}>
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          The AI reads every open request, the hotspot areas and team usage, then writes a short brief with recommended next actions, in English with a
          Telugu summary. It only uses the numbers on this screen.
        </p>
      )}
    </div>
  );
}

function SimTab({ onCreated }: { onCreated: (i: Incident) => void }) {
  const { lang, t } = useLang();
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function send() {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const r = await sosApi<{ incident: Incident; engine: string }>("/text", { message: msg, channel });
      onCreated(r.incident);
      setStatus(`${r.incident.id} · ${PRIORITY[r.incident.priority].label} · ${r.incident.area}`);
      setMsg("");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-xs text-slate-500">Paste or pick a WhatsApp / SMS / social SOS in any language. The AI reads it, sets the priority and puts it on the map.</p>
      <div className="my-2 flex flex-wrap gap-1.5">
        {[...SIM_SAMPLES_EN, { ...SIM_SAMPLES_TE[0], label: "Telugu · WhatsApp" }].map((s) => (
          <button
            key={s.label}
            onClick={() => {
              setMsg(s.text);
              setChannel(s.channel);
            }}
            className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-solid hover:border-[#e11d48] hover:text-[#e11d48]"
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        aria-label="Incoming SOS message"
        placeholder={t("ఉదా: అన్నా మేము పాయకాపురం లో ఉన్నాం, 6 మంది, అమ్మకి డయాలసిస్…", "e.g. We're in Payakapuram, 6 people, mother needs dialysis…")}
        className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[#e11d48] focus:ring-2 focus:ring-rose-100"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Channel" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="social">Social media</option>
        </select>
        <button
          onClick={send}
          disabled={busy || !msg.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />} Triage with AI
        </button>
        {status && <span role="status" className="text-sm text-slate-600">{status}</span>}
      </div>
    </div>
  );
}

export default function SosConsole() {
  const { t, lang } = useLang();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [fly, setFly] = useState<{ pos: [number, number]; n: number } | null>(null);
  const [tab, setTab] = useState<Tab>("sim");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const known = useRef(new Set<string>());
  // Items that arrived live slide in once; they never replay the initial fade-up.
  const liveIds = useRef(new Set<string>());
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(async () => {
    try {
      const s = await sosApi<{ incidents: Incident[]; teams: Team[] }>("/state");
      known.current = new Set(s.incidents.map((i) => i.id));
      setIncidents(s.incidents);
      setTeams(s.teams);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, [load]);

  const toast = useCallback((text: string, critical = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, critical }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const upsert = useCallback(
    (i: Incident) => {
      const fresh = !known.current.has(i.id);
      known.current.add(i.id);
      setIncidents((prev) => {
        const idx = prev.findIndex((x) => x.id === i.id);
        if (idx < 0) return [i, ...prev];
        const copy = [...prev];
        copy[idx] = i;
        return copy;
      });
      if (fresh) {
        liveIds.current.add(i.id);
        setNow(Date.now());
        setFlash((f) => new Set(f).add(i.id));
        setTimeout(() => setFlash((f) => {
          const n = new Set(f);
          n.delete(i.id);
          return n;
        }), 2500);
        toast(`New ${PRIORITY[i.priority].label.toUpperCase()} SOS · ${i.area} · ${i.people} people${i.team ? ` · ${i.team.name} dispatched` : ""}`, i.priority === "critical");
        if (i.priority === "critical") beep();
      }
    },
    [toast],
  );

  useSosStream({ incident: upsert, teams: setTeams, reset: load });

  const stats = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "resolved");
    return {
      open: open.length,
      critical: open.filter((i) => i.priority === "critical").length,
      people: open.reduce((s, i) => s + (i.people || 0), 0),
      vulnerable: open.reduce((s, i) => s + vulnOf(i), 0),
      free: teams.filter((t) => !t.busyWith).length,
    };
  }, [incidents, teams]);

  const queue = useMemo(() => {
    const list = incidents.filter((i) =>
      filter === "open" ? i.status !== "resolved" : filter === "new" ? i.status === "new" : filter === "resolved" ? i.status === "resolved" : true,
    );
    return list.sort((a, b) => {
      if (filter === "resolved") return b.updatedAt - a.updatedAt;
      const r = (x: Incident) => (x.status === "resolved" ? 1 : 0);
      return r(a) - r(b) || b.score - a.score || a.createdAt - b.createdAt;
    });
  }, [incidents, filter]);

  const signature = useMemo(() => incidents.map((i) => `${i.id}${i.status}`).join(","), [incidents]);

  function select(i: Incident, scroll = false) {
    setSelected(i.id);
    setFly({ pos: [i.lat, i.lng], n: Date.now() });
    if (scroll) cardRefs.current[i.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function act(i: Incident, action: "assign" | "resolve") {
    setBusyId(i.id);
    try {
      const r = await sosApi<{ incident: Incident }>(`/incidents/${i.id}/${action}`, {});
      upsert(r.incident);
      if (action === "assign" && r.incident.team) toast(`${r.incident.team.name} assigned to ${i.id} · ETA ${r.incident.team.eta} min`);
      if (action === "resolve") toast(`${i.id} marked rescued / resolved`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function reset() {
    try {
      await sosApi("/reset", {});
      await load();
      toast("Demo data reset");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const filters: { id: Filter; label: string }[] = [
    { id: "open", label: t("తెరిచినవి", "Open") },
    { id: "new", label: t("కేటాయించనివి", "Unassigned") },
    { id: "resolved", label: t("పూర్తయినవి", "Resolved") },
    { id: "all", label: t("అన్నీ", "All") },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <div className="mb-5 animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-rose-50 via-white to-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(225,29,72,0.35)] ring-1 ring-rose-100 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e11d48] text-white shadow-[0_8px_20px_-8px_rgba(225,29,72,0.6)]">
            <Siren aria-hidden="true" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-600">{t("అత్యవసర SOS · అధికారుల కన్సోల్", "Disaster SOS · Officials console")}</div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t("కంట్రోల్ రూమ్", "SOS Control Room")}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="sos-live-dot" /> <span className="font-semibold text-red-600">LIVE</span>
              </span>
              <span>
                <span className="hidden sm:inline">· </span>
                {t("విజయవాడ పైలట్ · రెస్క్యూ టీమ్‌లు నమూనా", "Vijayawada pilot · rescue teams are a sample deployment")}
              </span>
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <Link
              to="/sos"
              className="press inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#e11d48] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#be123c] sm:flex-none"
            >
              <Phone aria-hidden="true" className="h-4 w-4" /> {t("పౌరుల హెల్ప్‌లైన్", "Citizen helpline")}
            </Link>
            <button
              onClick={reset}
              className="press inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 sm:flex-none"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" /> {t("డెమో రీసెట్", "Reset demo")}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the control room: {error}
          <button onClick={load} className="rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-red-200">
            Retry
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Open requests" te="తెరిచి ఉన్నవి" value={stats.open} icon={Inbox} tone="#1d4ed8" hint={t("ఇంకా పూర్తి కానివి", "Not yet resolved")} />
        <Stat label="Critical" te="అత్యవసరం" value={stats.critical} tone="#dc2626" icon={AlertTriangle} hint={t("ఆటో-డిస్పాచ్", "Auto-dispatched first")} delay={60} />
        <Stat label="People waiting" te="ఎదురుచూస్తున్నవారు" value={stats.people} tone="#0f172a" icon={Users} hint={t("సహాయం కోసం", "Awaiting rescue")} delay={120} />
        <Stat label="Vulnerable" te="బలహీనులు" value={stats.vulnerable} tone="#ea580c" icon={HeartPulse} hint={t("వృద్ధులు, పిల్లలు, గర్భిణీలు", "Elderly, children, pregnant")} delay={180} />
        <Stat label="Teams free" te="ఖాళీ టీమ్‌లు" value={stats.free} total={teams.length} tone="#16a34a" icon={LifeBuoy} hint={t("బోట్లు · వైద్య · రిలీఫ్", "Boats · medical · relief")} delay={240} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative h-[380px] sm:h-[460px] lg:h-[520px]" role="region" aria-label="Live map of SOS incidents and rescue teams">
              <MapContainer center={CENTER} zoom={13} scrollWheelZoom className="h-full w-full" style={{ background: "#e5e7eb" }}>
                {/* CARTO basemaps now watermark "API KEY REQUIRED"; OSM tiles need no key. */}
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <FlyTo target={fly} />
                {incidents
                  .filter((i) => i.status === "assigned" && i.team && teamById.get(i.team.id))
                  .map((i) => {
                    const t = teamById.get(i.team!.id)!;
                    return (
                      <Polyline
                        key={`line-${i.id}`}
                        positions={[t.at, [i.lat, i.lng]]}
                        pathOptions={{ color: TEAM_COLOR[t.type], weight: 2.5, dashArray: "6 8", opacity: 0.85 }}
                      />
                    );
                  })}
                {teams.map((t) => (
                  <Marker key={`team-${t.id}`} position={t.at} icon={teamIcon(t)} zIndexOffset={-100}>
                    <Popup>
                      <b>{t.name}</b>
                      <br />
                      {t.busyWith ? `On mission: ${t.busyWith}` : "Free"}
                    </Popup>
                  </Marker>
                ))}
                {incidents.map((i) => (
                  <Marker
                    key={i.id}
                    position={[i.lat, i.lng]}
                    icon={pinIcon(i, selected === i.id)}
                    zIndexOffset={i.status === "resolved" ? -200 : i.priority === "critical" ? 1000 : 0}
                    eventHandlers={{ click: () => select(i, true) }}
                  >
                    <Popup>
                      <b>
                        {i.id} · {PRIORITY[i.priority].label}
                      </b>
                      <br />
                      {i.summary}
                      {i.team && (
                        <>
                          <br />
                          {i.team.name} · ETA {i.team.eta} min
                        </>
                      )}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow ring-1 ring-slate-200">
                {(["critical", "high", "medium", "low"] as const).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY[p].color }} /> {PRIORITY[p].label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">🚤 Boat</span>
                <span className="inline-flex items-center gap-1">🚑 Medical</span>
                <span className="inline-flex items-center gap-1">🚚 Relief</span>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 pt-2">
              {(
                [
                  { id: "sim", label: t("ఇన్‌కమింగ్ SOS మెసేజ్", "Incoming SOS message"), icon: MessageCircle },
                  { id: "forecast", label: t("వనరుల అంచనా", "Resource forecast"), icon: TrendingUp },
                  { id: "report", label: t("AI పరిస్థితి నివేదిక", "AI situation report"), icon: FileText },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    tab === id ? "border-[#1d4ed8] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "sim" && <SimTab onCreated={(i) => { upsert(i); select(i); }} />}
              {tab === "forecast" && <ForecastTab signature={signature} />}
              {tab === "report" && <ReportTab />}
            </div>
          </section>
        </div>

        <Panel
          className="flex min-h-[420px] flex-col lg:max-h-[calc(100vh-150px)]"
          title={
            <span className="flex items-center gap-2">
              <Activity aria-hidden="true" className="h-4 w-4 text-[#e11d48]" /> {t("ప్రాధాన్యత క్యూ", "Priority queue")}
            </span>
          }
          sub={t("AI వివరాలు తీస్తుంది · నియమాలు ప్రాధాన్యత నిర్ణయిస్తాయి · అత్యవసర కేసులు ఆటోమేటిక్‌గా పంపబడతాయి", "AI extracts the facts · rules set the priority · critical cases are auto-dispatched")}
          right={
            <div className="flex flex-wrap justify-end gap-1">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                    filter === f.id ? "bg-blue-50 text-blue-700 ring-blue-200" : "text-slate-500 ring-slate-200 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="-m-4 flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto p-3 lg:max-h-[calc(100vh-240px)]">
            {loading &&
              [0, 1, 2].map((k) => (
                <div key={k} className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            {!loading && queue.length === 0 && (
              <div className="flex animate-fade-up flex-col items-center px-6 py-12 text-center">
                <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
                </span>
                <div className="text-base font-bold text-ink">{t("ప్రస్తుతం యాక్టివ్ SOS లేవు", "No active SOS right now")}</div>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  {t("కొత్త కాల్స్, మెసేజ్‌లు ఇక్కడ లైవ్‌గా కనిపిస్తాయి. /sos నుంచి ప్రయత్నించండి.", "New calls and messages appear here live. Try one from the SOS page.")}
                </p>
                <Link to="/sos" className="press mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#e11d48] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#be123c]">
                  <Phone aria-hidden="true" className="h-4 w-4" /> {t("SOS కాల్ ప్రయత్నించండి", "Try an SOS call")}
                </Link>
              </div>
            )}
            {queue.map((i, idx) => (
              <article
                key={i.id}
                ref={(el) => {
                  cardRefs.current[i.id] = el;
                }}
                onClick={() => select(i)}
                className={`cursor-pointer rounded-xl border border-l-4 bg-white p-3 transition-shadow hover:shadow-md ${
                  selected === i.id ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
                } ${i.status === "resolved" ? "opacity-60" : ""} ${flash.has(i.id) ? "sos-flash animate-slide-in-right" : liveIds.current.has(i.id) ? "" : "animate-fade-up"}`}
                style={{ borderLeftColor: PRIORITY[i.priority].color, animationDelay: flash.has(i.id) ? "0ms" : `${Math.min(idx, 10) * 45}ms` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <PrioBadge p={i.priority} />
                  <span className="font-mono text-xs font-semibold text-slate-500">{i.id}</span>
                  <ChannelIcon c={i.channel} />
                  <span className="ml-auto text-[11px] text-slate-400">{timeAgo(i.createdAt, now)}</span>
                </div>
                <div className="mt-1.5 font-semibold text-slate-900">
                  {i.area}
                  {i.landmark && <span className="font-normal text-slate-500"> · {i.landmark}</span>}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-slate-600">
                  <Users aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-slate-400" />
                  {i.summary}
                </p>
                <p className="mt-1 text-[11.5px] text-slate-400">Why: {i.reasons.join("; ")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {i.status === "new" && <span className="text-xs font-semibold text-orange-700">{t("టీమ్ కోసం వేచి ఉంది", "Waiting for a team")}</span>}
                  {i.status === "assigned" && i.team && (
                    <span className="text-xs font-semibold text-slate-800">
                      {TEAM_ICON[i.team.type]} {i.team.name} · {i.team.km} km · ETA {i.team.eta} min
                    </span>
                  )}
                  {i.status === "resolved" && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> {t("రక్షించబడ్డారు", "Rescued / resolved")}
                    </span>
                  )}
                  <div className="ml-auto flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {i.status === "new" && (
                      <button
                        onClick={() => act(i, "assign")}
                        disabled={busyId === i.id}
                        className="rounded-lg bg-[#1d4ed8] px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                      >
                        {t("దగ్గరి టీమ్‌ని పంపండి", "Assign nearest team")}
                      </button>
                    )}
                    {i.status === "assigned" && (
                      <button
                        onClick={() => act(i, "resolve")}
                        disabled={busyId === i.id}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {t("రక్షించినట్లు గుర్తించండి", "Mark rescued")}
                      </button>
                    )}
                  </div>
                </div>
                {i.transcript?.length > 0 && (
                  <details className="mt-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <summary className="cursor-pointer font-medium text-blue-700">
                      {t("సంభాషణ", "Transcript")} · {t("నీరు", "water")} {WATER[i.water] || i.water}
                    </summary>
                    <div className="mt-1.5 space-y-1 rounded-lg bg-slate-50 p-2">
                      {i.transcript.map((line, k) => (
                        <p key={k} className="leading-relaxed">
                          <span className="font-semibold text-slate-500">{line.who === "agent" ? "AI" : t("కాలర్", "Caller")}:</span>{" "}
                          {lang === "te" ? line.te || line.text : line.who === "agent" ? line.en || line.text : line.text}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex max-w-[calc(100vw-32px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border-l-4 bg-white px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.critical ? "border-l-red-600 text-red-800 ring-red-200" : "border-l-blue-600 text-slate-800 ring-slate-200"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
