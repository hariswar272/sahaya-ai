// Rythu Call: voice assistant for farmers. Live Open-Meteo weather, live
// Agmarknet mandi prices (data.gov.in), where-to-sell advice net of transport,
// safe pest/scheme guidance, and alerts (officer-written or from live weather).

const MIN = 60 * 1000;

/* ---------------------------------------------------------------- places */

const DISTRICTS = {
  Guntur: { te: "గుంటూరు", lat: 16.3067, lng: 80.4365, match: ["guntur", "గుంటూరు", "గుంటూర్"] },
  Vijayawada: { te: "విజయవాడ", lat: 16.5062, lng: 80.648, match: ["vijayawada", "bezawada", "విజయవాడ", "బెజవాడ"] },
  Kurnool: { te: "కర్నూలు", lat: 15.8281, lng: 78.0373, match: ["kurnool", "karnool", "కర్నూలు", "కర్నూల్"] },
  Madanapalle: { te: "మదనపల్లె", lat: 13.5503, lng: 78.5029, match: ["madanapal", "మదనపల్లె", "మదనపల్లి"] },
  Anantapur: { te: "అనంతపురం", lat: 14.6819, lng: 77.6006, match: ["anantapur", "ananthapur", "అనంతపురం", "అనంతపూర్"] },
  Nellore: { te: "నెల్లూరు", lat: 14.4426, lng: 79.9865, match: ["nellore", "నెల్లూరు"] },
  Kakinada: { te: "కాకినాడ", lat: 16.9891, lng: 82.2475, match: ["kakinada", "కాకినాడ"] },
  Warangal: { te: "వరంగల్", lat: 17.9689, lng: 79.5941, match: ["warangal", "వరంగల్"] },
  Khammam: { te: "ఖమ్మం", lat: 17.2473, lng: 80.1514, match: ["khammam", "ఖమ్మం"] },
  Nizamabad: { te: "నిజామాబాద్", lat: 18.6725, lng: 78.0941, match: ["nizamabad", "నిజామాబాద్", "నిజామాబాదు"] },
  Karimnagar: { te: "కరీంనగర్", lat: 18.4386, lng: 79.1288, match: ["karimnagar", "కరీంనగర్"] },
  Hyderabad: { te: "హైదరాబాద్", lat: 17.385, lng: 78.4867, match: ["hyderabad", "హైదరాబాద్", "హైదరాబాదు", "bowenpally", "బోయిన్‌పల్లి"] },
};

const MANDIS = {
  Madanapalle: { te: "మదనపల్లె", lat: 13.5503, lng: 78.5029 },
  Kurnool: { te: "కర్నూలు", lat: 15.8281, lng: 78.0373 },
  Guntur: { te: "గుంటూరు", lat: 16.3067, lng: 80.4365 },
  Warangal: { te: "వరంగల్", lat: 17.9689, lng: 79.5941 },
  Khammam: { te: "ఖమ్మం", lat: 17.2473, lng: 80.1514 },
  Nizamabad: { te: "నిజామాబాద్", lat: 18.6725, lng: 78.0941 },
  Kolar: { te: "కోలార్", lat: 13.1367, lng: 78.1292, match: ["kolar", "కోలార్"] },
  "Hyderabad-Bowenpally": { te: "హైదరాబాద్ బోయిన్‌పల్లి", lat: 17.4691, lng: 78.4808 },
};

const CROPS = {
  tomato: { te: "టమాటా", perishable: true, match: ["tomato", "tamata", "tomata", "టమాటా", "టమోటా", "టమాట"] },
  chilli: { te: "మిర్చి", match: ["chilli", "chili", "mirchi", "mirapa", "మిర్చి", "మిరప", "ఎండుమిర్చి"] },
  cotton: { te: "పత్తి", match: ["cotton", "patti", "pathi", "పత్తి", "ప్రత్తి"] },
  paddy: { te: "వరి ధాన్యం", match: ["paddy", "rice", "dhanyam", "వరి", "ధాన్యం", "వడ్లు"] },
  onion: { te: "ఉల్లిపాయ", perishable: true, match: ["onion", "ulli", "ఉల్లి", "ఉల్లిగడ్డ"] },
  groundnut: { te: "వేరుశనగ", match: ["groundnut", "peanut", "verusenaga", "palli", "వేరుశనగ", "వేరుశెనగ", "పల్లీ", "పల్లి"] },
  maize: { te: "మొక్కజొన్న", match: ["maize", "corn", "makkajonna", "మొక్కజొన్న"] },
  turmeric: { te: "పసుపు", match: ["turmeric", "pasupu", "పసుపు"] },
};

const DISTRICT_CROPS = {
  Guntur: ["chilli", "cotton"], Vijayawada: ["paddy", "maize"], Kurnool: ["onion", "groundnut", "tomato"], Madanapalle: ["tomato", "groundnut"],
  Anantapur: ["groundnut"], Nellore: ["paddy"], Kakinada: ["paddy"], Warangal: ["cotton", "maize", "chilli"], Khammam: ["chilli", "cotton", "paddy"],
  Nizamabad: ["turmeric", "paddy", "maize"], Karimnagar: ["paddy", "maize", "cotton"], Hyderabad: ["tomato", "onion"],
};

const LANGS = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "od"];
const langOf = (l) => (LANGS.includes(l) ? l : "en");
const norm = (s) => String(s || "").toLowerCase();
const TELUGU = /[ఀ-౿]/;
// The model sometimes answers romanised Telugu when the farmer typed in English letters; TTS needs Telugu script.
const usable = (d) => d && typeof d.te === "string" && typeof d.en === "string" && TELUGU.test(d.te) && d.en.trim();
const coordsOf = (k) => DISTRICTS[k] || MANDIS[k] || DISTRICTS.Guntur;
const teOf = (k) => (DISTRICTS[k] || MANDIS[k])?.te || k;
const fmt = (n) => Math.round(n).toLocaleString("en-IN");
const round10 = (n) => Math.round(n / 10) * 10;

function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function canonicalPlace(s) {
  if (!s) return null;
  const t = norm(s);
  for (const k of [...Object.keys(DISTRICTS), ...Object.keys(MANDIS)]) if (norm(k) === t) return k;
  return findPlace(t);
}

function findPlace(text) {
  const t = norm(text);
  for (const [k, d] of Object.entries(DISTRICTS)) if (d.match.some((m) => t.includes(m))) return k;
  for (const [k, m] of Object.entries(MANDIS)) if (m.match?.some((x) => t.includes(x))) return k;
  return null;
}

function findCrop(text) {
  // "పసుపు రంగు" is the colour yellow, not turmeric.
  const t = norm(text).replace(/పసుపు\s*(రంగు|పచ్చ)/g, "");
  for (const [k, c] of Object.entries(CROPS)) if (c.match.some((m) => t.includes(m))) return k;
  return null;
}

/* ---------------------------------------------------------------- prices */

