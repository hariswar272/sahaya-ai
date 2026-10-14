import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, CloudSun, Sun, Thermometer, TrendingUp, Truck, Wind } from "lucide-react";
import { Badge, Card, CardHeader, DemoNote } from "@/components/ui";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

export type WxDay = { date: string; rain: number; prob: number; tmax: number; tmin: number; wind: number };
export type Weather = {
  place: string;
  placeTe: string;
  days: WxDay[];
  next3: { rainDays: number; totalRain: number; maxProb: number; maxTemp: number; maxWind: number };
  flags: { heavyRain: boolean; heat: boolean; windy: boolean };
  risk: "high" | "medium" | "low";
  source: string;
};
export type Trend = "rising" | "falling" | "steady";
export type MandiSeries = {
  mandi: string;
  te: string;
  history?: { date: string; price: number }[];
  forecast?: { date: string; price: number }[];
  today?: number | null;
  change7d?: number | null;
  trend?: Trend | null;
  district?: string;
  state?: string;
  date?: string;
  min?: number | null;
  max?: number | null;
  modal?: number | null;
};
export type CropPrices = { crop: string; te: string; unit: string; demo?: boolean; live?: boolean; source?: string; date?: string; note?: string; mandis: MandiSeries[] };

/** Today's price for a market: the live modal price when the feed gives one. */
export const priceOf = (m: MandiSeries) => m.today ?? m.modal ?? m.max ?? null;
export type Advice = {
  crop: string;
  cropTe: string;
  place: string;
  placeTe: string;
  qty: number;
  perishable: boolean;
  best: { mandi: string; te: string; action: "sell_now" | "wait"; waitDays: number; price: number; transport: number; km: number; net: number };
  nearest: { mandi: string; te: string; km: number; today: number; net: number };
  gain: number;
  options: { mandi: string; te: string; km: number; transport: number; today: number; netNow: number; trend: Trend }[];
  note: string;
};
export type RythuResult = { intent: string; crop?: string | null; place?: string | null; weather?: Weather; prices?: CropPrices; advice?: Advice };
export type FarmerCall = { id: string; name: string; phone: string; crop: string; status: "queued" | "ringing" | "answered" | "no_answer" | "busy" };
export type Alert = {
  id: string;
  district: string;
  districtTe: string;
  type: "rain" | "heat" | "pest";
  label: string;
  labelTe: string;
  te: string;
  en: string;
  note: string;
  createdAt: number;
  status: "calling" | "done";
  farmers: FarmerCall[];
  counts: { total: number; answered: number; no_answer: number; busy: number; pending: number };
  seeded?: boolean;
};
export type Meta = { districts: { key: string; te: string }[]; crops: { key: string; te: string }[] };

/* ---------------------------------------------------------------- helpers */

