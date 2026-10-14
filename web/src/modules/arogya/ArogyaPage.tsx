import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BellRing, ClipboardCheck, HeartPulse, Lock, Mic, Phone, PhoneCall, ShieldAlert, Stethoscope } from "lucide-react";
import { Button, Card, Input, Reveal } from "@/components/ui";
import { PageHeader } from "../_kit";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CallPanel, PROGRAM_UI, usePatients, type ProgramId } from "./shared";

const STEPS = [
  { icon: <PhoneCall aria-hidden="true" className="h-5 w-5" />, te: "AI కాల్ చేస్తుంది", title: "AI calls", en: "AI calls the patient in their own language, on any basic phone" },
  { icon: <ClipboardCheck aria-hidden="true" className="h-5 w-5" />, te: "4–6 చిన్న ప్రశ్నలు", title: "4–6 short questions", en: "Asks about danger signs and medicines, in plain words" },
  { icon: <ShieldAlert aria-hidden="true" className="h-5 w-5" />, te: "ప్రమాద సంకేతాలు గుర్తిస్తుంది", title: "Spots danger signs", en: "Fixed medical rules set the risk, with a reason for every flag" },
  { icon: <BellRing aria-hidden="true" className="h-5 w-5" />, te: "ASHA అక్కకు అలర్ట్", title: "Alerts the ASHA worker", en: "High-risk patients reach the ASHA worker the same day" },
];

const PROGRAMS = Object.keys(PROGRAM_UI) as ProgramId[];

