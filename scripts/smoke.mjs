// End-to-end smoke test for all four modules. Usage: node scripts/smoke.mjs [baseUrl]
const BASE = (process.argv[2] || "http://127.0.0.1:4200").replace(/\/$/, "");
let pass = 0, fail = 0;

async function call(path, body) {
  const t = Date.now();
  const res = await fetch(BASE + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json.error || ""}`);
  return { json, ms: Date.now() - t };
}

async function step(name, fn) {
  try {
    const note = await fn();
    pass++;
    console.log(`PASS  ${name}${note ? `  ·  ${note}` : ""}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${name}  ·  ${e.message}`);
  }
}

const audioOk = (r) => r.audios?.length === r.reply?.length && r.audios.every(Boolean);

async function converse(base, startBody, answers) {
  let { json: r } = await call(`${base}/start`, startBody);
  const id = r.sessionId;
  if (!id) throw new Error("no sessionId");
  const log = [`agent: ${r.reply.map((x) => x.en).join(" ")}${audioOk(r) ? "" : " [NO AUDIO]"}`];
  for (const text of answers) {
    const t = await call(`${base}/turn`, { sessionId: id, text });
    r = t.json;
    log.push(`you: ${text}`, `agent (${t.ms} ms): ${r.reply.map((x) => x.en).join(" ")}${audioOk(r) ? "" : " [NO AUDIO]"}`);
    if (r.done) break;
  }
  return { r, log };
}

await step("health", async () => {
  const { json } = await call("/api/health");
  return `engine=${json.engine} gemini=${json.gemini} voice=${json.voice} modules=${(json.modules || []).join(",")}`;
});

// SOS
await step("sos state", async () => { const { json } = await call("/api/sos/state"); return `${json.incidents?.length} incidents, ${json.teams?.length} teams`; });
await step("sos voice call (typed)", async () => {
  const { r, log } = await converse("/api/sos/call", {}, [
    "మేము సింగ్ నగర్ రామాలయం దగ్గర ఉన్నాం, ఐదుగురు ఉన్నాం, ఫస్ట్ ఫ్లోర్ వరకు నీళ్ళు వచ్చాయి",
    "అమ్మమ్మ ఉంది, షుగర్ పేషెంట్",
    "ఇన్సులిన్ అయిపోయింది",
    "బోట్ పంపండి, మందులు కావాలి",
    "నా పేరు లక్ష్మి",
    "సరే",
  ]);
  console.log("      " + log.join("\n      "));
  if (!r.done) throw new Error("call did not finish");
  const inc = r.result?.incident || r.incident;
  return `incident ${inc?.id} priority=${inc?.priority} team=${inc?.team?.name || "-"}`;
});
await step("sos text SOS", async () => {
  const { json } = await call("/api/sos/text", { message: "Help! 4 of us on the terrace at Krishna Lanka near the school, 2 small kids, water rising", channel: "sms" });
  return `${json.incident?.id} ${json.incident?.priority} · ${json.incident?.summary}`;
});
await step("sos forecast", async () => { const { json } = await call("/api/sos/forecast"); return `areas=${json.areas?.length} people=${json.totals?.people}`; });

// Arogya
await step("arogya call (ANC, typed)", async () => {
  const { json } = await call("/api/arogya/patients");
  const list = json.patients || json || [];
  const found = Array.isArray(list) ? list.find((x) => /anc|preg/i.test(x.program)) : null;
  // Public flow: no seeded patients, so a caller registers by name + programme.
  const p = found || { name: "Smoke Test", program: "anc" };
  const { r, log } = await converse("/api/arogya/call", found ? { patientId: found.id } : { name: p.name, program: "anc" }, [
    "రక్తస్రావం ఏమీ లేదు",
    "కాళ్ళు కొంచెం వాచాయి, తలనొప్పి బాగా ఉంది, కళ్ళు మసకగా కనిపిస్తున్నాయి",
    "బిడ్డ బాగానే కదులుతోంది",
    "ఐరన్ మాత్రలు రెండు రోజులు వేసుకోలేదు",
    "తెలియదు",
    "సరే",
  ]);
  console.log("      " + log.join("\n      "));
  if (!r.done) throw new Error("call did not finish");
  return `${p.name}: risk=${r.result?.risk} reasons=${(r.result?.reasons || []).join("; ")}`;
});

// Rythu
await step("rythu weather + price (typed)", async () => {
  const { r, log } = await converse("/api/rythu/call", {}, ["గుంటూరులో ఈ వారం వర్షం వస్తుందా?", "టమాటా 20 క్వింటాళ్ళు ఉంది, ఎక్కడ అమ్మితే మంచి ధర వస్తుంది?"]);
  console.log("      " + log.join("\n      "));
  return `last intent=${r.result?.intent} advice=${JSON.stringify(r.result?.advice || "").slice(0, 120)}`;
});

// Scam
await step("scam check (scam)", async () => {
  const { json } = await call("/api/scam/check", { text: "Dear customer, your electricity will be disconnected tonight at 9.30pm because your last bill was not updated. Call officer 9876543210 immediately.", source: "sms" });
  const v = json.result?.verdict;
  if (v === "safe") throw new Error("marked safe");
  return `verdict=${v} type=${json.result?.scam_type} audio=${!!json.audio}`;
});
await step("scam check (safe)", async () => {
  const { json } = await call("/api/scam/check", { text: "Your OTP for login to the SBI YONO app is 482913. Do not share it with anyone. -SBI", source: "sms" });
  return `verdict=${json.result?.verdict} type=${json.result?.scam_type}`;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