export const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Counts from 0 to `to` over ~0.7 s (ease-out); jumps straight there when motion is reduced. */
function useCount(to: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setV(to * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

const shortDate = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const RISK_TONE = { high: "critical", medium: "medium", low: "low" } as const;
export const RISK_LABEL = { high: ["ఎక్కువ ప్రమాదం", "High risk"], medium: ["జాగ్రత్త", "Watch"], low: ["సాధారణం", "Normal"] } as const;

export function TrendIcon({ t, className }: { t: Trend; className?: string }) {
  if (t === "rising") return <ArrowUpRight className={cn("h-4 w-4 text-low", className)} aria-label="rising" />;
  if (t === "falling") return <ArrowDownRight className={cn("h-4 w-4 text-critical", className)} aria-label="falling" />;
  return <ArrowRight className={cn("h-4 w-4 text-slate-400", className)} aria-label="steady" />;
}

function WxIcon({ d }: { d: WxDay }) {
  if (d.rain >= 5 || d.prob >= 60) return <CloudRain className="mx-auto h-6 w-6 text-sky-600" />;
  if (d.prob >= 30) return <CloudSun className="mx-auto h-6 w-6 text-sky-500" />;
  return <Sun className={cn("mx-auto h-6 w-6", d.tmax >= 38 ? "text-orange-500" : "text-amber-500")} />;
}

/* ----------------------------------------------------------- WeatherStrip */

export function WeatherStrip({ w }: { w: Weather }) {
  const { lang, t } = useLang();
  const te = lang === "te";
  const day = (date: string, i: number) =>
    i === 0 ? t("ఈరోజు", "Today") : new Date(`${date}T12:00:00+05:30`).toLocaleDateString(te ? "te-IN" : "en-IN", { weekday: "short" });
  return (
    <Card>
      <CardHeader
        icon={<CloudSun className="h-5 w-5" />}
        title={<span className={cn(te && "te")}>{t(`${w.placeTe} వాతావరణం`, `${w.place} weather`)} <span className="font-medium text-slate-500">· {t("7 రోజులు", "7 days")}</span></span>}
        action={<Badge tone={RISK_TONE[w.risk]}>{t(RISK_LABEL[w.risk][0], RISK_LABEL[w.risk][1])}</Badge>}
      />
      <div className="grid grid-cols-4 gap-1.5 p-3 sm:grid-cols-7 sm:p-4">
        {w.days.map((d, i) => (
          <div
            key={`${w.place}-${d.date}`}
            className={cn("animate-fade-up rounded-xl border p-2 text-center", d.rain >= 5 || d.prob >= 60 ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-slate-50")}
            style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
          >
            <div className={cn("truncate text-[11px] font-semibold text-slate-500", te && "te")}>{day(d.date, i)}</div>
            <div className="my-1"><WxIcon d={d} /></div>
            <div className="text-xs font-bold tabular-nums text-ink">{d.tmax}°<span className="font-medium text-slate-400">/{d.tmin}°</span></div>
            <div className="text-[11px] font-semibold tabular-nums text-sky-700">{d.prob}%</div>
            <div className="text-[10px] tabular-nums text-slate-500">{d.rain > 0 ? `${d.rain} mm` : "–"}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><CloudRain className="h-3.5 w-3.5" /> {t("రాబోయే 3 రోజులు", "Next 3 days")}: {w.next3.totalRain} mm</span>
        <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" /> Max {w.next3.maxTemp}°C</span>
        <span className="inline-flex items-center gap-1"><Wind className="h-3.5 w-3.5" /> {w.next3.maxWind} km/h</span>
        <span className="ml-auto text-slate-400">{w.source}</span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- PriceChart */

const COLORS = ["#65a30d", "#d97706", "#1d4ed8", "#7c3aed"];

export function PriceChart({ p, highlight }: { p: CropPrices; highlight?: string }) {
  const { lang, t } = useLang();
  const te = lang === "te";
  const rows = useMemo(() => {
    const first = p.mandis[0];
    if (!first) return [];
    const hist = first.history ?? [];
    const fc = first.forecast ?? [];
    const dates = [...hist.map((h) => h.date), ...fc.map((f) => f.date)];
    const lastHist = hist[hist.length - 1]?.date;
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date: shortDate(date) };
      for (const m of p.mandis) {
        const h = (m.history ?? []).find((x) => x.date === date);
        const f = (m.forecast ?? []).find((x) => x.date === date);
        row[m.mandi] = h ? h.price : null;
        // The forecast line starts at today's price so the two lines join.
        row[`${m.mandi} (forecast)`] = f ? f.price : date === lastHist ? priceOf(m) : null;
      }
      return row;
    });
  }, [p]);
  const hasSeries = rows.length > 1;
  const live = p.live ?? p.demo === false;

  return (
    <Card>
      <CardHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title={<span className={cn(te && "te")}>{t(`${p.te} ధరలు`, `${cap(p.crop)} prices`)} <span className="font-medium text-slate-500">· ₹/{t("క్వింటా", "quintal")}</span></span>}
        subtitle={
          hasSeries
            ? t("ధరల ట్రెండ్ + AI అంచనా (చుక్కల గీత)", "Price trend + AI forecast (dashed)")
            : t("ఈరోజు మార్కెట్ ధరలు", "Today's market prices")
        }
        action={
          live ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live · Agmarknet{p.date ? ` · ${p.date}` : ""}
            </span>
          ) : (
            <DemoNote>{t("మూలం: data.gov.in", "Source: data.gov.in")}</DemoNote>
          )
        }
      />
      {hasSeries && (
      <div className="h-60 px-1 pt-3 sm:px-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => `${Math.round(v / 100) / 10}k`} />
            <Tooltip formatter={(v: number) => rupee(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {p.mandis.flatMap((m, i) => [
              <Line key={m.mandi} type="monotone" dataKey={m.mandi} stroke={COLORS[i % COLORS.length]} strokeWidth={m.mandi === highlight ? 3.5 : 2} dot={false} connectNulls isAnimationActive={false} />,
              <Line key={`${m.mandi}-f`} type="monotone" dataKey={`${m.mandi} (forecast)`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls legendType="none" isAnimationActive={false} />,
            ])}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
      <div className="overflow-x-auto px-4 pb-4 pt-1">
        <table className="w-full min-w-[300px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-2 font-semibold">{t("మార్కెట్", "Mandi")}</th>
              <th className="py-2 text-right font-semibold">{t("ఈరోజు", "Today")}</th>
              <th className="py-2 text-right font-semibold">{t("7 రోజులు", "7 days")}</th>
              <th className="py-2 text-right font-semibold">{t("3 రోజుల్లో", "In 3 days")}</th>
            </tr>
          </thead>
          <tbody>
            {p.mandis.map((m, i) => (
              <tr key={m.mandi} className={cn("animate-fade-up border-t border-slate-100 transition-colors hover:bg-slate-50/80", m.mandi === highlight && "bg-rythu-50 hover:bg-rythu-50")} style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                <td className="py-2">
                  {te ? <><span className="te font-semibold">{m.te}</span> <span className="text-xs text-slate-500">{m.mandi}</span></> : <span className="font-semibold">{m.mandi}</span>}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{priceOf(m) !== null ? rupee(priceOf(m) as number) : "—"}</td>
                <td className={cn("py-2 text-right tabular-nums", (m.change7d ?? 0) > 0 ? "text-low" : (m.change7d ?? 0) < 0 ? "text-critical" : "text-slate-500")}>
                  {typeof m.change7d === "number" ? `${m.change7d > 0 ? "+" : ""}${m.change7d}%` : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {(() => {
                    const f = m.forecast?.[m.forecast.length - 1]?.price;
                    return (
                      <span className="inline-flex items-center gap-1">
                        {typeof f === "number" ? rupee(f) : "—"}
                        {m.trend && <TrendIcon t={m.trend} />}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.note && <p className="mt-2 text-[11px] text-slate-400">{p.note}</p>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- AdviceCard */

export function AdviceCard({ a }: { a: Advice }) {
  const { lang, t } = useLang();
  const te = lang === "te";
  const b = a.best;
  const wait = b.action === "wait";
  const gain = useCount(a.gain);
  const days = `${b.waitDays} day${b.waitDays > 1 ? "s" : ""}`;
  return (
    <Card className="animate-scale-in overflow-hidden border-rythu-200">
      <div className="bg-gradient-to-br from-rythu-50 to-amber-50 p-4 sm:p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-rythu-700">{t("ఎక్కడ, ఎప్పుడు అమ్మాలి", "Sell advice")}</div>
        <div className={cn("mt-1.5 text-xl font-extrabold leading-snug text-ink", te && "te")}>
          {te
            ? wait ? `${b.waitDays} రోజులు ఆగి ${b.te}లో అమ్మండి` : `ఈరోజే ${b.te}లో అమ్మండి`
            : wait ? `Wait ${days}, then sell at ${b.mandi}` : `Sell today at ${b.mandi}`}
        </div>
        <div className="mt-0.5 text-sm font-semibold text-slate-600">
          {te ? `${a.qty} క్వింటాళ్ళ ${a.cropTe}` : `${a.qty} quintals of ${a.crop}`}
        </div>
        {a.gain > 0 && (
          <div className="mt-3 rounded-xl border border-rythu-200 bg-white px-3.5 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-rythu-700">+{rupee(gain)}</div>
            <div className={cn("text-xs text-slate-600", te && "te")}>
              {b.mandi === a.nearest.mandi
                ? t("ఈరోజే అమ్మడం కంటే ఎక్కువ", "more than selling today")
                : t(`దగ్గర్లోని ${a.nearest.te}లో ఈరోజు అమ్మడం కంటే ఎక్కువ`, `more than selling today at the nearest market, ${a.nearest.mandi} (${a.nearest.km} km)`)}
            </div>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-100 text-sm">
        {[
          [t("అంచనా ధర", "Expected price"), `${rupee(b.price)}/qtl`],
          [<span key="t" className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {t("రవాణా", "Transport")}</span>, `${rupee(b.transport)}/qtl · ${b.km} km`],
          [t("రవాణా తర్వాత నికరం", "Net after transport"), `${rupee(b.net)}/qtl`],
          [t("నుండి", "From"), te ? a.placeTe : a.place],
        ].map(([k, v], i) => (
          <div key={i} className="bg-white px-4 py-2.5">
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="font-semibold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <span className="text-[11px] text-slate-400">{t("రవాణా: క్వింటాకు కి.మీ.కు ₹2.", "Transport at ₹2 per quintal per km.")} {a.note}</span>
        <DemoNote>{t("డెమో", "Demo")}</DemoNote>
      </div>
    </Card>
  );
}