function istDate(offsetDays = 0) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rand01(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function linreg(ys) {
  const n = ys.length;
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  const slope = den ? num / den : 0;
  return { slope, intercept: ym - slope * xm };
}

/* ------------------------------------------------------------ live prices */

// Official Agmarknet daily prices from data.gov.in ("Current daily price of various
// commodities from various markets"). Real numbers only: if the API has never
// answered, callers say live prices are unavailable instead of guessing.
const AGMARK_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
// Not a secret: this is the public demo key printed in the data.gov.in API docs
// (https://data.gov.in/help/how-use-datasets-apis). Set DATAGOV_API_KEY for a real quota.
const DATAGOV_PUBLIC_SAMPLE_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";
const PRICE_TTL = 60 * MIN;
const STATES = ["Andhra Pradesh", "Telangana"];
const COMMODITY_MATCH = { tomato: ["tomato"], chilli: ["dry chillies", "green chilli", "chilly", "chillies"], cotton: ["cotton", "kapas"], paddy: ["paddy"], onion: ["onion"], groundnut: ["groundnut"], maize: ["maize"], turmeric: ["turmeric"] };
// Agmarknet commodity names, used for per-crop requests when a key caps each response.
const COMMODITY_QUERY = { tomato: "Tomato", chilli: "Dry Chillies", cotton: "Cotton", paddy: "Paddy(Dhan)(Common)", onion: "Onion", groundnut: "Groundnut", maize: "Maize", turmeric: "Turmeric" };

// Approximate district centres (Agmarknet uses old and new district names), for transport distance.
const DCOORD = {
  anantapur: [14.68, 77.6], ananthapur: [14.68, 77.6], "sri sathya sai": [14.16, 77.81], chittor: [13.22, 79.1], chittoor: [13.22, 79.1],
  tirupati: [13.63, 79.42], annamayya: [14.05, 78.75], cuddapah: [14.47, 78.82], kadapa: [14.47, 78.82], "y.s.r.": [14.47, 78.82], ysr: [14.47, 78.82],
  "east godavari": [17.0, 81.8], kakinada: [16.99, 82.25], konaseema: [16.58, 82.0], "dr. b.r. ambedkar konaseema": [16.58, 82.0],
  "west godavari": [16.71, 81.1], eluru: [16.71, 81.1], guntur: [16.31, 80.44], palnadu: [16.25, 79.7], bapatla: [15.9, 80.47],
  krishna: [16.17, 81.13], ntr: [16.51, 80.65], vijayawada: [16.51, 80.65], kurnool: [15.83, 78.04], nandyal: [15.48, 78.48],
  nellore: [14.44, 79.99], "spsr nellore": [14.44, 79.99], prakasam: [15.5, 80.05], srikakulam: [18.3, 83.9], visakhapatnam: [17.69, 83.22],
  anakapalli: [17.69, 83.0], "alluri sitharama raju": [18.1, 82.7], vizianagaram: [18.11, 83.4], "parvathipuram manyam": [18.78, 83.43],
  adilabad: [19.66, 78.53], nirmal: [19.1, 78.34], mancherial: [18.87, 79.44], "kumuram bheem asifabad": [19.36, 79.28],
  hyderabad: [17.39, 78.49], rangareddi: [17.25, 78.3], "ranga reddy": [17.25, 78.3], medchal: [17.63, 78.48], "medchal malkajgiri": [17.63, 78.48],
  karimnagar: [18.44, 79.13], jagtial: [18.79, 78.91], peddapalli: [18.61, 79.37], "rajanna sircilla": [18.39, 78.81],
  khammam: [17.25, 80.15], "bhadradri kothagudem": [17.55, 80.62], mahbubnagar: [16.74, 78.0], mahabubnagar: [16.74, 78.0],
  nagarkurnool: [16.48, 78.31], wanaparthy: [16.36, 78.06], "jogulamba gadwal": [16.23, 77.8], narayanpet: [16.74, 77.5],
  medak: [18.05, 78.26], sangareddy: [17.62, 78.08], siddipet: [18.1, 78.85], nalgonda: [17.05, 79.27], suryapet: [17.14, 79.62],
  "yadadri bhuvanagiri": [17.51, 78.89], nizamabad: [18.67, 78.09], kamareddy: [18.32, 78.34], warangal: [17.97, 79.59],
  "warangal urban": [17.97, 79.59], "warangal rural": [17.89, 79.75], hanumakonda: [18.01, 79.56], jangaon: [17.72, 79.15],
  mahabubabad: [17.6, 80.0], "jayashankar bhupalpally": [18.43, 79.87], mulugu: [18.19, 80.0], vikarabad: [17.34, 77.9],
};

let P = null; // the module store (set in register): data.prices = last good fetch, data.priceHistory = daily modal prices
let refreshing = null;
let retryAfter = 0;

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const toIso = (d) => { const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(d || ""); };

function cropOfCommodity(c) {
  const t = norm(c);
  if (t.startsWith("onion green")) return null;
  for (const [k, names] of Object.entries(COMMODITY_MATCH)) if (names.some((n) => t.startsWith(n))) return k;
  return null;
}

function marketCoords(m) {
  const c = DCOORD[norm(m.district)] || DCOORD[norm(m.mandi)];
  if (c) return { lat: c[0], lng: c[1] };
  const k = findPlace(m.mandi) || findPlace(m.district);
  return k ? coordsOf(k) : null;
}

async function agmarkGet(filters) {
  const key = (process.env.DATAGOV_API_KEY || "").trim() || DATAGOV_PUBLIC_SAMPLE_KEY;
  const qs = new URLSearchParams({ "api-key": key, format: "json", limit: "1000", offset: "0" });
  for (const [k, v] of Object.entries(filters)) qs.append(`filters[${k}]`, v);
  const res = await fetch(`${AGMARK_URL}?${qs}`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  if (!res.ok) throw Object.assign(new Error(`data.gov.in HTTP ${res.status}`), { status: res.status });
  const j = await res.json();
  return { total: Number(j.total) || 0, records: Array.isArray(j.records) ? j.records : [] };
}

function normRecord(r) {
  const modal = num(r.modal_price);
  const crop = cropOfCommodity(r.commodity);
  if (!modal || !crop) return null;
  return { crop, state: r.state, district: r.district, market: r.market, commodity: r.commodity, variety: r.variety, grade: r.grade, date: toIso(r.arrival_date), min: num(r.min_price), max: num(r.max_price), modal };
}

// Each refresh adds that day's average modal price per market, so real history
// builds up; trends and forecasts appear only once a market has a few days of it.
function remember(recs) {
  const h = (P.data.priceHistory ||= {});
  const day = new Map();
  for (const r of recs) {
    const k = `${r.crop}|${r.market}|${r.date}`;
    if (!day.has(k)) day.set(k, []);
    day.get(k).push(r.modal);
  }
  for (const [k, list] of day) {
    const [crop, market, date] = k.split("|");
    const arr = (h[`${crop}|${market}`] ||= []);
    const price = Math.round(avg(list));
    const i = arr.findIndex((x) => x.date === date);
    if (i === -1) arr.push({ date, price });
    else arr[i].price = price;
    arr.sort((a, b) => a.date.localeCompare(b.date));
    if (arr.length > 30) arr.splice(0, arr.length - 30);
  }
}

function refreshPrices() {
  if (refreshing || Date.now() < retryAfter) return refreshing;
  refreshing = (async () => {
    const raw = [];
    let failed = false;
    try {
      for (const state of STATES) {
        const all = await agmarkGet({ state });
        raw.push(...all.records);
        // A capped key (the public sample key returns only 10 rows) can't page a whole
        // state, so ask for each of our crops directly instead.
        if (all.total > all.records.length) {
          for (const c of Object.values(COMMODITY_QUERY)) {
            await new Promise((r) => setTimeout(r, 350));
            raw.push(...(await agmarkGet({ state, commodity: c })).records);
          }
        }
      }
    } catch (e) {
      failed = true;
      retryAfter = Date.now() + (e.status === 429 ? 10 : 3) * MIN;
      console.warn(`[rythu] Agmarknet: ${e.message} (${raw.length} rows before the error)`);
    }
    const seen = new Set();
    const recs = raw.map(normRecord).filter((r) => {
      if (!r) return false;
      const k = `${r.market}|${r.commodity}|${r.variety}|${r.grade}|${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const prev = P.data.prices;
    // A partial fetch never replaces a fuller last-good set.
    if (recs.length && !(failed && prev && prev.records.length > recs.length)) {
      P.data.prices = { fetchedAt: Date.now(), records: recs };
      remember(recs);
      P.save();
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function livePrices() {
  const p = P.data.prices;
  if (!p || Date.now() - p.fetchedAt > PRICE_TTL) {
    const job = refreshPrices();
    // The very first request waits briefly; after that the last good set is served while refreshing.
    if (!p && job) await Promise.race([job, new Promise((r) => setTimeout(r, 12000))]);
  }
  return P.data.prices || null;
}

async function prices(cropKey) {
  const p = await livePrices();
  if (!p) return null;
  const groups = new Map();
  for (const r of p.records) {
    if (r.crop !== cropKey) continue;
    const g = groups.get(r.market);
    if (!g || r.date > g.date) groups.set(r.market, { market: r.market, district: r.district, state: r.state, date: r.date, rows: [r] });
    else if (r.date === g.date) g.rows.push(r);
  }
  const mandis = [...groups.values()].map((g) => {
    const today = Math.round(avg(g.rows.map((r) => r.modal)));
    const hist = (P.data.priceHistory?.[`${cropKey}|${g.market}`] || []).slice(-14);
    let forecast = [];
    let trend = null;
    let change7d = null;
    if (hist.length >= 4) {
      const recent = hist.slice(-7);
      const { slope, intercept } = linreg(recent.map((x) => x.price));
      const last = new Date(`${hist[hist.length - 1].date}T12:00:00Z`).getTime();
      forecast = [1, 2, 3].map((k) => ({ date: new Date(last + k * 86400000).toISOString().slice(0, 10), price: round10(Math.max(1, intercept + slope * (recent.length - 1 + k))) }));
      const pct = (slope / today) * 100;
      trend = pct > 0.5 ? "rising" : pct < -0.5 ? "falling" : "steady";
      const ref = hist[Math.max(0, hist.length - 8)].price;
      change7d = +(((today - ref) / ref) * 100).toFixed(1);
    }
    return {
      mandi: g.market, te: g.market, district: g.district, state: g.state, date: g.date, today,
      min: Math.min(...g.rows.map((r) => r.min ?? r.modal)), max: Math.max(...g.rows.map((r) => r.max ?? r.modal)),
      varieties: [...new Set(g.rows.map((r) => r.variety).filter(Boolean))],
      history: hist.length >= 2 ? hist : [], forecast, trend, change7d,
    };
  }).sort((a, b) => b.today - a.today);
  const latest = mandis.reduce((d, m) => (m.date > d ? m.date : d), "");
  return {
    crop: cropKey, te: CROPS[cropKey].te, unit: "₹/quintal", live: true, source: "Agmarknet · data.gov.in", fetchedAt: p.fetchedAt, date: latest || null,
    note: mandis.length ? `Live Agmarknet prices via data.gov.in · arrival date ${latest}` : "No Andhra Pradesh / Telangana market reported this crop in the latest Agmarknet data.",
    mandis,
  };
}

async function board() {
  const p = await livePrices();
  if (!p) return null;
  const crops = [];
  for (const k of Object.keys(CROPS)) {
    const c = await prices(k);
    if (c?.mandis.length) crops.push({ crop: k, te: CROPS[k].te, mandis: c.mandis.map(({ mandi, te, district, state, date, today, min, max, change7d, trend }) => ({ mandi, te, district, state, date, today, min, max, change7d, trend })) });
  }
  const date = crops.flatMap((c) => c.mandis.map((m) => m.date)).reduce((d, x) => (x > d ? x : d), "");
  return { live: true, source: "Agmarknet · data.gov.in", fetchedAt: p.fetchedAt, date: date || null, note: `Live Agmarknet prices via data.gov.in (${p.records.length} AP / Telangana price rows)`, crops };
}

async function sellAdvice(cropKey, place, qty) {
  const crop = CROPS[cropKey];
  const p = await prices(cropKey);
  if (!p?.mandis.length) return null;
  const from = coordsOf(place);
  const rows = p.mandis.map((m) => {
    const at = marketCoords(m);
    if (!at) return null;
    const dist = Math.round(km(from, at) * 1.25); // road distance ≈ 1.25 × straight line
    const window = m.forecast.slice(0, crop.perishable ? 2 : 3);
    const best3 = window.length ? Math.max(...window.map((f) => f.price)) : null;
    return { mandi: m.mandi, te: m.te, date: m.date, km: dist, transport: 2 * dist, today: m.today, trend: m.trend, best3, bestDay: best3 ? window.findIndex((f) => f.price === best3) + 1 : 0 };
  }).filter(Boolean);
  if (!rows.length) return null;
  const nearest = rows.reduce((a, b) => (a.km <= b.km ? a : b));
  const options = [];
  for (const r of rows) {
    options.push({ ...r, action: "sell_now", waitDays: 0, price: r.today, net: r.today - r.transport });
    // Waiting is suggested only when real price history shows a rising trend.
    if (r.trend === "rising" && r.best3 && r.best3 > r.today * 1.02) options.push({ ...r, action: "wait", waitDays: r.bestDay, price: r.best3, net: r.best3 - r.transport });
  }
  const best = options.reduce((a, b) => (b.net > a.net ? b : a));
  const baseline = nearest.today - nearest.transport;
  return {
    crop: cropKey, cropTe: crop.te, place, placeTe: teOf(place), qty, perishable: !!crop.perishable,
    best: { mandi: best.mandi, te: best.te, action: best.action, waitDays: best.waitDays, price: best.price, transport: best.transport, km: best.km, net: best.net, date: best.date },
    nearest: { mandi: nearest.mandi, te: nearest.te, km: nearest.km, today: nearest.today, net: baseline },
    gain: Math.max(0, Math.round((best.net - baseline) * qty)),
    options: rows.map((r) => ({ mandi: r.mandi, te: r.te, km: r.km, transport: r.transport, today: r.today, netNow: r.today - r.transport, trend: r.trend })),
    live: true, note: p.note,
  };
}

/* --------------------------------------------------------------- weather */

const wxCache = new Map();

function summarizeWeather(key, j) {
  const d = j.daily;
  const days = d.time.map((date, i) => ({
    date,
    rain: +(d.precipitation_sum?.[i] ?? 0).toFixed(1),
    prob: d.precipitation_probability_max?.[i] ?? 0,
    tmax: Math.round(d.temperature_2m_max?.[i] ?? 0),
    tmin: Math.round(d.temperature_2m_min?.[i] ?? 0),
    wind: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
  }));
  const n3 = days.slice(0, 3);
  const rainy = (x) => x.prob >= 60 || x.rain >= 5;
  const next3 = {
    rainDays: n3.filter(rainy).length,
    totalRain: +n3.reduce((a, x) => a + x.rain, 0).toFixed(1),
    maxProb: Math.max(...n3.map((x) => x.prob)),
    maxTemp: Math.max(...n3.map((x) => x.tmax)),
    maxWind: Math.max(...n3.map((x) => x.wind)),
  };
  const week = { rainDays: days.filter(rainy).length, totalRain: +days.reduce((a, x) => a + x.rain, 0).toFixed(1), maxTemp: Math.max(...days.map((x) => x.tmax)) };
  const flags = {
    heavyRain: n3.some((x) => x.rain >= 20) || next3.totalRain >= 30 || n3.some((x) => x.prob >= 80 && x.rain >= 10),
    heat: next3.maxTemp >= 40,
    windy: next3.maxWind >= 40,
  };
  const risk = flags.heavyRain || next3.maxTemp >= 42 || next3.maxWind >= 45 ? "high" : next3.maxProb >= 50 || next3.totalRain >= 10 || next3.maxTemp >= 38 ? "medium" : "low";
  return { place: key, placeTe: teOf(key), days, next3, week, flags, risk, source: "Open-Meteo (live)" };
}

async function fetchWeather(keys) {
  const fresh = (k) => wxCache.get(k)?.at > Date.now() - 30 * MIN;
  const need = keys.filter((k) => !fresh(k));
  if (need.length) {
    try {
      const pts = need.map(coordsOf);
      const url = "https://api.open-meteo.com/v1/forecast"
        + `?latitude=${pts.map((p) => p.lat).join(",")}&longitude=${pts.map((p) => p.lng).join(",")}`
        + "&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max"
        + "&timezone=Asia%2FKolkata&forecast_days=7";
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      let json = await res.json();
      if (!Array.isArray(json)) json = [json];
      need.forEach((k, i) => { if (json[i]?.daily) wxCache.set(k, { at: Date.now(), data: summarizeWeather(k, json[i]) }); });
    } catch (e) {
      // Serve stale data if we have it; otherwise the caller says it's unavailable.
      if (!need.every((k) => wxCache.has(k))) throw e;
    }
  }
  return keys.map((k) => wxCache.get(k)?.data).filter(Boolean);
}

/* ----------------------------------------------------------------- lines */

const L = {
  greeting: { te: "నమస్కారం రైతన్నా! నేను రైతు కాల్ సహాయకుడిని. వాతావరణం, మార్కెట్ ధరలు, పంట ఎక్కడ అమ్మాలి, పురుగుల సమస్య, ఏదైనా అడగండి.", en: "Namaskaram, farmer friend! I'm the Rythu Call assistant. Ask me anything: weather, market prices, where to sell, pest problems." },
  sorry: { te: "క్షమించండి రైతన్నా, సరిగ్గా వినపడలేదు. మళ్ళీ చెప్పండి.", en: "Sorry, I couldn't hear that clearly. Please say it again." },
  askCrop: { te: "ఏ పంట గురించి అడుగుతున్నారు? టమాటా, మిర్చి, పత్తి, వరి లాంటివి చెప్పండి.", en: "Which crop are you asking about? For example tomato, chilli, cotton or paddy." },
  noWeather: { te: "క్షమించండి, ఇప్పుడు వాతావరణ సమాచారం అందుబాటులో లేదు. కొద్దిసేపటి తర్వాత మళ్ళీ అడగండి.", en: "Sorry, weather data isn't available right now. Please ask again in a little while." },
  noPrices: { te: "క్షమించండి, ఈ పంటకు లైవ్ మార్కెట్ ధరలు ఇప్పుడు అందుబాటులో లేవు. కొద్దిసేపటి తర్వాత మళ్ళీ అడగండి.", en: "Sorry, live market prices for this crop aren't available right now. Please ask again in a little while." },
  pest: { te: "రైతన్నా, పొలాన్ని రోజూ గమనించండి, బాగా దెబ్బతిన్న భాగాలను తీసి నాశనం చేయండి. సరైన మందు, మోతాదు కోసం దగ్గర్లోని రైతు సేవా కేంద్రం లేదా వ్యవసాయ అధికారిని సంప్రదించండి.", en: "Check the field daily and remove and destroy badly affected parts. For the right remedy and dose, contact your nearest Rythu Seva Kendram or agriculture officer." },
  scheme: { te: "పీఎం కిసాన్ పథకం కింద అర్హత ఉన్న రైతు కుటుంబాలకు సంవత్సరానికి 6000 రూపాయలు మూడు విడతల్లో వస్తాయి. రాష్ట్ర పథకాల కోసం ఆధార్, పాస్‌బుక్, బ్యాంక్ వివరాలతో దగ్గర్లోని రైతు సేవా కేంద్రాన్ని సంప్రదించండి.", en: "Under PM-KISAN, eligible farmer families get ₹6,000 a year in three instalments. For state schemes, visit your nearest Rythu Seva Kendram with Aadhaar, passbook and bank details." },
  greet: { te: "నమస్కారం రైతన్నా! మీకు ఏం సహాయం కావాలి? వాతావరణం, ధరలు, ఎక్కడ అమ్మాలి, ఏదైనా అడగండి.", en: "Namaskaram! How can I help? Ask about weather, prices or where to sell." },
  other: { te: "క్షమించండి రైతన్నా, నేను వాతావరణం, మార్కెట్ ధరలు, పంట ఎక్కడ అమ్మాలి, పురుగుల సమస్యలు, పథకాల గురించి చెప్పగలను. మళ్ళీ అడగండి.", en: "Sorry, I can help with weather, market prices, where to sell, pest problems and schemes. Please ask again." },
  bye: { te: "ధన్యవాదాలు రైతన్నా! మంచి పంట, మంచి ధర రావాలని కోరుకుంటున్నాం. ఎప్పుడైనా మళ్ళీ కాల్ చేయండి.", en: "Thank you! Wishing you a good harvest and a good price. Call again any time." },
};

const days = (n) => (n === 1 ? "ఒక రోజు" : `${n} రోజులు`);

function weatherLine(w, weekly = false) {
  // "This week" questions get the 7-day summary; everything else the next 3 days.
  const n = weekly ? { ...w.next3, ...w.week } : w.next3;
  let te = weekly ? `${w.placeTe}లో ఈ వారం ` : `${w.placeTe}లో రాబోయే మూడు రోజుల్లో `;
  let en = weekly ? `In ${w.place}, this week ` : `In ${w.place}, over the next three days `;
  if (n.rainDays > 0) {
    te += `${days(n.rainDays)} వర్షం పడే అవకాశం ఉంది, మొత్తం సుమారు ${Math.round(n.totalRain)} మిల్లీమీటర్లు. `;
    en += `rain is likely on ${n.rainDays} day${n.rainDays > 1 ? "s" : ""}, about ${Math.round(n.totalRain)} mm in total. `;
  } else {
    te += "పెద్దగా వర్షం లేదు. ";
    en += "no significant rain is expected. ";
  }
  te += `గరిష్ఠ ఉష్ణోగ్రత ${n.maxTemp} డిగ్రీలు.`;
  en += `Maximum temperature ${n.maxTemp}°C.`;
  if (w.flags.heavyRain) { te += " కోసిన పంటను కప్పి ఉంచండి, పిచికారీ వాయిదా వేయండి."; en += " Cover harvested produce and postpone spraying."; }
  else if (w.flags.heat) { te += " మధ్యాహ్నం పొలం పనులు తగ్గించి, సాయంత్రం నీరు పెట్టండి."; en += " Avoid field work at midday and irrigate in the evening."; }
  else if (n.rainDays === 0) { te += " పిచికారీకి, కోతకు అనుకూల వాతావరణం."; en += " Good conditions for spraying and harvesting."; }
  return { te, en };
}

const TREND = { rising: ["పెరుగుతోంది", "rising"], falling: ["తగ్గుతోంది", "falling"], steady: ["స్థిరంగా ఉంది", "steady"] };

const onDay = (iso, locale) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString(locale, { day: "numeric", month: "long" });

function priceLine(p) {
  const [top, second] = [...p.mandis].sort((a, b) => b.today - a.today);
  const today = top.date === istDate(0);
  let te = `${p.te} ధర ${today ? "ఈరోజు" : `${onDay(top.date, "te-IN")} నాటికి`} ${top.mandi} మార్కెట్‌లో క్వింటాకు ${top.today} రూపాయలు.`;
  let en = `${p.crop[0].toUpperCase()}${p.crop.slice(1)} is ₹${fmt(top.today)} per quintal ${today ? "today" : `as of ${onDay(top.date, "en-IN")}`} at ${top.mandi} market.`;
  if (top.trend) { te += ` అక్కడ ధర ${TREND[top.trend][0]}.`; en += ` The price there is ${TREND[top.trend][1]}.`; }
  if (second) { te += ` ${second.mandi}లో ${second.today} రూపాయలు.`; en += ` ${second.mandi}: ₹${fmt(second.today)}.`; }
  return { te, en };
}

function adviceLine(a) {
  const b = a.best;
  const same = b.mandi === a.nearest.mandi;
  const when = b.action === "wait" ? `${days(b.waitDays)} ఆగి` : "ఈరోజే";
  let te = `మీ ${a.qty} క్వింటాళ్ళ ${a.cropTe}ని ${when} ${b.te} మార్కెట్‌లో అమ్మితే మంచిది. రవాణా ఖర్చు తీసేశాక క్వింటాకు సుమారు ${b.net} రూపాయలు వస్తాయి.`;
  let en = `Sell your ${a.qty} quintals of ${a.crop} ${b.action === "wait" ? `after waiting ${b.waitDays} day${b.waitDays > 1 ? "s" : ""}` : "today"} at ${b.mandi} market: about ₹${fmt(b.net)} per quintal after transport.`;
  if (a.gain > 0) {
    te += same ? ` ఈరోజే అమ్మడం కంటే మొత్తం ${a.gain} రూపాయలు ఎక్కువ.` : ` దగ్గర్లోని ${a.nearest.te}లో ఈరోజు అమ్మడం కంటే మొత్తం ${a.gain} రూపాయలు ఎక్కువ.`;
    en += same ? ` That's ₹${fmt(a.gain)} more in total than selling today.` : ` That's ₹${fmt(a.gain)} more in total than selling today at the nearest market, ${a.nearest.mandi}.`;
  } else {
    te += " దగ్గర్లోని మార్కెట్టే మీకు మంచిది.";
    en += " Your nearest market is the best option.";
  }
  if (a.perishable && b.action === "wait") { te += " పంట పాడవకుండా నీడలో ఉంచండి."; en += " Keep the produce in shade so it doesn't spoil."; }
  return { te, en };
}

/* -------------------------------------------------------------- alerts */

const FARMER_NAMES = ["Ramaiah", "Lakshmi", "Venkatesh", "Sujatha", "Narasimha Rao", "Padma", "Srinivas", "Anjamma", "Koteswara Rao", "Mallesh", "Yadamma", "Ravi Kumar", "Satyanarayana", "Durga", "Chandrayya", "Saraswathi"];
const TYPE_LABEL = { rain: ["భారీ వర్ష హెచ్చరిక", "Heavy rain alert"], heat: ["వడగాలుల హెచ్చరిక", "Heatwave alert"], pest: ["పురుగు ఉధృతి హెచ్చరిక", "Pest outbreak alert"] };

function demoFarmers(district, n = 12, finalStatuses = false) {
  const seed = hash(district);
  const crops = DISTRICT_CROPS[district] || ["paddy"];
  return Array.from({ length: n }, (_, i) => {
    let status = "queued";
    if (finalStatuses) {
      const r = rand01(seed + i * 7919);
      status = r < 0.76 ? "answered" : r < 0.93 ? "no_answer" : "busy";
    }
    return {
      id: `${district.slice(0, 3).toUpperCase()}-${101 + i}`,
      name: FARMER_NAMES[(seed + i * 5) % FARMER_NAMES.length],
      phone: `9${((seed + i) % 9) + 1}xxxxxx${String(((seed >>> 3) + i * 37) % 100).padStart(2, "0")}`,
      crop: crops[i % crops.length],
      status,
    };
  });
}

function recount(a) {
  const c = { total: a.farmers.length, answered: 0, no_answer: 0, busy: 0, pending: 0 };
  for (const f of a.farmers) {
    if (f.status === "answered") c.answered++;
    else if (f.status === "no_answer") c.no_answer++;
    else if (f.status === "busy") c.busy++;
    else c.pending++;
  }
  a.counts = c;
}

function alertTemplate(district, type, w, note) {
  const dt = teOf(district);
  if (type === "rain") {
    const mm = w ? Math.round(w.next3.totalRain) : null;
    return {
      te: `${dt} జిల్లా రైతులకు హెచ్చరిక: రాబోయే మూడు రోజుల్లో ${mm ? `సుమారు ${mm} మిల్లీమీటర్ల ` : ""}వర్షం పడే అవకాశం ఉంది. కోసిన పంటను కప్పి ఉంచండి, పిచికారీ వాయిదా వేయండి.`,
      en: `Alert for ${district} farmers: ${mm ? `about ${mm} mm of ` : ""}rain is likely in the next three days. Cover harvested produce and postpone spraying.`,
    };
  }
  if (type === "heat") {
    const t = w ? w.next3.maxTemp : null;
    return {
      te: `${dt} జిల్లాలో రాబోయే రోజుల్లో ${t ? `${t} డిగ్రీల వరకు ` : ""}ఎండ తీవ్రంగా ఉంటుంది. మధ్యాహ్నం పొలం పనులు తగ్గించండి, పశువులకు నీడ, నీరు అందించండి.`,
      en: `Strong heat expected in ${district}${t ? `, up to ${t}°C` : ""}. Reduce midday field work and give livestock shade and water.`,
    };
  }
  return {
    te: `${dt} జిల్లాలో పంటలపై పురుగు ఉధృతి కనిపిస్తోంది. పొలాన్ని గమనించండి, సరైన నివారణ కోసం దగ్గర్లోని రైతు సేవా కేంద్రాన్ని సంప్రదించండి.`,
    en: `Pest outbreak reported in ${district}${note ? ` (${note})` : ""}. Check your fields and contact the nearest Rythu Seva Kendram for the right remedy.`,
  };
}

/* ---------------------------------------------------------------- module */

export default {
  id: "rythu",
  async register(app, ctx) {
    const store = ctx.store("rythu", () => ({ seq: 101, alerts: [] }));
    if (!Array.isArray(store.data.alerts)) store.data.alerts = [];
    if (!store.data.seq) store.data.seq = 101;
    // No invented data: drop alerts seeded by earlier versions.
    store.data.alerts = store.data.alerts.filter((a) => !a.seeded);
    P = store;
    refreshPrices();
    // Simulated farmer call lists are off unless explicitly enabled (no farmer registry is connected).
    const SIMULATE_CALLS = process.env.RYTHU_SIMULATE_CALLS === "1";

    const httpError = (status, message) => Object.assign(new Error(message), { status });
    const log = (...a) => (ctx.log || console.error)("rythu:", ...a);

    // Every answer is built as {te, en}. Telugu and English sessions use those
    // directly; any other language gets the English line translated, and falls
    // back to English (spoken as English) when translation is unavailable.
    const trCache = new Map();
    async function localize(lang, lines) {
      if (lang === "te") return lines.map((l) => ({ ...l, text: l.te, lang: "te" }));
      const out = lines.map((l) => ({ ...l, text: l.en, lang: "en" }));
      if (lang === "en") return out;
      const todo = [];
      lines.forEach((l, i) => {
        const hit = trCache.get(`${lang}|${l.en}`);
        if (hit) Object.assign(out[i], { text: hit, lang });
        else todo.push(i);
      });
      if (todo.length && typeof ctx.i18n?.translate === "function") {
        try {
          // Core returns { [english]: translated }, mapping a string to itself when it can't translate.
          const res = await ctx.i18n.translate(lang, todo.map((i) => lines[i].en));
          todo.forEach((i, k) => {
            const en = lines[i].en;
            const tr = Array.isArray(res) ? res[k] : res?.[en];
            const t = typeof tr === "string" ? tr.trim() : "";
            if (!t || t === en) return; // untranslated: stays English, spoken as English
            Object.assign(out[i], { text: t, lang });
            if (trCache.size < 500) trCache.set(`${lang}|${en}`, t);
          });
        } catch (e) {
          log("translate failed:", e.message);
        }
      }
      return out;
    }
    const speak = (items) => Promise.all(items.map((it) => ctx.voice.tts(it.text, `${it.lang}-IN`).catch(() => null)));
    async function voice(lang, lines) {
      const reply = await localize(lang, lines);
      return { reply, audios: await speak(reply) };
    }
    const wrap = (fn) => async (req, rep) => {
      try {
        if (req.method === "POST" && ctx.rateLimit?.(req)) return rep.code(429).send({ error: "Too many requests, slow down." });
        return await fn(req, rep);
      } catch (e) {
        (ctx.log || console.error)("rythu:", e.message);
        return rep.code(e.status || 500).send({ error: e.status ? e.message : "Something went wrong. Please try again." });
      }
    };

    async function understand(said, s) {
      const t = norm(said);
      const INTENTS = [
        ["bye", ["bye", "thank", "ధన్యవాద", "థాంక్", "ఉంటాను"]],
        ["sell_advice", ["ఎక్కడ అమ్మ", "అమ్మాలి", "అమ్మితే", "అమ్మేది", "అమ్మడం", "అమ్మేయ", "ammali", "ammithe", "sell"]],
        ["price", ["ధర", "రేటు", "rate", "price", "dhara", "మార్కెట్"]],
        ["weather", ["వర్షం", "వాన", "వాతావరణ", "ఎండ", "weather", "rain", "varsham", "vana", "తుఫాను", "ఉష్ణోగ్రత"]],
        ["pest", ["పురుగు", "తెగులు", "చీడ", "pest", "purugu", "disease", "మచ్చలు", "రోగం", "ఆకులు"]],
        ["scheme", ["పథకం", "scheme", "భరోసా", "kisan", "కిసాన్", "సబ్సిడీ", "subsidy", "loan", "రుణం", "బీమా", "insurance", "అన్నదాత"]],
        ["greeting", ["నమస్కారం", "హలో", "hello", "namaskaram"]],
      ];
      const q = {
        intent: INTENTS.find(([, w]) => w.some((x) => t.includes(x)))?.[0] || null,
        crop: findCrop(t),
        place: findPlace(t),
        qty: (() => { const m = t.match(/(\d+(?:\.\d+)?)\s*(?:క్వింట|quintal|qtl)/i); return m ? Number(m[1]) : null; })(),
        engine: null,
      };
      const needsCrop = (i) => i === "price" || i === "sell_advice";
      // Keywords cover Telugu and English; every other language goes through the model.
      const native = s.lang === "te" || s.lang === "en";
      if (!native || !q.intent || (needsCrop(q.intent) && !q.crop && !s.crop)) {
        try {
          const { data, engine } = await ctx.ai.llmJSON([
            {
              role: "system",
              content: [
                "You read what a farmer in India said to a voice helpline. Speech may be in any Indian language (Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia), English, or a mix, and may contain speech-recognition errors.",
                'Return ONLY JSON: {"intent": "weather|price|sell_advice|pest|scheme|greeting|bye|other", "crop": one of tomato|chilli|cotton|paddy|onion|groundnut|maize|turmeric or null, "place": one of ' + [...Object.keys(DISTRICTS), "Kolar"].join("|") + ' or null, "quantity_quintals": number or null}',
                "where/when to sell = sell_advice; price/rate = price; rain/heat/wind = weather; insects/disease = pest; schemes, subsidy, loans, insurance = scheme.",
                `Conversation so far: last crop ${s.crop || "none"}, last place ${s.place || "none"}.`,
              ].join("\n"),
            },
            { role: "user", content: said },
          ], { temperature: 0, max_tokens: 150 });
          q.engine = engine;
          if (data && typeof data === "object") {
            const intents = ["weather", "price", "sell_advice", "pest", "scheme", "greeting", "bye", "other"];
            if ((!native || !q.intent) && intents.includes(data.intent)) q.intent = data.intent;
            if (!q.crop && typeof data.crop === "string" && CROPS[data.crop]) q.crop = data.crop;
            if (!q.place && typeof data.place === "string") q.place = canonicalPlace(data.place);
            const n = Number(data.quantity_quintals);
            if (!q.qty && Number.isFinite(n) && n > 0 && n < 10000) q.qty = n;
          }
        } catch (e) {
          (ctx.log || console.error)("rythu: intent LLM failed:", e.message);
        }
      }
      q.intent ||= "other";
      return q;
    }

    async function compose(kind, said, s, fallback) {
      const rules = {
        pest: "The farmer has a pest or disease problem. Give at most 2 general, safe steps (watch the field, remove and destroy badly affected parts, pheromone or yellow sticky traps for monitoring) and tell them to contact the nearest Rythu Seva Kendram or agriculture officer for the exact remedy. Never name pesticides or dosages.",
        scheme: "The farmer asks about schemes, subsidy, loans or insurance. You may say PM-KISAN gives eligible farmer families ₹6,000 a year in three instalments. For state schemes in Andhra Pradesh / Telangana, tell them to check at the nearest Rythu Seva Kendram or Mee Seva with Aadhaar, passbook and bank details. Do not state any other amounts.",
        greeting: "The farmer greeted you. Greet back warmly and say you can help with weather, market prices, where to sell and pest problems.",
        other: "If the question is about farming, give a short helpful general answer without inventing facts or numbers. Otherwise say you can help with weather, market prices, where to sell, pests and schemes.",
      }[kind];
      try {
        const { data, engine } = await ctx.ai.llmJSON([
          {
            role: "system",
            content: `You are "Rythu Call", a friendly Telugu voice assistant for farmers in Andhra Pradesh and Telangana. Reply in simple spoken Telugu, at most 2–3 short sentences, warm tone. ${rules} Return ONLY JSON {"te":"...","en":"..."}. "te" MUST be written in Telugu script (for example "రైతన్నా"), never in English letters, even if the farmer typed in English letters. "en" is a faithful English translation.`,
          },
          { role: "user", content: `Farmer${s.crop ? ` (crop: ${s.crop})` : ""}: ${said}` },
        ], { temperature: 0.3, max_tokens: 350 });
        if (usable(data)) return { line: { te: String(data.te).slice(0, 500), en: String(data.en).slice(0, 500) }, engine };
      } catch (e) {
        (ctx.log || console.error)("rythu: compose LLM failed:", e.message);
      }
      return { line: fallback, engine: null };
    }

    async function answer(q, said, s) {
      const place = q.place || s.place || "Guntur";
      const crop = q.crop || s.crop;
      if (q.intent === "weather") {
        try {
          const [w] = await fetchWeather([place]);
          if (!w) throw new Error("no data");
          const weekly = /వారం|week|vaaram|varam/i.test(String(said || ""));
          return { line: weatherLine(w, weekly), result: { intent: "weather", place, weather: w } };
        } catch {
          return { line: L.noWeather, result: { intent: "weather", place } };
        }
      }
      if (q.intent === "price" || q.intent === "sell_advice") {
        if (!crop) return { line: L.askCrop, result: { intent: q.intent, place } };
        const p = await prices(crop);
        if (!p?.mandis.length) return { line: L.noPrices, result: { intent: q.intent, crop, place, pricesUnavailable: true } };
        if (q.intent === "price") return { line: priceLine(p), result: { intent: "price", crop, place, prices: p } };
        const a = await sellAdvice(crop, place, q.qty || s.qty || 10);
        if (!a) return { line: priceLine(p), result: { intent: "price", crop, place, prices: p } };
        return { line: adviceLine(a), result: { intent: "sell_advice", crop, place, prices: p, advice: a } };
      }
      if (q.intent === "bye") return { line: L.bye, result: { intent: "bye" } };
      const fb = { pest: L.pest, scheme: L.scheme, greeting: L.greet, other: L.other }[q.intent] || L.other;
      const { line, engine } = await compose(q.intent in { pest: 1, scheme: 1, greeting: 1 } ? q.intent : "other", said, s, fb);
      return { line, engine, result: { intent: q.intent, crop: crop || null, place } };
    }

    function makeAlert(district, type, text, note, opts = {}) {
      const a = {
        id: `AL-${store.data.seq++}`,
        district, districtTe: teOf(district), type,
        label: TYPE_LABEL[type][1], labelTe: TYPE_LABEL[type][0],
        te: text.te, en: text.en, note: note || "",
        createdAt: opts.createdAt || Date.now(),
        source: opts.source || "officer",
        status: SIMULATE_CALLS ? "calling" : "ready",
        farmers: SIMULATE_CALLS ? demoFarmers(district, 12) : [],
        demo: SIMULATE_CALLS,
      };
      recount(a);
      return a;
    }

    function runCalls(a) {
      const tick = () => {
        const ringing = a.farmers.find((f) => f.status === "ringing");
        if (ringing) { const r = Math.random(); ringing.status = r < 0.76 ? "answered" : r < 0.93 ? "no_answer" : "busy"; }
        const next = a.farmers.find((f) => f.status === "queued");
        if (next) next.status = "ringing";
        recount(a);
        if (!next && !a.farmers.some((f) => f.status === "ringing")) {
          a.status = "done";
          store.save();
          ctx.sse.broadcast("rythu:alert", a);
          return;
        }
        ctx.sse.broadcast("rythu:alert", a);
        setTimeout(tick, 650 + Math.random() * 600);
      };
      setTimeout(tick, 400);
    }

    async function composeAlert(district, type, note) {
      let w = null;
      try { [w] = await fetchWeather([district]); } catch { /* template without numbers */ }
      const fallback = alertTemplate(district, type, w, note);
      try {
        const { data } = await ctx.ai.llmJSON([
          {
            role: "system",
            content: `You write short voice alerts for farmers in Andhra Pradesh / Telangana, read aloud on a phone call. Simple spoken Telugu written in Telugu script, 2 short sentences. Begin exactly with "${teOf(district)} జిల్లా రైతులకు హెచ్చరిక:", then say what is expected (round any weather numbers to whole numbers) and one clear action. Use ONLY the facts given; never invent numbers, pesticides or dosages. Return ONLY JSON {"te":"...","en":"..."} where en is a faithful English translation beginning "Alert for ${district} farmers:".`,
          },
          { role: "user", content: JSON.stringify({ district, district_te: teOf(district), alert_type: type, officer_note: note || null, weather_next_3_days: w?.next3 || null, flags: w?.flags || null }) },
        ], { temperature: 0.3, max_tokens: 300 });
        if (usable(data)) return { te: String(data.te).slice(0, 400), en: String(data.en).slice(0, 400) };
      } catch (e) {
        (ctx.log || console.error)("rythu: alert LLM failed:", e.message);
      }
      return fallback;
    }

    // Alerts come only from officers or from live weather: a district with a high
    // chance of real rain in the next 3 days gets one automatically (at most once per 12 h).
    async function autoWeatherAlerts() {
      try {
        const all = await fetchWeather(Object.keys(DISTRICTS));
        const recent = (d) => store.data.alerts.some((a) => a.district === d && a.type === "rain" && Date.now() - a.createdAt < 12 * 60 * MIN);
        const wet = all
          .filter((w) => w.flags.heavyRain || (w.next3.maxProb >= 80 && w.next3.totalRain >= 10))
          .filter((w) => !recent(w.place))
          .sort((a, b) => b.next3.totalRain - a.next3.totalRain)
          .slice(0, 2);
        for (const w of wet) {
          const a = makeAlert(w.place, "rain", alertTemplate(w.place, "rain", w), "", { source: "auto-weather" });
          store.data.alerts.unshift(a);
          ctx.sse.broadcast("rythu:alert", a);
          if (SIMULATE_CALLS) runCalls(a);
        }
        if (wet.length) {
          store.data.alerts = store.data.alerts.slice(0, 20);
          store.save();
        }
      } catch { /* weather offline: no automatic alerts */ }
    }
    autoWeatherAlerts();
    setInterval(autoWeatherAlerts, 60 * MIN).unref?.();
    // Render the fixed lines once, late and one at a time, so the first caller hears
    // them instantly without adding to the startup TTS burst (Sarvam rate-limits bursts).
    if (process.env.NODE_ENV === "production" || process.env.PREWARM === "1") {
      setTimeout(async () => {
        for (const l of [L.greeting, L.sorry, L.askCrop, L.bye]) {
          for (const lang of ["en", "te"]) {
            await ctx.voice.tts(lang === "te" ? l.te : l.en, `${lang}-IN`).catch(() => null);
            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      }, 25000).unref?.();
    }

    const district = (d) => (DISTRICTS[d] ? d : canonicalPlace(d)) || null;

    /* ---- voice call ---- */
    app.post("/call/start", wrap(async (req) => {
      const b = req.body || {};
      const lang = langOf(ctx.i18n?.normLang ? ctx.i18n.normLang(b.lang) : b.lang);
      const s = { history: [], lang, place: district(b.place) || null, crop: CROPS[b.crop] ? b.crop : null, qty: null };
      s.id = ctx.sessions.create(s);
      const v = await voice(s.lang, [L.greeting]);
      s.history.push({ who: "agent", text: v.reply[0].text });
      const gemini = typeof ctx.ai.hasGemini === "function" ? ctx.ai.hasGemini() : !!ctx.ai.hasGemini;
      return { sessionId: s.id, ...v, lang: s.lang, done: false, result: { intent: "greeting", place: s.place }, engine: gemini ? "gemini" : "sarvam" };
    }));

    app.post("/call/turn", wrap(async (req) => {
      const b = req.body || {};
      const s = ctx.sessions.get(b.sessionId);
      if (!s) throw httpError(404, "Session expired. Please start a new call.");
      let said = typeof b.text === "string" ? b.text.trim().slice(0, 500) : "";
      const timing = {};
      if (!said && typeof b.audio === "string" && b.audio) {
        const buf = Buffer.from(b.audio, "base64");
        if (buf.length > 4_000_000) throw httpError(413, "Audio too long");
        const t0 = Date.now();
        said = ((await ctx.voice.stt(buf, `${s.lang || "en"}-IN`)) || "").trim();
        timing.sttMs = Date.now() - t0;
      }
      if (!said) return { sessionId: s.id, ...(await voice(s.lang, [L.sorry])), lang: s.lang, done: false, timing, engine: "sarvam" };

      s.history.push({ who: "farmer", text: said });
      const t1 = Date.now();
      const q = await understand(said, s);
      if (q.crop) s.crop = q.crop;
      if (q.place) s.place = q.place;
      if (q.qty) s.qty = q.qty;
      const { line, result, engine } = await answer(q, said, s);
      timing.aiMs = Date.now() - t1;
      const v = await voice(s.lang, [line]);
      s.history.push({ who: "agent", text: v.reply[0].text });
      return {
        sessionId: s.id, said, ...v, lang: s.lang,
        done: q.intent === "bye", result, fields: { crop: s.crop, place: s.place, qty: s.qty },
        timing, engine: engine || q.engine || "sarvam",
      };
    }));

    /* ---- data ---- */
    app.get("/meta", async () => ({
      districts: Object.entries(DISTRICTS).map(([key, d]) => ({ key, te: d.te })),
      crops: Object.entries(CROPS).map(([key, c]) => ({ key, te: c.te })),
      mandis: Object.entries(MANDIS).map(([key, m]) => ({ key, te: m.te })),
    }));

    app.get("/weather", wrap(async (req) => {
      const place = district(req.query?.place) || "Guntur";
      const [w] = await fetchWeather([place]).catch(() => []);
      if (!w) throw httpError(503, "Weather data is unavailable right now.");
      return { weather: w };
    }));

    app.get("/weather/risk", wrap(async () => {
      const all = await fetchWeather(Object.keys(DISTRICTS)).catch(() => []);
      if (!all.length) throw httpError(503, "Weather data is unavailable right now.");
      const rank = { high: 0, medium: 1, low: 2 };
      return {
        source: "Open-Meteo (live)",
        districts: all
          .map((w) => ({ district: w.place, te: w.placeTe, risk: w.risk, rainDays: w.next3.rainDays, totalRain: w.next3.totalRain, maxProb: w.next3.maxProb, maxTemp: w.next3.maxTemp, maxWind: w.next3.maxWind, flags: w.flags }))
          .sort((a, b) => rank[a.risk] - rank[b.risk] || b.totalRain - a.totalRain),
      };
    }));

    const unavailable = (rep) => rep.code(503).send({ error: "Live prices unavailable right now", available: false });

    app.get("/prices", wrap(async (req, rep) => {
      const c = norm(req.query?.crop);
      const key = CROPS[c] ? c : c ? findCrop(c) : null;
      const data = key ? await prices(key) : await board();
      return data ? data : unavailable(rep);
    }));

    app.get("/advice", wrap(async (req, rep) => {
      const key = CROPS[norm(req.query?.crop)] ? norm(req.query.crop) : findCrop(req.query?.crop);
      if (!key) throw httpError(400, "Unknown crop");
      const qty = Math.min(10000, Math.max(1, Number(req.query?.qty) || 10));
      const a = await sellAdvice(key, district(req.query?.place) || "Guntur", qty);
      return a ? a : unavailable(rep);
    }));

    /* ---- alerts ---- */
    app.get("/alerts", async () => ({ alerts: store.data.alerts }));

    app.post("/alerts/preview", wrap(async (req) => {
      const b = req.body || {};
      const d = district(b.district);
      if (!d) throw httpError(400, "Pick a district");
      const type = ["rain", "heat", "pest"].includes(b.type) ? b.type : "rain";
      const text = await composeAlert(d, type, String(b.note || "").slice(0, 200));
      // Every alert keeps both texts; the preview plays in the officer's UI language.
      const lang = b.lang === "te" ? "te" : "en";
      const audio = await ctx.voice.tts(text[lang], `${lang}-IN`).catch(() => null);
      return { district: d, type, ...text, audio, lang };
    }));

    app.post("/alerts", wrap(async (req) => {
      const b = req.body || {};
      const d = district(b.district);
      if (!d) throw httpError(400, "Pick a district");
      const type = ["rain", "heat", "pest"].includes(b.type) ? b.type : "rain";
      const note = String(b.note || "").slice(0, 200);
      const text = typeof b.te === "string" && b.te.trim() && typeof b.en === "string"
        ? { te: b.te.trim().slice(0, 400), en: b.en.trim().slice(0, 400) }
        : await composeAlert(d, type, note);
      const a = makeAlert(d, type, text, note);
      store.data.alerts.unshift(a);
      store.data.alerts = store.data.alerts.slice(0, 20);
      store.save();
      ctx.sse.broadcast("rythu:alert", a);
      if (SIMULATE_CALLS) runCalls(a);
      return { alert: a };
    }));

    app.post("/reset", wrap(async () => {
      // Clears alerts only; live price cache and history are real data and stay.
      store.data.alerts = [];
      store.data.seq = 101;
      store.save();
      await autoWeatherAlerts();
      ctx.sse.broadcast("rythu:reset", {});
      return { ok: true };
    }));
  },
};

// Exposed for tests.
export { summarizeWeather, weatherLine, adviceLine, alertTemplate, linreg, km, findPlace, findCrop, canonicalPlace, cropOfCommodity, normRecord, toIso, CROPS };
