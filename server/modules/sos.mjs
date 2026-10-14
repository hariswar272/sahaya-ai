// Disaster SOS: Telugu voice/text SOS → AI triage → priority map → nearest rescue team.

/* ------------------------------------------------------------ geography */

// Approximate locality centroids for the Vijayawada demo (flood-hit in 2024).
const CITY = [16.5193, 80.6305];
const AREAS = {
  "Singh Nagar": [16.5323, 80.6461],
  "Ajit Singh Nagar": [16.5368, 80.6402],
  "Payakapuram": [16.5466, 80.6482],
  "Prakash Nagar": [16.5405, 80.6545],
  "Vambay Colony": [16.5508, 80.6331],
  "Rajarajeswari Peta": [16.5262, 80.6368],
  "Kandrika": [16.5512, 80.6626],
  "Jakkampudi": [16.5648, 80.6188],
  "Nunna": [16.5862, 80.6669],
  "Gunadala": [16.5258, 80.6668],
  "Ramavarappadu": [16.5215, 80.6893],
  "Krishna Lanka": [16.5009, 80.6301],
  "Ranigarithota": [16.5046, 80.6378],
  "Bhavanipuram": [16.5318, 80.5958],
  "Gollapudi": [16.5397, 80.5812],
  "Patamata": [16.4968, 80.6649],
  "Benz Circle": [16.4996, 80.6556],
  "Governorpet": [16.5117, 80.6297],
  "One Town": [16.5194, 80.6118],
  "Labbipet": [16.5040, 80.6480],
};

const TEAM_SEED = [
  { id: "B1", type: "boat", name: "SDRF Boat 1", at: [16.5290, 80.6420] },
  { id: "B2", type: "boat", name: "SDRF Boat 2", at: [16.5440, 80.6470] },
  { id: "B3", type: "boat", name: "NDRF Boat 3", at: [16.5500, 80.6300] },
  { id: "B4", type: "boat", name: "NDRF Boat 4", at: [16.5060, 80.6330] },
  { id: "M1", type: "medical", name: "Medical Team 1", at: [16.5200, 80.6500] },
  { id: "M2", type: "medical", name: "Medical Team 2", at: [16.5400, 80.6600] },
  { id: "F1", type: "food", name: "Relief Van 1", at: [16.5150, 80.6300] },
  { id: "F2", type: "food", name: "Relief Van 2", at: [16.5250, 80.6650] },
];

function km([a1, o1], [a2, o2]) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/* --------------------------------------------------------------- triage */

const WATER_RANK = { none: 0, ankle: 1, knee: 2, waist: 3, chest: 4, first_floor: 5, roof: 6 };
const NEEDS = ["rescue", "food", "water", "medicine", "baby_food", "shelter", "power"];
const LIFE = /dialysis|oxygen|injur|bleed|unconscious|labou?r|deliver|heart|breath|snake|electr|insulin|seizure|fits|stroke/i;

const vulnOf = (i) => (i.elderly || 0) + (i.children || 0) + (i.pregnant || 0) + (i.disabled || 0) + (i.sick || 0);

// The model only extracts facts; these rules decide priority, so every
// decision is explainable and auditable by the control room.
function triage(i) {
  const reasons = [];
  const vuln = vulnOf(i);
  const w = WATER_RANK[i.water] ?? 0;
  let p = "low";
  if ((i.medical || []).some((m) => LIFE.test(m))) { p = "critical"; reasons.push("Life-critical medical need"); }
  if (w >= 4 && vuln > 0) { p = "critical"; reasons.push("Deep water + vulnerable people"); }
  if ((i.pregnant || 0) > 0 && w >= 3) { p = "critical"; reasons.push("Pregnant woman in rising water"); }
  if (p !== "critical") {
    if (w >= 4) { p = "high"; reasons.push("Water at chest / first floor or above"); }
    else if (vuln > 0) { p = "high"; reasons.push(`${vuln} vulnerable ${vuln === 1 ? "person" : "people"}`); }
    else if ((i.needs || []).includes("rescue")) { p = "high"; reasons.push("Asked for rescue"); }
    else if ((i.needs || []).some((n) => ["food", "water", "medicine", "baby_food", "shelter"].includes(n))) { p = "medium"; reasons.push("Needs relief supplies"); }
    else reasons.push("No immediate danger reported");
  }
  const score = { critical: 400, high: 300, medium: 200, low: 100 }[p] + Math.min(50, (i.people || 1) * 3) + vuln * 5 + w * 4;
  return { priority: p, score, reasons };
}

