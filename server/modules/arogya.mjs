// Arogya Call: AI follow-up calls for pregnancy (ANC), BP/diabetes (NCD) and
// TB (DOTS) patients. Public and login-free: a caller gives their name and
// programme, and that creates their record. There is no seeded or demo data.
// The model only reads the patient's answers; fixed rules decide the risk, so
// every flag a health worker sees comes with a reason they can check.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;
const istDayStart = (ts) => Math.floor((ts + IST) / DAY) * DAY - IST;

// Public records are personal health data with no login in front of them, so
// they are kept only for a limited time and the list is capped.
const RETENTION = Number(process.env.AROGYA_RETENTION_HOURS || 48) * HOUR;
const MAX_PATIENTS = 1000;

// Call languages (Sarvam codes). English is the default; Telugu has hand-written
// lines; every other language is translated from the English line and cached.
const LANGS = { en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi", bn: "Bengali", gu: "Gujarati", pa: "Punjabi", od: "Odia" };
const normLang = (l) => {
  const k = String(l || "en").toLowerCase().split(/[-_]/)[0];
  const m = k === "or" ? "od" : k;
  return m in LANGS ? m : "en";
};
const sarvamCode = (lang) => `${lang}-IN`;

/* -------------------------------------------------------------- programs */

// Each field: type, whether `true` is a bad sign, labels, the extraction hint,
// and the words used in the one-line summary for yes / no.
const PROGRAMS = {
  anc: {
    label: "Pregnancy care (ANC)",
    te: "గర్భిణీ సంరక్షణ",
    intro: ["మీ గర్భం గురించి కొన్ని చిన్న ప్రశ్నలు అడుగుతాను.", "I'll ask a few short questions about your pregnancy."],
    questions: [
      { key: "q_bleeding", fields: ["bleeding"], line: ["రక్తస్రావం కానీ, నీళ్ళు పోవడం కానీ ఏమైనా ఉందా?", "Any bleeding or water leaking?"] },
      { key: "q_swelling", fields: ["swelling"], line: ["ముఖం లేదా చేతులు వాచాయా?", "Any swelling of the face or hands?"] },
      { key: "q_headache", fields: ["headache_vision"], line: ["తీవ్రమైన తలనొప్పి కానీ, కళ్ళు మసకబారడం కానీ ఉందా?", "Any severe headache or blurred vision?"] },
      { key: "q_movement", fields: ["baby_movement"], line: ["బిడ్డ కదలికలు మామూలుగా తెలుస్తున్నాయా?", "Are the baby's movements normal?"] },
      { key: "q_ifa", fields: ["ifa_taken"], line: ["ఐరన్, ఫోలిక్ యాసిడ్ మాత్రలు రోజూ వేసుకుంటున్నారా?", "Are you taking your iron and folic acid tablets every day?"] },
      { key: "q_checkup", fields: ["checkup_known"], line: ["మీ తదుపరి చెకప్ తేదీ మీకు తెలుసా?", "Do you know the date of your next check-up?"] },
    ],
    fields: {
      bleeding: { type: "bool", bad: true, en: "Bleeding / water leaking", te: "రక్తస్రావం / నీళ్ళు పోవడం", hint: "true if any vaginal bleeding or water/fluid leaking", s: ["bleeding or leaking reported", "no bleeding"] },
      swelling: { type: "bool", bad: true, en: "Face / hand swelling", te: "ముఖం / చేతుల వాపు", hint: "true if the face or hands are swollen", s: ["face/hand swelling", "no swelling"] },
      headache_vision: { type: "bool", bad: true, en: "Severe headache / blurred vision", te: "తీవ్ర తలనొప్పి / మసక చూపు", hint: "true if severe headache or blurred vision", s: ["severe headache or blurred vision", null] },
      baby_movement: { type: "bool", bad: false, en: "Baby movements normal", te: "బిడ్డ కదలికలు సాధారణం", hint: "true if the baby's movements are normal / felt well; false if reduced or not felt", s: ["baby moving normally", "reduced baby movements"] },
      ifa_taken: { type: "bool", bad: false, en: "Taking iron-folic tablets", te: "ఐరన్ మాత్రలు వేసుకుంటున్నారు", hint: "true if taking iron / folic acid tablets daily; false if not or irregular", s: ["taking IFA tablets", "not taking IFA tablets"] },
      checkup_known: { type: "bool", bad: false, en: "Knows next check-up date", te: "తదుపరి చెకప్ తెలుసు", hint: "true if she knows her next check-up date; false if she does not", s: [null, "next check-up date not known"] },
      fits: { type: "bool", bad: true, en: "Fits / convulsions", te: "ఫిట్స్", hint: "true if fits, convulsions or fainting", s: ["fits/convulsions", null] },
      fever: { type: "bool", bad: true, en: "Fever", te: "జ్వరం", hint: "true if fever", s: ["fever", null] },
    },
  },
  ncd: {
    label: "BP / Diabetes (NCD)",
    te: "బీపీ / షుగర్",
    intro: ["మీ బీపీ, షుగర్ మందుల గురించి కొన్ని చిన్న ప్రశ్నలు అడుగుతాను.", "I'll ask a few short questions about your BP and sugar medicines."],
    questions: [
      { key: "q_meds", fields: ["meds_today"], line: ["ఈరోజు బీపీ, షుగర్ మాత్రలు వేసుకున్నారా?", "Did you take your BP and sugar tablets today?"] },
      { key: "q_missed", fields: ["missed_days"], line: ["ఈ వారంలో ఎన్ని రోజులు మాత్రలు మిస్ అయ్యాయి?", "How many days did you miss your tablets this week?"] },
      { key: "q_symptoms", fields: ["chest_pain", "dizziness", "breathless", "fainting", "mild_symptoms"], line: ["కళ్ళు తిరగడం, ఛాతీ నొప్పి, ఆయాసం లాంటివి ఏమైనా ఉన్నాయా?", "Any dizziness, chest pain or breathlessness?"] },
      { key: "q_reading", fields: ["sugar", "bp_systolic", "reading_unknown"], line: ["చివరిసారి చూసిన షుగర్ లేదా బీపీ రీడింగ్ ఎంత?", "What was your last sugar or BP reading?"] },
    ],
    fields: {
      meds_today: { type: "bool", bad: false, en: "Took tablets today", te: "ఈరోజు మాత్రలు వేసుకున్నారు", hint: "true if BP/sugar tablets were taken today, false if not", s: ["took tablets today", "missed today's tablets"] },
      missed_days: { type: "int", min: 0, max: 7, en: "Days missed this week", te: "మిస్ అయిన రోజులు", hint: "number of days tablets were missed this week (0 if none)" },
      chest_pain: { type: "bool", bad: true, en: "Chest pain", te: "ఛాతీ నొప్పి", hint: "true if chest pain", s: ["chest pain", null] },
      dizziness: { type: "bool", bad: true, en: "Dizziness", te: "కళ్ళు తిరగడం", hint: "true if dizziness or giddiness", s: ["dizziness", null] },
      breathless: { type: "bool", bad: true, en: "Breathlessness", te: "ఆయాసం", hint: "true if breathlessness", s: ["breathlessness", null] },
      fainting: { type: "bool", bad: true, en: "Fainting", te: "స్పృహ తప్పడం", hint: "true if they fainted or lost consciousness", s: ["fainting", null] },
      mild_symptoms: { type: "bool", bad: true, en: "Other discomfort", te: "ఇతర ఇబ్బందులు", hint: "true if they say they have some discomfort but name no specific symptom", s: ["some discomfort", null] },
      sugar: { type: "int", min: 20, max: 900, en: "Last sugar (mg/dL)", te: "షుగర్ రీడింగ్", hint: "last blood sugar reading in mg/dL" },
      bp_systolic: { type: "int", min: 50, max: 300, en: "BP (upper)", te: "బీపీ పై సంఖ్య", hint: "upper (systolic) BP number" },
      bp_diastolic: { type: "int", min: 30, max: 200, en: "BP (lower)", te: "బీపీ కింది సంఖ్య", hint: "lower (diastolic) BP number" },
      reading_unknown: { type: "bool", en: "Reading not known", te: "రీడింగ్ తెలియదు", hint: "true if they do not know their last reading", s: ["last reading not known", null] },
    },
  },
  tb: {
    label: "TB treatment (DOTS)",
    te: "టీబీ చికిత్స",
    intro: ["మీ టీబీ మందుల గురించి కొన్ని చిన్న ప్రశ్నలు అడుగుతాను.", "I'll ask a few short questions about your TB medicines."],
    questions: [
      { key: "q_meds", fields: ["tb_meds_daily"], line: ["టీబీ మాత్రలు రోజూ వేసుకుంటున్నారా?", "Are you taking your TB tablets every day?"] },
      { key: "q_missed", fields: ["missed_doses"], line: ["ఈ వారంలో ఎన్ని డోసులు మిస్ అయ్యాయి?", "How many doses did you miss this week?"] },
      { key: "q_symptoms", fields: ["blood_sputum", "fever", "weight_loss", "cough", "breathless", "mild_symptoms"], line: ["దగ్గులో రక్తం పడటం, జ్వరం, బరువు తగ్గడం ఏమైనా ఉన్నాయా?", "Any blood when coughing, fever or weight loss?"] },
      { key: "q_side", fields: ["jaundice", "rash"], line: ["కళ్ళు పసుపు రంగులోకి మారడం కానీ, ఒంటిపై దద్దుర్లు కానీ ఉన్నాయా?", "Any yellowing of the eyes, or a skin rash?"] },
    ],
    fields: {
      tb_meds_daily: { type: "bool", bad: false, en: "Taking TB tablets daily", te: "రోజూ టీబీ మాత్రలు", hint: "true if taking TB tablets every day, false if not", s: ["taking TB tablets daily", "not taking TB tablets daily"] },
      missed_doses: { type: "int", min: 0, max: 21, en: "Doses missed this week", te: "మిస్ అయిన డోసులు", hint: "number of doses missed this week (0 if none)" },
      blood_sputum: { type: "bool", bad: true, en: "Blood in cough", te: "దగ్గులో రక్తం", hint: "true if there is blood in the cough or sputum", s: ["blood in cough", null] },
      fever: { type: "bool", bad: true, en: "Fever", te: "జ్వరం", hint: "true if fever", s: ["fever", null] },
      weight_loss: { type: "bool", bad: true, en: "Weight loss", te: "బరువు తగ్గడం", hint: "true if losing weight", s: ["weight loss", null] },
      cough: { type: "bool", bad: true, en: "Still coughing", te: "దగ్గు", hint: "true if still coughing", s: ["still coughing", null] },
      breathless: { type: "bool", bad: true, en: "Breathlessness", te: "ఆయాసం", hint: "true if breathlessness", s: ["breathlessness", null] },
      mild_symptoms: { type: "bool", bad: true, en: "Other discomfort", te: "ఇతర ఇబ్బందులు", hint: "true if they say they have some discomfort but name no specific symptom", s: ["some discomfort", null] },
      jaundice: { type: "bool", bad: true, en: "Yellow eyes (jaundice)", te: "కళ్ళు పసుపు", hint: "true if the eyes or skin have turned yellow", s: ["yellow eyes", null] },
      rash: { type: "bool", bad: true, en: "Skin rash", te: "దద్దుర్లు", hint: "true if skin rash or itching", s: ["skin rash", null] },
    },
  },
};

const ACKS = [["సరే.", "Okay."], ["అర్థమైంది.", "Understood."], ["సరే, నోట్ చేసుకున్నాను.", "Okay, noted."]];
const SORRY = ["క్షమించండి, సరిగ్గా వినపడలేదు.", "Sorry, I couldn't hear that clearly."];
const CLOSE = {
  high: ["మీరు చెప్పింది చాలా ముఖ్యం. దయచేసి ఈరోజే దగ్గర్లోని PHC కి వెళ్ళండి, మీ ASHA కార్యకర్తకు చెప్పండి. అత్యవసరమైతే 108 కి కాల్ చేయండి.", "What you told me is important. Please go to the nearest PHC today and tell your ASHA worker. Call 108 in an emergency."],
  medium: ["ధన్యవాదాలు. మాత్రలు మిస్ కాకుండా రోజూ వేసుకోండి. రెండు రోజుల్లో మళ్ళీ కాల్ చేస్తాను.", "Thank you. Please take your tablets every day without missing a dose. I will check on you again in two days."],
  low: ["చాలా సంతోషం, అంతా బాగానే ఉంది. ఇలాగే జాగ్రత్తగా ఉండండి. వచ్చే వారం మళ్ళీ కాల్ చేస్తాను.", "Glad to hear everything is fine. Take care, and I will check on you again next week."],
};
const ACTION = { high: "Visit the PHC today and inform the ASHA worker", medium: "Follow-up call in 2 days", low: "Routine follow-up next week" };
const NEXT = { high: DAY, medium: 2 * DAY, low: 7 * DAY };
const RISK_ORDER = { high: 0, medium: 1, low: 2 };

/* ------------------------------------------------------------ risk rules */

function assess(program, f) {
  const high = [];
  const medium = [];
  if (program === "anc") {
    if (f.bleeding) high.push("Bleeding or water leaking");
    if (f.baby_movement === false) high.push("Baby movements reduced or absent");
    if (f.headache_vision && f.swelling) high.push("Severe headache / blurred vision with swelling (possible pre-eclampsia)");
    else if (f.headache_vision) high.push("Severe headache or blurred vision");
    if (f.fits) high.push("Fits or convulsions");
    if (f.swelling && !f.headache_vision) medium.push("Face or hand swelling: check BP");
    if (f.ifa_taken === false) medium.push("Not taking iron-folic acid tablets");
    if (f.fever) medium.push("Fever");
    if (f.checkup_known === false) medium.push("Does not know next check-up date");
  } else if (program === "ncd") {
    if (f.chest_pain) high.push("Chest pain");
    if (f.fainting) high.push("Fainting");
    if (f.breathless) high.push("Breathlessness");
    if (f.sugar > 300) high.push(`Very high sugar (${f.sugar} mg/dL)`);
    if (f.bp_systolic > 180 || f.bp_diastolic > 110) high.push(`Very high BP (${f.bp_systolic ?? "?"}/${f.bp_diastolic ?? "?"})`);
    if (f.meds_today === false) medium.push("Did not take tablets today");
    if (f.missed_days >= 3) medium.push(`Missed tablets on ${f.missed_days} days this week`);
    if (f.dizziness) medium.push("Dizziness");
    if (f.mild_symptoms) medium.push("Reported some discomfort");
    if (f.sugar > 200 && f.sugar <= 300) medium.push(`High sugar (${f.sugar} mg/dL)`);
    if (f.bp_systolic >= 160 && f.bp_systolic <= 180) medium.push(`High BP (${f.bp_systolic}/${f.bp_diastolic ?? "?"})`);
  } else {
    if (f.blood_sputum) high.push("Blood in cough");
    if (f.jaundice) high.push("Yellow eyes: possible drug-induced jaundice");
    if (f.breathless) high.push("Breathlessness");
    if (f.tb_meds_daily === false) medium.push("Not taking TB tablets daily");
    if (f.missed_doses >= 1) medium.push(`Missed ${f.missed_doses} dose${f.missed_doses === 1 ? "" : "s"} this week`);
    if (f.fever) medium.push("Fever");
    if (f.weight_loss) medium.push("Weight loss");
    if (f.cough) medium.push("Still coughing");
    if (f.rash) medium.push("Skin rash (possible side effect)");
    if (f.mild_symptoms) medium.push("Reported some discomfort");
  }
  const risk = high.length ? "high" : medium.length ? "medium" : "low";
  return { risk, reasons: high.length || medium.length ? [...high, ...medium] : ["No danger signs reported"] };
}

function summarize(program, f) {
  const P = PROGRAMS[program];
  const parts = [];
  for (const [k, d] of Object.entries(P.fields)) {
    const v = f[k];
    if (v === undefined || v === null || d.type !== "bool") continue;
    const text = v ? d.s?.[0] : d.s?.[1];
    if (text) parts.push(text);
  }
  if (program === "ncd") {
    if (f.missed_days > 0) parts.push(`missed ${f.missed_days} day${f.missed_days === 1 ? "" : "s"} this week`);
    else if (f.missed_days === 0) parts.push("no missed days");
    if (f.sugar) parts.push(`sugar ${f.sugar}`);
    if (f.bp_systolic) parts.push(`BP ${f.bp_systolic}/${f.bp_diastolic ?? "?"}`);
  }
  if (program === "tb") {
    if (f.missed_doses > 0) parts.push(`missed ${f.missed_doses} dose${f.missed_doses === 1 ? "" : "s"}`);
    else if (f.missed_doses === 0) parts.push("no missed doses");
  }
  const s = parts.join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "No answers recorded";
}

const adherent = (program, a = {}) =>
  program === "anc" ? a.ifa_taken !== false
    : program === "ncd" ? a.meds_today !== false && !(a.missed_days >= 3)
      : a.tb_meds_daily !== false && !(a.missed_doses >= 1);

function recordCall(p, answers, transcript) {
  const at = Date.now();
  const { risk, reasons } = assess(p.program, answers);
  const call = { at, risk, reasons, summary: summarize(p.program, answers), answers: { ...answers }, action: ACTION[risk], via: "ai-call", transcript };
  p.lastCall = call;
  p.history = [call, ...(p.history || [])].slice(0, 20);
  p.nextCallDue = at + NEXT[risk];
  return call;
}

/* ------------------------------------------------- understanding answers */

function extractPrompt(program, known, q, utterance, patient) {
  const P = PROGRAMS[program];
  const fieldLines = Object.entries(P.fields).map(([k, d]) => `"${k}": ${d.type === "int" ? "integer" : "true or false"}. ${d.hint}.`);
  return [
    {
      role: "system",
      content: [
        `You read a patient's reply during a health follow-up call in India. Programme: ${P.label}. Patient: ${patient.detail || P.label}.`,
        "The patient may speak any Indian language or English, or a mix, and the text may contain speech-recognition mistakes.",
        "Return ONLY a JSON object (no code fence, no explanation) containing just the fields the patient actually answered. Omit anything not answered. Never guess.",
        "Fields:",
        ...fieldLines,
        `The last question was: "${q.line[1]}" (fields: ${q.fields.join(", ")}).`,
        'A bare "no" in any language (no, లేదు, नहीं, இல்லை, ಇಲ್ಲ, ഇല്ല, नाही, না, ના, ਨਹੀਂ, ନାହିଁ) means false for every yes/no field of that question. A bare "yes" (yes, అవును, हाँ, ஆமாம், ಹೌದು, അതെ, हो, হ্যাঁ, હા, ਹਾਂ, ହଁ) means true for a single yes/no question.',
        "For a question about several symptoms, never mark a specific symptom true unless the patient names it; a bare yes there means mild_symptoms = true.",
        'For "how many" questions, "none" / "లేదు" / "एक भी नहीं" means 0.',
        'Numbers may be words in any language (e.g. రెండు = 2, दो = 2). "160 by 100" or "160/100" means bp_systolic 160 and bp_diastolic 100.',
        `Already known: ${JSON.stringify(known)}`,
      ].join("\n"),
    },
    { role: "user", content: utterance },
  ];
}

function clean(program, raw) {
  const P = PROGRAMS[program];
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, d] of Object.entries(P.fields)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (d.type === "bool") {
      if (v === true || v === false) out[k] = v;
      else if (typeof v === "string" && /^(true|yes)$/i.test(v.trim())) out[k] = true;
      else if (typeof v === "string" && /^(false|no)$/i.test(v.trim())) out[k] = false;
    } else {
      const n = typeof v === "number" ? Math.round(v) : parseInt(v, 10);
      if (Number.isFinite(n) && n >= d.min && n <= d.max) out[k] = n;
    }
  }
  return out;
}

