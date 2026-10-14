// Public Rythu Call page: farmer voice call for weather and where-to-sell advice.
import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Bug, CloudSun, LayoutDashboard, MapPin, Sprout, TrendingUp } from "lucide-react";
import * as VC from "@/components/VoiceCall";
import { Button, Card, Select, Spinner } from "@/components/ui";
import { CallIntro, PageHeader } from "../_kit";
import { api, type VoiceReply } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AdviceCard, PriceChart, WeatherStrip, type CropPrices, type Meta, type RythuResult, type Weather } from "./parts";

const VoiceCall = ((VC as any).default ?? (VC as any).VoiceCall) as ComponentType<any>;

const SAMPLES_TE = [
  "టమాటా ఎక్కడ అమ్మితే మంచి ధర వస్తుంది?",
  "గుంటూరులో ఈ వారం వర్షం వస్తుందా?",
  "మిర్చి ధర ఎలా ఉంది?",
  "పత్తికి గులాబీ రంగు పురుగు వచ్చింది, ఏం చేయాలి?",
  "20 క్వింటాళ్ళ వేరుశనగ ఎప్పుడు అమ్మాలి?",
];

const SAMPLES_EN = [
  "Where should I sell my tomatoes for the best price?",
  "Will it rain in Guntur this week?",
  "What is the chilli price today?",
  "Pink bollworm in my cotton, what should I do?",
  "When should I sell 20 quintals of groundnut?",
];

const FALLBACK_DISTRICTS = [
  { key: "Guntur", te: "గుంటూరు" },
  { key: "Kurnool", te: "కర్నూలు" },
  { key: "Madanapalle", te: "మదనపల్లె" },
  { key: "Warangal", te: "వరంగల్" },
  { key: "Khammam", te: "ఖమ్మం" },
  { key: "Nizamabad", te: "నిజామాబాద్" },
];