function summarize(i) {
  const parts = [`${i.people || "?"} ${i.people === 1 ? "person" : "people"} at ${i.area}${i.landmark ? ` (${i.landmark})` : ""}`];
  if (i.water && i.water !== "none" && i.water !== "unknown") parts.push(`water: ${i.water.replace("_", " ")}`);
  const v = [];
  if (i.elderly) v.push(`${i.elderly} elderly`);
  if (i.children) v.push(`${i.children} children`);
  if (i.pregnant) v.push(`${i.pregnant} pregnant`);
  if (i.disabled) v.push(`${i.disabled} disabled`);
  if (i.sick) v.push(`${i.sick} sick`);
  if (v.length) parts.push(v.join(", "));
  if (i.medical?.length) parts.push(`medical: ${i.medical.join(", ")}`);
  if (i.needs?.length) parts.push(`needs: ${i.needs.join(", ").replace("_", " ")}`);
  return parts.join(" · ");
}

/* ----------------------------------------------------------- incidents */

function buildIncident(d, f, { channel, transcript, createdAt }) {
  const local = f.area && AREAS[f.area] ? f.area : null;
  const place = local ? null : findPlace(f.area, f.landmark);
  const area = local || (f.area && f.area !== "Other" ? f.area : place);
  const base = local ? AREAS[local] : place ? PLACES[place] : CITY;
  const jitter = () => (Math.random() - 0.5) * 0.006;
  const at = createdAt || Date.now();
  const inc = {
    id: `SOS-${d.seq++}`, createdAt: at, updatedAt: at, channel, status: "new",
    name: f.name || "", area: area || (f.area === "Other" ? "Other area" : "Location unclear"), landmark: f.landmark || "",
    lat: +(base[0] + jitter()).toFixed(5), lng: +(base[1] + jitter()).toFixed(5),
    people: f.people || 1, water: f.water || "unknown",
    elderly: f.elderly || 0, children: f.children || 0, pregnant: f.pregnant || 0, disabled: f.disabled || 0, sick: f.sick || 0,
    medical: f.medical || [], needs: f.needs || [], transcript: transcript || [], team: null,
  };
  Object.assign(inc, triage(inc));
  inc.summary = summarize(inc);
  return inc;
}

function pickTeamType(i) {
  if ((i.needs || []).includes("rescue") || (WATER_RANK[i.water] ?? 0) >= 4) return "boat";
  if ((i.medical || []).length || (i.needs || []).includes("medicine")) return "medical";
  return "food";
}

function assign(d, i) {
  const free = d.teams.filter((t) => !t.busyWith);
  let pool = free.filter((t) => t.type === pickTeamType(i));
  if (!pool.length) pool = free;
  if (!pool.length) return null;
  const best = pool.map((t) => ({ t, dist: km(t.at, [i.lat, i.lng]) })).sort((a, b) => a.dist - b.dist)[0];
  const speed = { boat: 10, medical: 18, food: 20 }[best.t.type];
  best.t.busyWith = i.id;
  i.team = { id: best.t.id, name: best.t.name, type: best.t.type, km: +best.dist.toFixed(1), eta: Math.max(4, Math.round((best.dist / speed) * 60) + 3), at: Date.now() };
  i.status = "assigned";
  i.updatedAt = Date.now();
  return i.team;
}

function resolveIncident(d, i) {
  const t = d.teams.find((x) => x.busyWith === i.id);
  if (t) { t.busyWith = null; t.at = [i.lat, i.lng]; }
  i.status = "resolved";
  i.updatedAt = Date.now();
}

// No sample incidents: everything on the map comes from real calls, text SOS or the
// incoming-message box. The rescue teams stay (dispatch needs someone to send), and each is
// labelled as a sample deployment so nobody mistakes it for a live roster.
const TEAM_LABEL = "sample deployment";
const freshTeams = () => TEAM_SEED.map((t) => ({ ...t, at: [...t.at], busyWith: null, label: TEAM_LABEL }));

function seedData() {
  return { seq: 1001, incidents: [], teams: freshTeams() };
}