// The model sometimes fills every field with a default ("no symptoms", 0 missed
// days) when only one question was answered, which would skip the remaining
// questions. Keep the answer to the question asked; from anything else keep
// only what was clearly volunteered: a danger sign, a reading, missed days.
function relevant(program, q, captured) {
  const P = PROGRAMS[program];
  const out = {};
  for (const [k, v] of Object.entries(captured)) {
    const d = P.fields[k];
    if (q.fields.includes(k)) out[k] = v;
    else if (d.type === "bool" && d.bad === true && v === true) out[k] = v;
    else if (d.type === "int" && (k === "sugar" || k.startsWith("bp_") || v > 0)) out[k] = v;
  }
  return out;
}

const NEG = /(^|[\s,.!?])(లేదు|లేవు|లేదండి|లేవండి|లేనే లేదు|కాదు|ledu|ledhu|levu|ledandi|no|nope|nothing|none|kaadu|नहीं|नही|nahi|nahin)($|[\s,.!?])/i;
const POS = /(^|[\s,.!?])(అవును|అవునండి|ఉంది|ఉన్నాయి|ఉందండి|వేసుకున్నా|వేసుకుంటున్నా|వేసుకుంటున్నాను|తెలుసు|avunu|undi|unnayi|yes|haa|telusu|हाँ|हां|haan)($|[\s,.!?])/i;
const DONT_KNOW = /తెలియదు|teliyadu|telidu|don'?t know|not sure|पता नहीं/i;
const TE_NUM = { "ఒకటి": 1, "ఒక్క": 1, "రెండు": 2, "మూడు": 3, "నాలుగు": 4, "ఐదు": 5, "ఆరు": 6, "ఏడు": 7 };