export default function RythuPage() {
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const te = lang === "te";
  const [place, setPlace] = useState("Guntur");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [wx, setWx] = useState<Weather | null>(null);
  const [wxErr, setWxErr] = useState("");
  const [prices, setPrices] = useState<CropPrices | null>(null);
  const [pricesOff, setPricesOff] = useState(false);
  const [result, setResult] = useState<RythuResult | null>(null);

  useEffect(() => {
    api<Meta>("/api/rythu/meta").then(setMeta).catch(() => {});
    api<CropPrices & { available?: boolean }>("/api/rythu/prices?crop=tomato")
      .then((p) => (p?.available === false || !p?.mandis?.length ? setPricesOff(true) : setPrices(p)))
      .catch(() => setPricesOff(true));
  }, []);

  useEffect(() => {
    setWxErr("");
    api<{ weather: Weather }>(`/api/rythu/weather?place=${encodeURIComponent(place)}`)
      .then((r) => setWx(r.weather))
      .catch((e) => setWxErr(e.message));
  }, [place]);

  const onUpdate = (r: VoiceReply) => {
    const res = r?.result as RythuResult | undefined;
    if (!res) return;
    setResult(res);
    if (res.weather) setWx(res.weather);
    if (res.prices?.mandis?.length) {
      setPrices(res.prices);
      setPricesOff(false);
    }
  };

  const districts = meta?.districts ?? FALLBACK_DISTRICTS;
  const tiles = [
    { icon: <CloudSun aria-hidden="true" className="h-5 w-5 text-sky-600" />, title: t("వాతావరణం", "Weather"), body: t("మీ జిల్లాకు 7 రోజుల లైవ్ అంచనా", "Live 7-day forecast for your district") },
    { icon: <TrendingUp aria-hidden="true" className="h-5 w-5 text-rythu-700" />, title: t("ధరలు, అమ్మకం", "Prices & selling"), body: t("రవాణా ఖర్చు తీసేశాక ఉత్తమ మార్కెట్, 3 రోజుల ధర అంచనా", "Best mandi after transport, with a 3-day price forecast") },
    { icon: <Bug aria-hidden="true" className="h-5 w-5 text-amber-600" />, title: t("పురుగులు", "Pests"), body: t("సురక్షితమైన మొదటి చర్యలు, తర్వాత రైతు సేవా కేంద్రం", "Safe first steps, then your Rythu Seva Kendram") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <PageHeader
        te="రైతు కాల్"
        en="Rythu Call: a voice assistant for farmers"
        accent="rythu"
        variant="bold"
        icon={<Sprout aria-hidden="true" className="h-6 w-6" />}
        eyebrow={t("వ్యవసాయం", "Agriculture")}
        description={t(
          "వాతావరణం, మార్కెట్ ధరలు, పంట ఎక్కడ అమ్మాలి, పురుగుల సమస్యలు. మీ భాషలో అడగండి, మీ భాషలో సమాధానం.",
          "Ask by voice in Telugu: live weather, mandi price trends, the best market after transport cost, and safe pest guidance.",
        )}
        actions={
          <Button variant="secondary" icon={<LayoutDashboard aria-hidden="true" className="h-4 w-4" />} onClick={() => navigate("/console/rythu")}>
            {t("వ్యవసాయ అధికారి కన్సోల్", "Agri officer console")}
          </Button>
        }
      />

      <CallIntro accent="rythu" flow="rythu" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600" htmlFor="rythu-place">
          <MapPin aria-hidden="true" className="h-4 w-4 text-rythu-700" />
          <span className={cn(te && "te")}>{t("మీ జిల్లా", "Your district")}</span>
        </label>
        <Select id="rythu-place" className="w-auto min-w-[200px]" value={place} onChange={(e) => setPlace(e.target.value)}>
          {districts.map((d) => (
            <option key={d.key} value={d.key}>{te ? `${d.te} · ${d.key}` : d.key}</option>
          ))}
        </Select>
        <span className="text-xs text-slate-500">{t("వాతావరణం, మార్కెట్ దూరం లెక్కించడానికి.", "Used for weather and transport distance to each mandi.")}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-5">
          <VoiceCall
            key={`${place}-${lang}`}
            base="/api/rythu/call"
            startBody={{ place }}
            title={t("రైతు కాల్‌తో మాట్లాడండి", "Talk to Rythu Call")}
            samples={SAMPLES_TE}
            samplesEn={SAMPLES_EN}
            onUpdate={onUpdate}
            onDone={onUpdate}
          />
          <Card className="p-4 sm:p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              {tiles.map((x, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">{x.icon}</div>
                  <div>
                    <div className={cn("font-semibold text-ink", te && "te")}>{x.title}</div>
                    <div className={cn("text-slate-500", te && "te")}>{x.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          {result?.advice && <AdviceCard key={`${result.advice.crop}-${result.advice.qty}-${result.advice.best.mandi}`} a={result.advice} />}
          {wx ? (
            <WeatherStrip w={wx} />
          ) : (
            <Card className="flex items-center gap-3 p-5 text-sm text-slate-500">
              {wxErr ? <span>{wxErr}</span> : <><Spinner /> {t("వాతావరణం లోడ్ అవుతోంది…", "Loading weather…")}</>}
            </Card>
          )}
          {prices ? (
            <PriceChart p={prices} highlight={result?.advice?.best.mandi} />
          ) : pricesOff ? (
            <Card className="flex animate-fade-up items-start gap-3 p-5 text-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                <TrendingUp aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold text-ink">{t("లైవ్ మండీ ధరలు తాత్కాలికంగా అందుబాటులో లేవు", "Live mandi prices are temporarily unavailable")}</div>
                <div className="mt-0.5 text-slate-600">{t("data.gov.in Agmarknet స్పందించడం లేదు. వాతావరణం, సలహా పని చేస్తాయి.", "The data.gov.in Agmarknet feed isn't responding. Weather and advice still work.")}</div>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