function forecast(d) {
  const open = d.incidents.filter((i) => i.status !== "resolved");
  const by = new Map();
  for (const i of open) {
    const a = by.get(i.area) || { area: i.area, requests: 0, people: 0, vulnerable: 0, critical: 0, rescue: 0, recent: 0 };
    a.requests++;
    a.people += i.people || 0;
    a.vulnerable += vulnOf(i);
    if (i.priority === "critical") a.critical++;
    if ((i.needs || []).includes("rescue") || (WATER_RANK[i.water] ?? 0) >= 4) a.rescue++;
    if (Date.now() - i.createdAt < 60 * 60 * 1000) a.recent++;
    by.set(i.area, a);
  }
  const areas = [...by.values()]
    .map((a) => ({ ...a, food_packets: a.people * 3, water_litres: a.people * 4, boats: Math.ceil(a.rescue / 3), medical_kits: a.vulnerable, hotspot: a.critical > 0 || a.recent >= 3 }))
    .sort((x, y) => y.critical - x.critical || y.people - x.people);
  const totals = areas.reduce(
    (t, a) => ({ requests: t.requests + a.requests, people: t.people + a.people, vulnerable: t.vulnerable + a.vulnerable, food_packets: t.food_packets + a.food_packets, water_litres: t.water_litres + a.water_litres, boats: t.boats + a.boats }),
    { requests: 0, people: 0, vulnerable: 0, food_packets: 0, water_litres: 0, boats: 0 },
  );
  return { areas, totals, generatedAt: Date.now() };
}

/* ------------------------------------------------------------- AI layer */

// Towns and cities across Andhra Pradesh and Telangana, so a caller anywhere is placed on the map.
const PLACES = {
  Guntur: [16.3067, 80.4365], Vijayawada: [16.5062, 80.648], Amaravati: [16.5131, 80.5165], Mangalagiri: [16.4307, 80.5525],
  Tenali: [16.243, 80.64], Nambur: [16.372, 80.531], Visakhapatnam: [17.6868, 83.2185], Nellore: [14.4426, 79.9865],
  Kurnool: [15.8281, 78.0373], Tirupati: [13.6288, 79.4192], Kakinada: [16.9891, 82.2475], Rajahmundry: [17.0005, 81.804],
  Eluru: [16.7107, 81.0952], Ongole: [15.5057, 80.0499], Anantapur: [14.6819, 77.6006], Kadapa: [14.4673, 78.8242],
  Machilipatnam: [16.1875, 81.1389], Hyderabad: [17.385, 78.4867], Warangal: [17.9689, 79.5941], Khammam: [17.2473, 80.1514],
  Nizamabad: [18.6725, 78.0941], Karimnagar: [18.4386, 79.1288], Bhadrachalam: [17.6688, 80.8936],
};
const ALIASES = { vizag: "Visakhapatnam", vishakapatnam: "Visakhapatnam", rajamahendravaram: "Rajahmundry", vvit: "Nambur", vvitu: "Nambur", bezawada: "Vijayawada" };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");

function matchArea(s) {
  const k = norm(s);
  if (!k) return null;
  for (const a of Object.keys(AREAS)) if (norm(a) === k) return a;
  return k === "other" ? "Other" : null;
}

/** A known town/city named in the area or landmark text, if any. */
function findPlace(...texts) {
  for (const t of texts) {
    const k = norm(t || "");
    if (!k) continue;
    if (ALIASES[k]) return ALIASES[k];
    for (const p of Object.keys(PLACES)) if (k.includes(norm(p))) return p;
    for (const [a, p] of Object.entries(ALIASES)) if (k.includes(a)) return p;
  }
  return null;
}

// The model likes to fill every field with a default (0, "none", "Unknown", no_vulnerable:true)
// even when the caller said nothing about it, which made the flow skip questions. So a "nothing"
// answer only counts when the caller actually said no, in answer to that very question.
const NEGATION = /లేరు|లేదు|లేవు|ఎవరూ|ఎవ్వరూ|కాదు|వద్దు|అవసరం లేదు|\b(no|none|nobody|nothing|nope|ledu|leru|levu|evaru|evvaru|vaddu|kaadu|kadu)\b/i;
const PLACEHOLDER_NAME = /^(unknown|caller|n\/?a|na|none|not (given|provided|stated)|anonymous|-+|\?+)$/i;