// Safety net for when the model returns nothing for the question just asked:
// plain yes / no / numbers are common, short and unambiguous.
function fallback(program, q, said) {
  const P = PROGRAMS[program];
  const out = {};
  const unknown = DONT_KNOW.test(said);
  const neg = NEG.test(said) || unknown;
  const pos = !neg && POS.test(said);
  const digits = (said.match(/\d{1,3}/g) || []).map(Number);
  const teNum = Object.entries(TE_NUM).find(([w]) => said.includes(w))?.[1];
  const ints = q.fields.filter((k) => P.fields[k].type === "int");
  const bools = q.fields.filter((k) => P.fields[k].type === "bool" && k !== "mild_symptoms" && k !== "reading_unknown");

  if (q.key === "q_reading") {
    const bp = said.match(/(\d{2,3})\s*(?:\/|by|బై)\s*(\d{2,3})/i);
    if (bp) { out.bp_systolic = +bp[1]; out.bp_diastolic = +bp[2]; }
    else if (digits.length) out.sugar = digits[0];
    else if (unknown || neg) out.reading_unknown = true;
    return clean(program, out);
  }
  if (ints.length) {
    if (digits.length) out[ints[0]] = digits[0];
    else if (teNum) out[ints[0]] = teNum;
    else if (neg) out[ints[0]] = 0;
    return clean(program, out);
  }
  if (bools.length === 1) {
    if (neg) out[bools[0]] = false;
    else if (pos) out[bools[0]] = true;
  } else if (bools.length > 1) {
    if (neg) for (const k of bools) out[k] = false;
    else if (pos && "mild_symptoms" in P.fields) out.mild_symptoms = true;
  }
  return out;
}

