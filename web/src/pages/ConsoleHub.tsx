import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, HeartPulse, LayoutDashboard, Phone, ShieldAlert, Siren, Sprout } from "lucide-react";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { hasRoute } from "@/modules/registry";
import { accentClasses, cn, type Accent } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

type Health = { ok?: boolean; engine?: string; gemini?: boolean; voice?: boolean; modules?: string[] };

type ConsoleCard = { to: string; icon: LucideIcon; accent: Accent; te: string; en: string; desc: string; who: string };

const CONSOLES: ConsoleCard[] = [
  {
    to: "/console/sos",
    icon: Siren,
    accent: "sos",
    te: "వరద కంట్రోల్ రూమ్",
    en: "SOS Control Room",
    desc: "Live map, priority queue, auto-dispatch of the nearest team, resource forecast and an AI situation report.",
    who: "District disaster control room",
  },
  {
    to: "/console/arogya",
    icon: HeartPulse,
    accent: "arogya",
    te: "ASHA డ్యాష్‌బోర్డ్",
    en: "ASHA Dashboard",
    desc: "Patients due for follow-up, AI call results, danger-sign flags and follow-up campaigns.",
    who: "ASHA workers · PHC medical officers",
  },
  {
    to: "/console/rythu",
    icon: Sprout,
    accent: "rythu",
    te: "రైతు అలర్ట్స్",
    en: "Rythu Alerts",
    desc: "Weather and price alerts, what farmers are asking, and Telugu broadcast messages.",
    who: "Agriculture officers · Rythu Seva Kendras",
  },
  {
    to: "/console/scam",
    icon: ShieldAlert,
    accent: "scam",
    te: "స్కామ్ ట్రెండ్స్",
    en: "Scam Trends",
    desc: "Scam types this week, recent checks (anonymised) and awareness messages ready to share.",
    who: "Cyber cell · awareness teams",
  },
  {
    to: "/console/phone",
    icon: Phone,
    accent: "primary",
    te: "నిజమైన ఫోన్ కాల్",
    en: "Real phone call",
    desc: "Place a real Telugu AI phone call to a basic phone. The same agent as in the browser, over the telephone network.",
    who: "Demo · telephony",
  },
];

export default function ConsoleHub() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const { t, tr, lang } = useLang();

  useEffect(() => {
    let alive = true;
    api<Health>("/api/health")
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="container-page">
      <PageHeader
        te="అధికారుల కన్సోల్"
        en="Officials' Console"
        description="Live dashboards for each lifeline. Every request arrives here in real time. Dashboards show simulated demo data."
        accent="primary"
        icon={<LayoutDashboard aria-hidden="true" className="h-6 w-6" />}
      />

      <Card className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-700">{tr("System status")}</span>
        {offline ? (
          <Badge tone="danger">API offline</Badge>
        ) : !health ? (
          <span className="text-slate-400">Checking…</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", health.ok ? "bg-green-500" : "bg-red-500")} />
              API {health.ok ? "online" : "error"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", health.voice ? "bg-green-500" : "bg-slate-300")} />
              Telugu voice {health.voice ? "on" : "off"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              AI engine: <strong className="font-semibold">{health.engine ?? "–"}</strong>
              {health.gemini ? " (Gemini enabled)" : ""}
            </span>
            {health.modules && health.modules.length > 0 && <span className="text-slate-500">Modules: {health.modules.join(", ")}</span>}
          </>
        )}
      </Card>

      <div className="grid gap-5 pb-6 sm:grid-cols-2 xl:grid-cols-3">
        {CONSOLES.map((c) => {
          const a = accentClasses[c.accent];
          const ready = hasRoute(c.to);
          return (
            <div key={c.to} className="hover-lift relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className={cn("absolute inset-x-0 top-0 h-1", a.bg)} />
              <div className="flex items-start justify-between gap-3">
                <div className={cn("grid h-11 w-11 place-items-center rounded-xl text-white", a.bg)}>
                  <c.icon aria-hidden="true" className="h-5 w-5" />
                </div>
                {!ready && <Badge tone="neutral">{tr("Coming up")}</Badge>}
              </div>
              <h3 className="te mt-4 text-lg font-extrabold text-ink">{t(c.te, c.en)}</h3>
              {lang !== "en" && <div className={cn("text-sm font-bold", a.text)}>{c.en}</div>}
              <p className="te mt-2 text-sm leading-relaxed text-slate-600">{tr(c.desc)}</p>
              <div className="mt-1 text-xs text-slate-400">{c.who}</div>
              <div className="mt-auto pt-5">
                {ready ? (
                  <ButtonLink to={c.to} accent={c.accent} icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />} className="flex-row-reverse">
                    {t("కన్సోల్ తెరవండి", "Open console")}
                  </ButtonLink>
                ) : (
                  <span className="inline-flex h-10 items-center rounded-xl border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-400">{tr("Not available yet")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