function clean(x, s) {
  const out = {};
  if (!x || typeof x !== "object") return out;
  const said = [...(s?.turns || [])].reverse().find((t) => t.who === "caller")?.text || "";
  const asked = s?.lastSlot || null;
  const negated = NEGATION.test(said);

  if (typeof x.area === "string") {
    const raw = x.area.trim();
    const a = matchArea(raw);
    if (a) out.area = a;
    // Any other town or village the caller names is accepted as their location.
    else if (raw && !/^(unknown|none|n\/?a|not (given|stated|provided))$/i.test(raw)) out.area = findPlace(raw) || raw.replace(/\s+/g, " ").slice(0, 40);
  }
  if (typeof x.landmark === "string" && x.landmark.trim() && !/^(unknown|none|n\/?a)$/i.test(x.landmark.trim())) out.landmark = x.landmark.trim().slice(0, 80);
  const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 && n < 500 ? n : undefined; };
  // Zero counts are dropped: "nobody vulnerable" is carried by no_vulnerable instead.
  for (const k of ["people", "elderly", "children", "pregnant", "disabled", "sick"]) { const n = int(x[k]); if (n !== undefined) out[k] = n; }
  if (typeof x.water === "string" && x.water in WATER_RANK && (x.water !== "none" || (negated && (!asked || asked === "water")))) out.water = x.water;
  const anyVuln = ["elderly", "children", "pregnant", "disabled", "sick"].some((k) => out[k]);
  if (x.no_vulnerable === true && !anyVuln && negated && (!asked || asked === "vulnerable")) out.no_vulnerable = true;
  if (x.no_medical === true && !out.medical && negated && (!asked || asked === "medical")) out.no_medical = true;
  if (Array.isArray(x.medical)) {
    const m = x.medical.filter((v) => typeof v === "string" && v.trim() && !/^(none|no|unknown|n\/?a)$/i.test(v.trim())).map((v) => v.trim().toLowerCase().slice(0, 40)).slice(0, 6);
    if (m.length) out.medical = m;
  }
  if (Array.isArray(x.needs)) { const n = x.needs.filter((v) => NEEDS.includes(v)); if (n.length) out.needs = [...new Set(n)]; }
  if (typeof x.name === "string" && x.name.trim() && !PLACEHOLDER_NAME.test(x.name.trim())) out.name = x.name.trim().slice(0, 40);
  return out;
}

function extractPrompt(known, asked, utterance) {
  return [
    {
      role: "system",
      content: [
        "You read what a caller said to a flood emergency helpline in Vijayawada, Andhra Pradesh. The caller may speak any Indian language or English, or a mix, and the text may contain speech-recognition mistakes.",
        "Return ONLY a JSON object (no code fence, no explanation) with the fields the caller actually stated. Omit anything not stated. Never guess.",
        "Fields:",
        `"area": where the caller is, in English letters. If it is one of these Vijayawada localities use exactly that name: ${Object.keys(AREAS).join(" | ")}. Otherwise give the town, city or village name as spoken (e.g. "గుంటూరు" = "Guntur", "విశాఖపట్నం" = "Visakhapatnam", "హైదరాబాద్" = "Hyderabad"). Match any script or misspelt form (e.g. "సింగ్ నగర్" = "Singh Nagar", "పాయకాపురం" = "Payakapuram").`,
        '"landmark": nearby landmark or street, in English letters.',
        '"people": total number of people with the caller, integer ("నేను ఒక్కడినే" / "I am alone" = 1, "ఐదుగురు" = 5).',
        '"water": one of exactly: none | ankle | knee | waist | chest | first_floor | roof (మోకాళ్ళు = knee, నడుము = waist, ఛాతీ = chest).',
        '"elderly", "children", "pregnant", "disabled", "sick": integer counts of such people.',
        '"no_vulnerable": true if the caller says there are no elderly, children, pregnant or sick people.',
        '"medical": array of short English medical needs, e.g. ["insulin","dialysis","injury","fever","oxygen","bp tablets"].',
        '"no_medical": true if the caller says nobody needs medical help.',
        '"needs": array, subset of: rescue | food | water | medicine | baby_food | shelter | power.',
        '"name": the caller\'s name in English letters.',
        `The agent's last question was about: ${asked}. A short reply like "ఐదుగురు", "నడుము వరకు" or "లేరు" answers that question.`,
        "Extract EVERY fact the caller states, even when it answers a different question than the one asked.",
        'Leave a field out entirely when the caller did not mention it. Never output 0, "none", "unknown" or an empty value as a default.',
        "Examples:",
        '"నడుము వరకు నీళ్ళు ఉన్నాయి" -> {"water":"waist"}',
        '"పాయకాపురంలో ఉన్నాం, ఆరుగురం" -> {"area":"Payakapuram","people":6}',
        '"నాన్నకి బీపీ, మందులు అయిపోయాయి" -> {"elderly":1,"medical":["bp tablets"]}',
        '"అమ్మమ్మకి ఇన్సులిన్ కావాలి" -> {"elderly":1,"medical":["insulin"]}  (అమ్మమ్మ / నానమ్మ / తాతయ్య / ముసలి = an elderly person)',
        '"బోర్ పంపండి" or "బోట్ పంపండి" (boat, often misheard) -> {"needs":["rescue"]}',
        '"ఎవరూ లేరు" (question was about vulnerable people) -> {"no_vulnerable":true}',
        '"ఆహారం, మంచినీళ్ళు కావాలి" -> {"needs":["food","water"]}',
        `Already known: ${JSON.stringify(known)}`,
      ].join("\n"),
    },
    { role: "user", content: utterance },
  ];
}

