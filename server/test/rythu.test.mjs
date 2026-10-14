// Unit tests for Rythu Call's pure helpers: weather risk, sell advice wording, place/crop
// matching and Agmarknet record parsing. No network: inputs are hand-built fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeWeather, weatherLine, adviceLine, alertTemplate, linreg, km, findPlace, findCrop, canonicalPlace, cropOfCommodity, normRecord, toIso } from "../modules/rythu.mjs";

/** Open-Meteo style daily block for 7 days; `over` patches individual days. */
function meteo(over = {}) {
  const base = { rain: 0, prob: 10, tmax: 33, tmin: 24, wind: 12 };
  const days = Array.from({ length: 7 }, (_, i) => ({ ...base, ...(over[i] || {}) }));
  return {
    daily: {
      time: days.map((_, i) => `2026-10-${String(14 + i).padStart(2, "0")}`),
      precipitation_sum: days.map((d) => d.rain),
      precipitation_probability_max: days.map((d) => d.prob),
      temperature_2m_max: days.map((d) => d.tmax),
      temperature_2m_min: days.map((d) => d.tmin),
      wind_speed_10m_max: days.map((d) => d.wind),
    },
  };
}

test("calm weather is low risk with no flags", () => {
  const w = summarizeWeather("Guntur", meteo());
  assert.equal(w.risk, "low");
  assert.deepEqual(w.flags, { heavyRain: false, heat: false, windy: false });
  assert.equal(w.next3.rainDays, 0);
  assert.equal(w.days.length, 7);
});

test("a 25 mm day in the next three days triggers a heavy-rain alert", () => {
  const w = summarizeWeather("Guntur", meteo({ 1: { rain: 25, prob: 90 } }));
  assert.equal(w.flags.heavyRain, true);
  assert.equal(w.risk, "high");
  assert.equal(w.next3.rainDays, 1);
  assert.equal(w.next3.totalRain, 25);
});

test("rain later in the week counts for the week but not the next three days", () => {
  const w = summarizeWeather("Kurnool", meteo({ 5: { rain: 12, prob: 70 } }));
  assert.equal(w.next3.rainDays, 0);
  assert.equal(w.week.rainDays, 1);
  assert.equal(w.flags.heavyRain, false);
});

test("heat and wind raise the risk level", () => {
  assert.equal(summarizeWeather("Anantapur", meteo({ 0: { tmax: 43 } })).risk, "high");
  const hot = summarizeWeather("Anantapur", meteo({ 0: { tmax: 40 } }));
  assert.equal(hot.flags.heat, true);
  assert.equal(hot.risk, "medium");
  assert.equal(summarizeWeather("Kakinada", meteo({ 2: { wind: 46 } })).risk, "high");
});

test("weather advice matches the forecast in both languages", () => {
  const wet = weatherLine(summarizeWeather("Guntur", meteo({ 0: { rain: 30, prob: 95 } })));
  assert.match(wet.en, /^In Guntur, over the next three days rain is likely on 1 day, about 30 mm/);
  assert.match(wet.en, /Cover harvested produce/);
  assert.match(wet.te, /గుంటూరు/);
  const dry = weatherLine(summarizeWeather("Guntur", meteo()), true);
  assert.match(dry.en, /^In Guntur, this week no significant rain/);
  assert.match(dry.en, /Good conditions for spraying/);
});

test("sell advice states the net price and the extra gain over the nearest market", () => {
  const a = {
    crop: "tomato", cropTe: "టమాటా", qty: 10, perishable: true, gain: 4500,
    best: { mandi: "Madanapalle", te: "మదనపల్లె", action: "sell_now", waitDays: 0, net: 2050 },
    nearest: { mandi: "Kurnool", te: "కర్నూలు" },
  };
  const line = adviceLine(a);
  assert.match(line.en, /Sell your 10 quintals of tomato today at Madanapalle market: about ₹2,050 per quintal after transport/);
  assert.match(line.en, /₹4,500 more in total than selling today at the nearest market, Kurnool/);
  assert.match(line.te, /మదనపల్లె/);
});

test("when waiting pays, perishable crops get a storage tip; no gain means stay local", () => {
  const wait = adviceLine({
    crop: "tomato", cropTe: "టమాటా", qty: 5, perishable: true, gain: 600,
    best: { mandi: "Kurnool", te: "కర్నూలు", action: "wait", waitDays: 2, net: 1500 },
    nearest: { mandi: "Kurnool", te: "కర్నూలు" },
  });
  assert.match(wait.en, /after waiting 2 days/);
  assert.match(wait.en, /Keep the produce in shade/);
  const local = adviceLine({
    crop: "cotton", cropTe: "పత్తి", qty: 3, perishable: false, gain: 0,
    best: { mandi: "Guntur", te: "గుంటూరు", action: "sell_now", waitDays: 0, net: 7000 },
    nearest: { mandi: "Guntur", te: "గుంటూరు" },
  });
  assert.match(local.en, /Your nearest market is the best option/);
});

test("linear trend fit recovers slope and intercept", () => {
  assert.deepEqual(linreg([100, 110, 120, 130]), { slope: 10, intercept: 100 });
  assert.deepEqual(linreg([50, 50, 50]), { slope: 0, intercept: 50 });
});

test("road-distance helper is sane", () => {
  assert.equal(km({ lat: 16.3, lng: 80.4 }, { lat: 16.3, lng: 80.4 }), 0);
  const d = km({ lat: 16.3067, lng: 80.4365 }, { lat: 16.5062, lng: 80.648 }); // Guntur → Vijayawada
  assert.ok(d > 25 && d < 40, `got ${d}`);
});

test("places and crops are found in English, Telugu and romanised Telugu", () => {
  assert.equal(findPlace("I am from Bezawada"), "Vijayawada");
  assert.equal(findPlace("గుంటూరు లో వర్షం"), "Guntur");
  assert.equal(canonicalPlace("kolar"), "Kolar");
  assert.equal(findCrop("mirchi rate entha"), "chilli");
  assert.equal(findCrop("టమాటా ధర"), "tomato");
  assert.equal(findCrop("పసుపు రంగు ఆకులు"), null, "'yellow colour' is not turmeric");
});

test("Agmarknet records are normalised and junk rows are dropped", () => {
  assert.equal(cropOfCommodity("Dry Chillies"), "chilli");
  assert.equal(cropOfCommodity("Onion Green"), null);
  assert.equal(toIso("4/10/2026"), "2026-10-04");
  const r = normRecord({ commodity: "Tomato", state: "Andhra Pradesh", district: "Chittor", market: "Madanapalli APMC", arrival_date: "14/10/2026", min_price: "1500", max_price: "2600", modal_price: "2100" });
  assert.deepEqual(
    { crop: r.crop, date: r.date, min: r.min, max: r.max, modal: r.modal },
    { crop: "tomato", date: "2026-10-14", min: 1500, max: 2600, modal: 2100 },
  );
  assert.equal(normRecord({ commodity: "Tomato", modal_price: "0" }), null);
  assert.equal(normRecord({ commodity: "Banana", modal_price: "900" }), null);
});

test("officer alert templates include the live numbers when available", () => {
  const w = summarizeWeather("Guntur", meteo({ 0: { rain: 18 }, 1: { rain: 22 } }));
  assert.match(alertTemplate("Guntur", "rain", w).en, /^Alert for Guntur farmers: about 40 mm of rain/);
  assert.match(alertTemplate("Guntur", "rain", null).en, /^Alert for Guntur farmers: rain is likely/);
  assert.match(alertTemplate("Warangal", "pest", null, "pink bollworm").en, /\(pink bollworm\)/);
});
