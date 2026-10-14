const $ = (s) => document.querySelector(s);
let sessionId = null, busy = false, ended = true, stream = null, recorder = null, chunks = [], ctx = null, vadTimer = null, current = null;

const SAMPLES = [
  "మేము సింగ్ నగర్ రామాలయం దగ్గర ఉన్నాం",
  "ఐదుగురు ఉన్నాం",
  "ఫస్ట్ ఫ్లోర్ వరకు నీళ్ళు వచ్చాయి",
  "అమ్మమ్మకి షుగర్, ఇన్సులిన్ అయిపోయింది",
  "బోట్ పంపండి, మందులు కావాలి",
  "నా పేరు లక్ష్మి",
  "Payakapuram water tank daggara unnam, 6 mandi, 2 pillalu, water chest varaku, boat pampandi",
];

const PRIO = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const WATER = { none: "No water", ankle: "Ankle", knee: "Knee", waist: "Waist", chest: "Chest", first_floor: "First floor", roof: "Roof" };

function toast(msg, cls = "") {
  const t = document.createElement("div");
  t.className = `toast ${cls}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function setState(s, text) {
  document.body.dataset.state = s;
  if (text !== undefined) $("#status").textContent = text;
}

async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function bubble(who, te, en) {
  const log = $("#log");
  log.querySelector(".empty")?.remove();
  const d = document.createElement("div");
  d.className = `msg ${who}`;
  const a = document.createElement("div");
  a.className = "te";
  a.textContent = te;
  d.appendChild(a);
  if (en) {
    const b = document.createElement("div");
    b.className = "en";
    b.textContent = en;
    d.appendChild(b);
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function play(b64) {
  return new Promise((res) => {
    const a = new Audio(`data:audio/wav;base64,${b64}`);
    current = a;
    a.onended = res;
    a.onerror = res;
    a.play().catch(res);
  });
}

async function speak(reply, audios) {
  setState("speaking", "Agent మాట్లాడుతోంది…");
  bubble("agent", reply.map((r) => r.te).join(" "), reply.map((r) => r.en).join(" "));
  for (const a of audios || []) {
    if (ended) return;
    if (a) await play(a);
  }
}

function renderFields(f = {}, captured = {}, preview = null) {
  const vul = [["elderly", "elderly"], ["children", "children"], ["pregnant", "pregnant"], ["disabled", "disabled"], ["sick", "sick"]]
    .filter(([k]) => f[k]).map(([k, n]) => `${f[k]} ${n}`).join(", ") || (f.no_vulnerable ? "None" : "");
  const rows = [
    ["Location", [f.area, f.landmark].filter(Boolean).join(" · "), "area landmark", true],
    ["People", f.people ? String(f.people) : "", "people"],
    ["Water level", WATER[f.water] || "", "water"],
    ["Vulnerable", vul, "elderly children pregnant disabled sick no_vulnerable"],
    ["Medical", (f.medical || []).join(", ") || (f.no_medical ? "None" : ""), "medical no_medical"],
    ["Needs", (f.needs || []).join(", ").replace(/_/g, " "), "needs", true],
    ["Name", f.name || "", "name"],
  ];
  $("#fields").innerHTML = "";
  for (const [label, val, keys, wide] of rows) {
    const d = document.createElement("div");
    d.className = `f${wide ? " wide" : ""}${val ? "" : " unset"}${keys.split(" ").some((k) => k in captured) ? " flash" : ""}`;
    d.innerHTML = "<label></label><div></div>";
    d.querySelector("label").textContent = label;
    d.querySelector("div").textContent = val || "waiting…";
    $("#fields").appendChild(d);
  }
  $("#prio").innerHTML = preview ? `<span class="badge b-${preview.priority}">${PRIO[preview.priority]}</span>` : "";
}

async function startCall() {
  ended = false;
  sessionId = null;
  $("#log").innerHTML = "";
  $("#result").hidden = true;
  renderFields();
  $("#start").hidden = true;
  $("#end").hidden = false;
  $("#mic").hidden = false;
  $("#typed").disabled = $("#send").disabled = false;
  setState("thinking", "Connecting…");
  try {
    stream = stream || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }));
  } catch {
    stream = null;
    toast("Microphone not available. Type your replies instead.");
  }
  ctx = ctx || new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  try {
    const j = await api("/api/session");
    sessionId = j.sessionId;
    $("#engine").textContent = j.engine;
    await speak(j.reply, j.audios);
    listen();
  } catch (e) {
    toast(e.message);
    endCall();
  }
}

function endCall() {
  ended = true;
  stopListening(true);
  current?.pause();
  $("#start").hidden = false;
  $("#end").hidden = true;
  $("#mic").hidden = true;
  $("#typed").disabled = $("#send").disabled = true;
  setState("idle", "Call ended. Start again to make a new request.");
}

function listen() {
  if (ended) return;
  if (!stream) { setState("idle", "Type your reply below"); return; }
  chunks = [];
  recorder = new MediaRecorder(stream);
  const rec = recorder;
  rec.spoke = false;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { if (!rec.discard) onRecorded(rec); };
  rec.start();
  setState("listening", "వింటున్నాను… మాట్లాడండి");
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  let last = t0;
  clearInterval(vadTimer);
  vadTimer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    $("#level").style.transform = `scale(${1 + Math.min(rms * 14, 0.7)})`;
    const now = performance.now();
    if (rms > 0.02) { rec.spoke = true; last = now; }
    if ((rec.spoke && now - last > 1300) || now - t0 > 15000) stopListening();
  }, 80);
}

function stopListening(discard = false) {
  clearInterval(vadTimer);
  $("#level").style.transform = "";
  if (recorder?.state === "recording") {
    recorder.discard = discard;
    recorder.stop();
  }
}

async function onRecorded(rec) {
  if (ended) return;
  if (!rec.spoke) { setState("idle", "Speak / Send నొక్కి మాట్లాడండి"); return; }
  setState("thinking", "AI అర్థం చేసుకుంటోంది…");
  try {
    const audio = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
    await turn({ audio });
  } catch (e) {
    toast(e.message);
    listen();
  }
}

async function turn(payload) {
  if (busy || !sessionId) return;
  busy = true;
  let done = false;
  try {
    const j = await api("/api/turn", { sessionId, ...payload });
    if (j.said) bubble("caller", j.said);
    $("#engine").textContent = j.engine;
    renderFields(j.fields, j.captured, j.preview);
    if (j.timing) $("#timing").textContent = `Speech-to-text ${j.timing.sttMs ?? "–"} ms · AI ${j.timing.aiMs ?? "–"} ms`;
    await speak(j.reply, j.audios);
    if (j.done) { done = true; finish(j.incident); }
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
  if (!done) listen();
}

function finish(i) {
  ended = true;
  $("#start").hidden = false;
  $("#end").hidden = true;
  $("#mic").hidden = true;
  $("#typed").disabled = $("#send").disabled = true;
  setState("idle", "Request registered ✓");
  if (!i) return;
  const r = $("#result");
  r.hidden = false;
  r.innerHTML = `<h4>✅ ${i.id} registered <span class="badge b-${i.priority}">${PRIO[i.priority]}</span></h4>
    <div style="margin-bottom:6px"></div>
    <div class="meta" id="why"></div>
    <div style="margin-top:10px;font-weight:600" id="team"></div>
    <div style="margin-top:12px"><a class="btn sm primary" href="/dashboard" target="_blank">See it on the Control Room map ↗</a></div>`;
  r.querySelector("div").textContent = i.summary;
  r.querySelector("#why").textContent = `Why: ${i.reasons.join("; ")}`;
  r.querySelector("#team").textContent = i.team ? `🚤 Auto-dispatched: ${i.team.name} · ${i.team.km} km · ETA ${i.team.eta} min` : "Queued for the control-room operator to assign a team.";
}

async function toWav16k(blob) {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(out.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

$("#start").onclick = startCall;
$("#end").onclick = endCall;
$("#mic").onclick = () => {
  if (recorder?.state === "recording") { recorder.spoke = true; stopListening(); }
  else if (!busy) { current?.pause(); listen(); }
};
$("#typeForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#typed").value.trim();
  if (!text || busy || !sessionId) return;
  $("#typed").value = "";
  stopListening(true);
  current?.pause();
  setState("thinking", "AI అర్థం చేసుకుంటోంది…");
  turn({ text });
};
for (const s of SAMPLES) {
  const b = document.createElement("button");
  b.className = "chip te";
  b.textContent = s;
  b.onclick = async () => {
    if (ended) await startCall();
    $("#typed").value = s;
    $("#typeForm").requestSubmit();
  };
  $("#chips").appendChild(b);
}
renderFields();
fetch("/api/health").then((r) => r.json()).then((h) => { $("#engine").textContent = h.engine; }).catch(() => {});