/* -------------------------------------------------------- conversation */

// Every line the agent can say is fixed and pre-rendered, so the agent never
// says anything unvetted and replies play instantly. The AI's job is to
// understand free-form Telugu speech; the flow decides what to ask next.
const L = {
  greeting: ["నమస్కారం, ఇది సహాయ AI అత్యవసర హెల్ప్‌లైన్. భయపడకండి, మేము మీకు సహాయం చేస్తాం.", "Hello, this is the Sahaya AI emergency helpline. Don't panic, we will help you."],
  area: ["మీరు ఇప్పుడు ఏ ఏరియాలో ఉన్నారు? దగ్గర్లో ఏదైనా గుర్తు చెప్పండి.", "Which area are you in right now? Tell me a nearby landmark."],
  people: ["మీతో పాటు మొత్తం ఎంత మంది ఉన్నారు?", "How many people are with you in total?"],
  water: ["నీళ్ళు ఎంత వరకు వచ్చాయి? మోకాళ్ళ వరకా, నడుము వరకా, లేక ఫస్ట్ ఫ్లోర్ వరకా?", "How high is the water? Knee, waist, or up to the first floor?"],
  vulnerable: ["మీలో వృద్ధులు, చిన్నపిల్లలు, గర్భిణీలు లేదా అనారోగ్యంతో ఉన్నవాళ్ళు ఎవరైనా ఉన్నారా?", "Is anyone elderly, a small child, pregnant, or unwell?"],
  medical: ["ఎవరికైనా వెంటనే మందులు లేదా డాక్టర్ సహాయం కావాలా?", "Does anyone need medicines or a doctor urgently?"],
  needs: ["మీకు ఇప్పుడు ముఖ్యంగా ఏం కావాలి? బోట్‌లో బయటకు తీసుకెళ్ళాలా, లేక ఆహారం, మంచినీళ్ళు, మందులు కావాలా?", "What do you need most right now? Boat rescue, or food, drinking water, medicines?"],
  name: ["చివరగా, మీ పేరు చెప్పండి.", "Lastly, please tell me your name."],
  ack1: ["సరే.", "Okay."],
  ack2: ["అర్థమైంది.", "Understood."],
  ack3: ["సరే, నోట్ చేసుకున్నాను.", "Okay, noted."],
  sorry: ["క్షమించండి, సరిగ్గా వినపడలేదు.", "Sorry, I couldn't hear that clearly."],
  safety: ["దయచేసి కరెంట్ మెయిన్ స్విచ్ ఆఫ్ చేసి, ఇంట్లో ఎత్తైన చోటికి వెళ్ళండి.", "Please switch off the main power and move to the highest point of the house."],
  close_critical: ["మీ వివరాలు నమోదు చేశాం. ఇది అత్యవసర కేసు, రెస్క్యూ టీమ్‌ని వెంటనే పంపిస్తున్నాం. ఫోన్ ఛార్జ్ ఉంచుకోండి, టీమ్ మీకు కాల్ చేస్తుంది.", "Your details are registered. This is an emergency case, so a rescue team is being sent right away. Keep your phone charged; the team will call you."],
  close_high: ["మీ వివరాలు నమోదు చేశాం. ఎక్కువ ప్రాధాన్యతతో రెస్క్యూ టీమ్‌కి పంపించాం. ఫోన్ ఛార్జ్ ఉంచుకోండి, టీమ్ మీకు కాల్ చేస్తుంది.", "Registered with high priority and sent to the rescue team. Keep your phone charged; the team will call you."],
  close_medium: ["మీ వివరాలు నమోదు చేశాం. సహాయక బృందం త్వరలో ఆహారం, నీళ్ళు తీసుకొస్తుంది. ఫోన్ ఛార్జ్ ఉంచుకోండి.", "Registered. The relief team will bring food and water soon. Keep your phone charged."],
  close_low: ["మీ వివరాలు నమోదు చేశాం. మా టీమ్ మిమ్మల్ని సంప్రదిస్తుంది. జాగ్రత్తగా ఉండండి.", "Registered. Our team will contact you. Please stay safe."],
};