export default function ArogyaPage() {
  const { lang, t } = useLang();
  const { programs } = usePatients();
  const [name, setName] = useState("");
  const [program, setProgram] = useState<ProgramId>("anc");
  const [started, setStarted] = useState<{ name: string; program: ProgramId } | null>(null);

  const titleTe = "AI మీ ఆరోగ్యాన్ని రోజూ పలకరిస్తుంది";
  const titleEn = "AI that checks on your health, every day";

  function begin(e: FormEvent) {
    e.preventDefault();
    const n = name.trim().slice(0, 60);
    if (!n) return;
    setStarted({ name: n, program });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <PageHeader
        te={titleTe}
        en={titleEn}
        eyebrow={t("ఆరోగ్యం · ఆరోగ్య కాల్", "Healthcare · Arogya Call")}
        accent="arogya"
        variant="bold"
        icon={<HeartPulse aria-hidden="true" className="h-6 w-6" />}
        description={t(
          "గర్భిణీలు, బీపీ / షుగర్ పేషెంట్లు, టీబీ పేషెంట్లకు AI వారి భాషలో చిన్న కాల్ చేస్తుంది. ప్రమాద సంకేతాలు, మిస్ అయిన మందులు అడిగి, ఈరోజు ఎవరిని కలవాలో ASHA అక్కకు చెబుతుంది.",
          "Pregnant women, BP and diabetes patients and TB patients get a short call from AI in their own language. It checks for danger signs and missed medicines, then tells their ASHA worker who needs a visit today.",
        )}
        actions={
          <Link to="/console/arogya">
            <Button variant="secondary" className="press" icon={<Stethoscope aria-hidden="true" className="h-4 w-4" />}>
              {t("ASHA డ్యాష్‌బోర్డ్", "ASHA dashboard")}
            </Button>
          </Link>
        }
      />

      {/* The call card: the first thing on the page. */}
      <section id="call" className="animate-fade-up [animation-delay:80ms]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-arogya-50 via-white to-white px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-arogya text-white shadow-[0_10px_22px_-10px_rgba(13,148,136,0.6)]">
                  <Mic aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{t("ఇప్పుడే సహాయతో మాట్లాడండి", "Talk to Sahaya now")}</h2>
                  <p className="text-sm text-slate-600">{t("నొక్కండి, మైక్ అనుమతించండి, తెలుగులో మాట్లాడండి.", "Tap, allow microphone, speak in Telugu.")}</p>
                </div>
              </div>
              <Link to="/console/phone?flow=arogya" className="shrink-0">
                <Button variant="secondary" className="press h-11 w-full sm:w-auto" icon={<Phone aria-hidden="true" className="h-4 w-4" />}>
                  {t("మీ ఫోన్‌కి కాల్ పొందండి", "Get a call on your phone")}
                </Button>
              </Link>
            </div>
            <ol className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-4">
              {[
                t("1 · పేరు, ప్రోగ్రామ్", "1 · Name & programme"),
                t("2 · మైక్ అనుమతి", "2 · Allow microphone"),
                t("3 · తెలుగులో జవాబు", "3 · Answer in Telugu"),
                t("4 · తదుపరి చర్య", "4 · Get your next step"),
              ].map((s) => (
                <li key={s} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-slate-200/70">
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="p-5 sm:p-6">
            {!started ? (
              <form onSubmit={begin} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
                <div>
                  <label htmlFor="arogya-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {t("మీ పేరు", "Your name")}
                  </label>
                  <Input
                    id="arogya-name"
                    value={name}
                    maxLength={60}
                    autoComplete="given-name"
                    placeholder={t("ఉదా: లక్ష్మి", "e.g. Lakshmi")}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("ప్రోగ్రామ్", "Programme")}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Programme">
                    {PROGRAMS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={program === id}
                        onClick={() => setProgram(id)}
                        className={cn(
                          "press flex min-h-[44px] items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left text-sm font-semibold transition",
                          program === id ? "border-arogya bg-arogya-50 text-arogya-700 ring-2 ring-arogya-200" : "border-slate-200 text-slate-700 hover:border-arogya-200",
                        )}
                      >
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", program === id ? "bg-arogya text-white" : "bg-arogya-50 text-arogya")}>
                          {PROGRAM_UI[id].icon}
                        </span>
                        <span className="te min-w-0">{t(PROGRAM_UI[id].te, PROGRAM_UI[id].short)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <Button type="submit" size="lg" accent="arogya" className="press h-12 w-full sm:w-auto" disabled={!name.trim()} icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}>
                    {t("కాల్‌కి కొనసాగండి", "Continue to the call")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="animate-fade-up">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200/70">
                  <span className="text-slate-600">
                    {t("కాల్ చేస్తోంది", "Calling as")} <b className="text-ink">{started.name}</b> · {t(PROGRAM_UI[started.program].te, PROGRAM_UI[started.program].short)}
                  </span>
                  <button type="button" onClick={() => setStarted(null)} className="font-semibold text-arogya-700 hover:underline">
                    {t("మార్చండి", "Change")}
                  </button>
                </div>
                <CallPanel intake={started} programs={programs} />
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {PROGRAMS.map((id, i) => (
          <Card key={id} className="hover-lift animate-fade-up p-5" style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-arogya-50 text-arogya">{PROGRAM_UI[id].icon}</div>
              <div>
                <div className="te font-bold text-ink">{t(PROGRAM_UI[id].te, PROGRAM_UI[id].en)}</div>
                {lang === "te" && <div className="text-sm font-medium text-slate-500">{PROGRAM_UI[id].en}</div>}
              </div>
            </div>
            <div className="te mt-3 text-sm leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">{t("AI అడిగేవి: ", "AI asks: ")}</span>
              {t(PROGRAM_UI[id].asksTe, PROGRAM_UI[id].asks)}
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div
            key={s.te}
            className="flex animate-fade-up items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"
            style={{ animationDelay: `${200 + i * 70}ms`, animationFillMode: "both" }}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-arogya text-white">{s.icon}</div>
            <div>
              <div className="text-xs font-bold text-arogya-700">{t(`దశ ${i + 1}`, `Step ${i + 1}`)}</div>
              <div className="te font-semibold text-ink">{t(s.te, s.title)}</div>
              <div className="text-sm text-slate-500">{s.en}</div>
            </div>
          </div>
        ))}
      </section>

      <Reveal className="mt-10">
        <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-arogya" />
          <div className="text-sm leading-relaxed text-slate-600">
            <div className="te mb-1 font-semibold text-ink">{t("మీ వివరాలు సురక్షితం", "Your details stay private")}</div>
            {t(
              "మీ పేరు, ఆరోగ్య ప్రశ్నలకు జవాబులు మాత్రమే నమోదవుతాయి; 48 గంటల తర్వాత అవి ఆటోమేటిక్‌గా తొలగిపోతాయి. AI రోగ నిర్ధారణ చేయదు, మందులు మార్చదు. ప్రమాదాన్ని గుర్తిస్తుంది, నిర్ణయం ఆరోగ్య కార్యకర్తదే.",
              "Only your name and the answers to the health questions are kept, and they are deleted automatically after 48 hours. The AI never gives a diagnosis or changes medicines. It flags risk and a health worker decides.",
            )}
          </div>
        </section>
      </Reveal>
    </div>
  );
}