const cleanText = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/* ----------------------------------------------------------------- module */

export default {
  id: "arogya",
  async register(app, ctx) {
    const store = ctx.store("arogya", () => ({ patients: [] }));
    const log = (...a) => (ctx.log ? ctx.log(...a) : console.log(...a));
    const patients = () => store.data.patients;

    // Drop anything old: earlier builds seeded demo patients, and public
    // records expire after the retention window.
    function prune() {
      const list = Array.isArray(store.data.patients) ? store.data.patients : [];
      const cutoff = Date.now() - RETENTION;
      let kept = list.filter((p) => !p.demo && p.source === "public" && (p.createdAt || 0) >= cutoff);
      if (kept.length > MAX_PATIENTS) kept = kept.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_PATIENTS);
      if (kept.length !== list.length || !Array.isArray(store.data.patients)) {
        store.data.patients = kept;
        store.save();
      }
    }
    prune();
    setInterval(prune, HOUR).unref?.();

    const find = (id) => patients().find((p) => p.id === id);
    const sessions = new Map();
    const fail = (reply, code, error) => { reply.code(code); return { error }; };

    /* ---- language */
    const langOf = (l) => (typeof ctx.i18n?.normLang === "function" ? ctx.i18n.normLang(l) : normLang(l));
    const codeOf = (l) => (typeof ctx.i18n?.sarvamCode === "function" ? ctx.i18n.sarvamCode(l) : sarvamCode(l));
    const translations = new Map();

    // Translate the English lines of one reply in a single call (core caches on disk).
    async function translateAll(lang, ens) {
      const need = [...new Set(ens.filter((en) => en && !translations.has(`${lang}|${en}`)))];
      if (!need.length) return;
      try {
        let map = {};
        if (typeof ctx.i18n?.translate === "function") {
          const r = await ctx.i18n.translate(lang, need);
          map = Array.isArray(r) ? Object.fromEntries(need.map((en, i) => [en, r[i]])) : r || {};
        } else {
          for (const en of need) {
            const { text } = await ctx.ai.llm(
              [
                { role: "system", content: `Translate the user's message into natural, simple spoken ${LANGS[lang] || "Hindi"} for a phone call with a patient in India. Keep ASHA, PHC, BP, TB and 108 as they are. Reply with only the translation.` },
                { role: "user", content: en },
              ],
              { temperature: 0, max_tokens: 300 },
            );
            map[en] = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          }
        }
        for (const en of need) if (typeof map[en] === "string" && map[en] && map[en] !== en) translations.set(`${lang}|${en}`, map[en]);
      } catch (e) {
        log("arogya translate failed:", e.message);
      }
    }

    // [te, en] → { te, en, text, lang }: `text` is what the caller hears and reads.
    // A line that could not be translated is said in English (and spoken as English).
    async function linesFor(lang, lines) {
      if (lang !== "te" && lang !== "en") await translateAll(lang, lines.map((l) => l[1]));
      return lines.map(([te, en]) => {
        if (lang === "te") return { te, en, text: te, lang: "te" };
        const t = lang === "en" ? null : translations.get(`${lang}|${en}`);
        return t ? { te, en, text: t, lang } : { te, en, text: en, lang: "en" };
      });
    }
    const speak = (items) => Promise.all(items.map((it) => ctx.voice.tts(it.text, codeOf(it.lang)).catch(() => null)));

    /* ---- answers */
    async function readAnswers(messages) {
      if (typeof ctx.ai.llmJSON === "function") return ctx.ai.llmJSON(messages, { max_tokens: 300 });
      const { text, engine } = await ctx.ai.llm(messages, { max_tokens: 300, json: true });
      const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
      const a = t.indexOf("{");
      const b = t.lastIndexOf("}");
      let data = null;
      try { if (a >= 0 && b > a) data = JSON.parse(t.slice(a, b + 1)); } catch { /* tolerated */ }
      return { data, engine };
    }

    function nextQuestion(s) {
      for (const q of PROGRAMS[s.program].questions) {
        const answered = q.fields.some((k) => s.f[k] !== undefined);
        if (!answered && (s.asked[q.key] || 0) < 2) return q;
      }
      return null;
    }

    const programMeta = Object.fromEntries(
      Object.entries(PROGRAMS).map(([id, P]) => [id, {
        label: P.label, te: P.te,
        fields: Object.fromEntries(Object.entries(P.fields).map(([k, d]) => [k, { en: d.en, te: d.te, type: d.type, bad: d.bad }])),
        questions: P.questions.map((q) => ({ key: q.key, te: q.line[0], en: q.line[1], fields: q.fields })),
      }]),
    );

    // Transcripts stay on the server: the list is readable without a login.
    const strip = (c) => (c ? { ...c, transcript: undefined } : c);
    const publicView = (p) => ({ ...p, lastCall: strip(p.lastCall), history: (p.history || []).map(strip) });

    function stats() {
      const list = patients();
      const today = istDayStart(Date.now());
      const called = list.filter((p) => p.lastCall);
      return {
        patients: list.length,
        callsToday: list.reduce((n, p) => n + (p.history || []).filter((h) => h.at >= today).length, 0),
        highRisk: list.filter((p) => p.lastCall?.risk === "high").length,
        mediumRisk: list.filter((p) => p.lastCall?.risk === "medium").length,
        lowRisk: list.filter((p) => p.lastCall?.risk === "low").length,
        notCalled: list.length - called.length,
        adherencePct: called.length ? Math.round((100 * called.filter((p) => adherent(p.program, p.lastCall.answers)).length) / called.length) : 0,
        dueNow: list.filter((p) => p.nextCallDue <= Date.now()).length,
        byProgram: Object.fromEntries(Object.keys(PROGRAMS).map((k) => [k, list.filter((p) => p.program === k).length])),
        retentionHours: RETENTION / HOUR,
      };
    }

    const sorted = () => [...patients()].sort((a, b) =>
      (RISK_ORDER[a.lastCall?.risk] ?? 3) - (RISK_ORDER[b.lastCall?.risk] ?? 3) || a.nextCallDue - b.nextCallDue);

    /* ---- routes */
    app.get("/patients", async () => ({ patients: sorted().map(publicView), programs: programMeta }));
    app.get("/stats", async () => stats());

    // Start a call. Either { patientId } for a follow-up call, or
    // { name, program, detail? } to register a new caller (no login).
    app.post("/call/start", async (req, reply) => {
      const b = req.body || {};
      const lang = langOf(b.lang || "en");
      let p = b.patientId ? find(String(b.patientId)) : null;
      if (b.patientId && !p) return fail(reply, 404, "Patient not found. It may have expired; please register again.");
      if (!p) {
        const name = cleanText(b.name, 60);
        const program = String(b.program || "").toLowerCase();
        if (!name) return fail(reply, 400, "Please enter your name.");
        if (!PROGRAMS[program]) return fail(reply, 400, 'Choose a programme: "anc", "ncd" or "tb".');
        // Pressing Start twice should not create two records.
        const key = name.toLowerCase();
        p = patients().find((x) => x.program === program && x.name.toLowerCase() === key && Date.now() - x.createdAt < 30 * MIN);
        if (!p) {
          p = {
            id: `P-${crypto.randomUUID().slice(0, 8)}`,
            name,
            program,
            detail: cleanText(b.detail, 80) || PROGRAMS[program].label,
            createdAt: Date.now(),
            source: "public",
            lang,
            nextCallDue: Date.now(),
            lastCall: null,
            history: [],
          };
          patients().unshift(p);
          prune();
          store.save();
          ctx.sse.broadcast("arogya:patient", publicView(p));
        }
      }
      p.lang = lang;
      const P = PROGRAMS[p.program];
      const hello = [`నమస్కారం ${p.name} గారు. నేను ఆరోగ్య మిత్ర, మీ ఆరోగ్య సహాయకురాలిని.`, `Hello ${p.name}, this is Arogya Mitra, your health follow-up assistant.`];
      const first = P.questions[0];
      const s = { id: crypto.randomUUID(), created: Date.now(), patientId: p.id, program: p.program, lang, f: {}, asked: { [first.key]: 1 }, lastQ: first, turns: [], done: false };
      sessions.set(s.id, s);
      setTimeout(() => sessions.delete(s.id), 30 * MIN).unref?.();
      const items = await linesFor(lang, [hello, P.intro, first.line]);
      s.turns.push({ who: "agent", text: items.map((i) => i.text).join(" ") });
      return {
        sessionId: s.id,
        lang,
        reply: items,
        audios: await speak(items),
        fields: s.f,
        preview: null,
        result: { patient: publicView(p), questions: P.questions.length },
        engine: ctx.ai.hasGemini ? "gemini" : "sarvam",
      };
    });

    app.post("/call/turn", async (req, reply) => {
      const body = req.body || {};
      const s = sessions.get(body.sessionId);
      if (!s) return fail(reply, 404, "This call has expired. Please start a new call.");
      if (s.done) return fail(reply, 409, "This call has already finished.");
      const p = find(s.patientId);
      if (!p) return fail(reply, 404, "Patient not found.");

      let said = cleanText(body.text, 600);
      const timing = {};
      if (!said && typeof body.audio === "string" && body.audio) {
        const buf = Buffer.from(body.audio, "base64");
        if (buf.length > 3_000_000) return fail(reply, 413, "Audio too long.");
        const t0 = Date.now();
        try { said = (await ctx.voice.stt(buf, codeOf(s.lang))) || ""; } catch (e) { log("arogya stt failed:", e.message); }
        timing.sttMs = Date.now() - t0;
      }

      let captured = {};
      let engine;
      if (said) {
        s.turns.push({ who: "patient", text: said });
        const t1 = Date.now();
        try {
          const r = await readAnswers(extractPrompt(s.program, s.f, s.lastQ, said, p));
          captured = relevant(s.program, s.lastQ, clean(s.program, r.data));
          engine = r.engine;
        } catch (e) {
          log("arogya extract failed:", e.message);
        }
        timing.aiMs = Date.now() - t1;
        if (!s.lastQ.fields.some((k) => k in captured)) Object.assign(captured, fallback(s.program, s.lastQ, said));
        Object.assign(s.f, captured);
      }

      s.n = (s.n || 0) + 1;
      const lines = [!said || !Object.keys(captured).length ? SORRY : ACKS[s.n % 3]];
      const now = assess(s.program, s.f);
      // A danger sign ends the questions at once: the patient needs care, not more questions.
      const q = now.risk === "high" ? null : nextQuestion(s);
      if (q) {
        s.asked[q.key] = (s.asked[q.key] || 0) + 1;
        s.lastQ = q;
        lines.push(q.line);
      } else {
        s.done = true;
        lines.push(CLOSE[now.risk]);
      }
      const items = await linesFor(s.lang, lines);
      for (const it of items) s.turns.push({ who: "agent", text: it.text });
      let result;
      if (s.done) {
        const call = recordCall(p, s.f, s.turns);
        store.save();
        ctx.sse.broadcast("arogya:patient", publicView(p));
        result = { patient: publicView(p), risk: call.risk, reasons: call.reasons, summary: call.summary, action: call.action };
      }
      return {
        sessionId: s.id, said, captured, fields: s.f, preview: now, done: s.done, result, timing,
        engine: engine || (ctx.ai.hasGemini ? "gemini" : "sarvam"),
        lang: s.lang,
        reply: items,
        audios: await speak(items),
      };
    });

    // Patients registered here give no phone number, so nothing can be dialled
    // automatically. Report who is due instead of inventing call outcomes.
    app.post("/campaign", async (req) => {
      const program = PROGRAMS[req.body?.program] ? req.body.program : null;
      const due = sorted().filter((p) => (!program || p.program === program) && p.nextCallDue <= Date.now());
      return {
        started: false,
        called: 0,
        due: due.length,
        dueIds: due.map((p) => p.id),
        message: due.length
          ? `${due.length} patient${due.length === 1 ? " is" : "s are"} due. Automatic phone calls are not enabled here, so start each call from the dashboard.`
          : "No patients are due for a call right now.",
      };
    });

    app.post("/reset", async () => {
      store.data.patients = [];
      store.save();
      sessions.clear();
      ctx.sse.broadcast("arogya:reset", {});
      return { ok: true, patients: 0 };
    });

    // Core pre-renders only ctx.flow lines, and these calls don't use ctx.flow.
    // Production (or PREWARM=1) only, one line at a time, so the TTS rate limit
    // is left for live calls. A failed line renders live later.
    if (process.env.NODE_ENV === "production" || process.env.PREWARM === "1") {
      setTimeout(async () => {
        const lines = [...ACKS, SORRY, ...Object.values(CLOSE)];
        for (const P of Object.values(PROGRAMS)) lines.push(P.intro, ...P.questions.map((q) => q.line));
        let ok = 0;
        for (const lang of ["en", "te"]) {
          for (const it of await linesFor(lang, lines)) {
            if ((await speak([it]))[0]) ok++;
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        log(`arogya: ${ok}/${lines.length * 2} voice lines pre-rendered (en + te)`);
      }, 4000).unref?.();
    }
  },
};

export { assess, summarize, fallback, clean, PROGRAMS };