const SLOTS = [
  { key: "area", filled: (f) => !!(f.area || f.landmark), maxAsks: 2 },
  { key: "people", filled: (f) => !!f.people, maxAsks: 2 },
  { key: "water", filled: (f) => !!f.water, maxAsks: 2 },
  { key: "vulnerable", filled: (f) => vulnOf(f) > 0 || !!f.no_vulnerable, maxAsks: 2 },
  { key: "medical", filled: (f) => !!(f.medical?.length || f.no_medical) || (!!f.no_vulnerable && !f.sick), maxAsks: 2 },
  { key: "needs", filled: (f) => !!f.needs?.length, maxAsks: 2 },
  { key: "name", filled: (f) => !!f.name, maxAsks: 2 },
];

/* ---------------------------------------------------------------- module */

const fail = (reply, e) => {
  const code = e?.statusCode || e?.status || 500;
  return reply.code(code >= 400 && code < 600 ? code : 500).send({ error: e?.message || "Something went wrong. Please try again." });
};

export default {
  id: "sos",
  async register(app, ctx) {
    const store = ctx.store("sos", seedData);
    if (!store.data?.teams?.length || !Array.isArray(store.data?.incidents)) store.reset?.();
    const D = () => store.data;

    // Data files written before the no-sample-data change still hold seeded incidents:
    // drop them, give the teams their starting posts back, and re-link real assignments.
    {
      const d = D();
      if (d.incidents.some((i) => i.demo)) {
        d.incidents = d.incidents.filter((i) => !i.demo);
        d.teams = freshTeams();
        for (const i of d.incidents) {
          const t = i.status === "assigned" && i.team ? d.teams.find((x) => x.id === i.team.id) : null;
          if (t) t.busyWith = i.id;
        }
      }
      for (const t of d.teams) t.label = TEAM_LABEL;
      store.save();
    }

    function createIncident(f, opts) {
      const d = D();
      const inc = buildIncident(d, f, opts);
      d.incidents.unshift(inc);
      // Life-threatening cases are dispatched instantly; the rest wait for an operator.
      if (inc.priority === "critical") assign(d, inc);
      store.save();
      ctx.sse.broadcast("sos:incident", inc);
      ctx.sse.broadcast("sos:teams", d.teams);
      return inc;
    }

    const engine = ctx.flow({
      lines: L,
      firstSlot: "area",
      slots: SLOTS,
      extractPrompt: (fields, asked, utterance) => extractPrompt(fields, asked, utterance),
      clean,
      extraLines: (f, s) => {
        if (s && !s.safetyGiven && (WATER_RANK[f.water] ?? 0) >= 3) {
          s.safetyGiven = true;
          return ["safety"];
        }
        return [];
      },
      // No badge until the caller has told us something.
      preview: (f) => (Object.keys(f || {}).length ? triage({ ...f, people: f.people || 1 }) : null),
      finish: async (f, s) => {
        const closeKey = `close_${triage({ ...f, people: f.people || 1 }).priority}`;
        const [te, en] = L[closeKey];
        const transcript = [...(s?.turns || []), { who: "agent", text: s?.lang === "te" ? te : en, te, en }];
        const incident = createIncident(f, { channel: "voice", transcript });
        return { closeKey: `close_${incident.priority}`, result: { incident } };
      },
    });

    app.get("/state", async () => ({ incidents: D().incidents, teams: D().teams, teamsLabel: TEAM_LABEL, gemini: !!ctx.ai.hasGemini }));
    app.get("/forecast", async () => forecast(D()));

    app.post("/call/start", async (req, reply) => {
      // The body carries the caller's language (lang); the engine keeps it on the session.
      try { return await engine.start({ ...(req.body || {}) }); } catch (e) { return fail(reply, e); }
    });

    app.post("/call/turn", async (req, reply) => {
      try { return await engine.turn(req.body || {}); } catch (e) { return fail(reply, e); }
    });

    app.post("/text", async (req, reply) => {
      const b = req.body || {};
      const msg = String(b.message || "").trim().slice(0, 1000);
      if (!msg) return reply.code(400).send({ error: "Please type the SOS message first." });
      const channel = ["whatsapp", "sms", "social"].includes(b.channel) ? b.channel : "whatsapp";
      try {
        const { data, engine: used } = await ctx.ai.llmJSON(extractPrompt({}, "everything (this is one written SOS message)", msg), { max_tokens: 400 });
        const f = clean(data);
        const incident = createIncident(f, { channel, transcript: [{ who: "caller", text: msg }] });
        return { incident, fields: f, engine: used };
      } catch (e) { return fail(reply, e); }
    });

    app.post("/report", async (req, reply) => {
      const wantTe = req.body?.lang === "te";
      const d = D();
      const open = d.incidents.filter((i) => i.status !== "resolved");
      if (!open.length) return { report: "No active SOS right now.", engine: "none" };
      const fc = forecast(d);
      // Water level spelled out per line: without it the model filled the gap with a guess.
      const lines = open.slice(0, 25).map((i) => `${i.id} [${i.priority}] ${i.summary} | water level: ${i.water === "unknown" ? "not reported" : i.water.replace("_", " ")} | ${i.status}${i.team ? ` -> ${i.team.name}, ETA ${i.team.eta} min` : ""}`);
      const messages = [
        {
          role: "system",
          content:
            "You are the AI analyst in a district flood control room in Vijayawada. Write a crisp situation report for the District Collector. Use ONLY the data given and never invent numbers. Format: one title line, then 5-6 short bullet points in English starting with '- ', most urgent first (critical cases, hotspot areas, resource needs, team utilisation, recommended next actions)" + (wantTe ? ", then a line starting 'తెలుగు సారాంశం:' with a two-sentence Telugu summary" : ". Write everything in English only") + ". Plain text, no markdown tables, no asterisks.",
        },
        {
          role: "user",
          content: `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\nTotals (open requests): ${JSON.stringify(fc.totals)}\nAreas: ${JSON.stringify(fc.areas.slice(0, 8))}\nTeams free: ${d.teams.filter((t) => !t.busyWith).length} of ${d.teams.length}\nOpen incidents:\n${lines.join("\n")}`,
        },
      ];
      try {
        const { text, engine: used } = await ctx.ai.llm(messages, { max_tokens: 700, temperature: 0.3 });
        return { report: String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\*\*/g, "").trim(), engine: used };
      } catch (e) { return fail(reply, e); }
    });

    app.post("/incidents/:id/:action", async (req, reply) => {
      const { id, action } = req.params;
      if (action !== "assign" && action !== "resolve") return reply.code(404).send({ error: "Unknown action" });
      const d = D();
      const inc = d.incidents.find((i) => i.id === id);
      if (!inc) return reply.code(404).send({ error: "Incident not found" });
      if (action === "assign") {
        if (inc.status !== "new") return reply.code(409).send({ error: "Already assigned" });
        if (!assign(d, inc)) return reply.code(409).send({ error: "No free team available right now" });
      } else resolveIncident(d, inc);
      store.save();
      ctx.sse.broadcast("sos:incident", inc);
      ctx.sse.broadcast("sos:teams", d.teams);
      return { incident: inc };
    });

    app.post("/reset", async (req, reply) => {
      if (store.reset) store.reset();
      else { store.data = seedData(); store.save(); }
      ctx.sse.broadcast("sos:reset", {});
      return { ok: true };
    });
  },
};

// Exposed for tests and other modules.
export { triage, summarize, forecast, AREAS, WATER_RANK };
