# Sahaya AI (formerly "Aapadbandhu AI"): build contract (every worker reads this first)

> **Updates 12:40 (override anything below):**
> - Brand **"Sahaya AI"** (సహాయ), URL https://sahaya.hmgenx.in; aapadbandhu.hmgenx.in 301s to it.
> - **English is the default language.** 11 languages: en hi te ta kn ml mr bn gu pa od. UI auto-translates via `POST /api/i18n`; voice flows take `lang` from /call/start.
> - **Always light theme** (no `dark:`). Animations come from `@/components/ui` + Tailwind (see W2's list); framer-motion is allowed in web.
> - Map tiles: tile.openstreetmap.org (CARTO shows a watermark).
> - Highlight on the landing page: a **real AI calling agent** that speaks Indian languages.

**Hard deadline:** working version of your part by **12:55 IST**, polish until **13:05**, then STOP and report. Submission is 14:00. Working beats perfect. No scope creep.

**Product:** "Aapadbandhu AI" (ఆపద్బాంధవుడు, the friend who helps in trouble). One Telugu-first AI public-help platform: a website plus an installable PWA app. It has 4 modules that share one voice-AI engine:

1. `sos` (Disaster SOS, Public Safety): Telugu voice/text SOS → AI triage → priority map → nearest rescue team. **Hero demo.**
2. `arogya` (Arogya Call, Healthcare): AI follow-up "calls" to pregnant women, BP/diabetes patients and TB patients → risk flags → ASHA dashboard.
3. `rythu` (Rythu Call, Agriculture): a farmer asks by voice in Telugu → answer from weather + mandi prices + advice. Also proactive alerts.
4. `scam` (Scam Shield): check a suspicious SMS, WhatsApp message, screenshot or call description → verdict + Telugu voice explanation → report to 1930 / cybercrime.gov.in + alert family.

Context: Andhra Pradesh / Telangana (Vijayawada, Guntur, …). All seeded data is labelled **demo data**. Calls happen in the browser (same agent as a phone call). Real phone calls are the roadmap, proven by the team's production Telugu calling engine (Voxera).

## Layout and ownership (strict: edit only what you own)

```
aapadbandhu/
  .env              SARVAM_API_KEY, VOICE_SPEAKER, PORT=4200, optional GEMINI_API_KEY, GEMINI_MODEL  (never print/commit)
  CONTRACT.md       this file (lead)
  reference/        old single-file SOS prototype: server.mjs + public/ (read-only; reuse its logic, Telugu lines, VAD/WAV code)
  server/           Node 22 ESM + Fastify 5                       owner: core
    package.json, index.mjs, lib/{ai,voice,flow,store,sse,sessions}.mjs
    modules/sos.mjs | arogya.mjs | rythu.mjs | scam.mjs         owner: that module's worker
    data/           runtime JSON (gitignored)
  web/              Vite 5 + React 18 + TS + Tailwind 3 + react-router-dom 6 + vite-plugin-pwa   owner: web
    src/modules/<id>/**                                         owner: that module's worker
  deploy/           owner: devops
  pitch/            owner: pitch
  android/          owner: android
```

Need a change in a file you don't own? `SendMessage` to `main` with the exact change. Don't edit it yourself.
Never run `npm install` in a package you don't own. Only core installs in `server/` and only web installs in `web/`.

## Server

Entry: `node server/index.mjs` (reads `../.env` relative to server/). Port: `PORT` env (default 4200), host `HOST` (default 127.0.0.1).
**Test ports** (so workers don't collide): core 4201, sos 4203, arogya 4204, rythu 4205, scam 4206. Run e.g. `PORT=4203 node server/index.mjs`.
Body limit 8 MB. It serves `web/dist` with SPA fallback for non-/api GETs.
Every file in `server/modules/*.mjs` is auto-loaded. A module that throws on load is logged and skipped. One broken module never takes down the others.

```js
// server/modules/<id>.mjs
export default {
  id: "sos",
  async register(app, ctx) { app.get("/state", async () => ({ ... })); }   // app is prefixed /api/<id>
};
```

`ctx` (built by core):
- `ctx.ai.llm(messages, { temperature=0, max_tokens=400, json=false }) → Promise<{ text, engine }>`. Uses Gemini if `GEMINI_API_KEY` is set and works, otherwise Sarvam `sarvam-105b`. messages = OpenAI-style `[{role:"system"|"user"|"assistant", content}]`.
- `ctx.ai.llmJSON(messages, opts) → Promise<{ data: object|null, engine }>`. JSON mode + tolerant parse (strips `<think>`, code fences).
- `ctx.ai.vision(prompt, base64, mime) → Promise<{ text, engine }>`. Gemini only. Throws `Error("vision-unavailable")` without a key.
- `ctx.ai.hasGemini` → boolean.
- `ctx.voice.stt(wavBuffer, lang="te-IN") → Promise<string>`. Sarvam `saarika:v2.5`.
- `ctx.voice.tts(text, lang="te-IN") → Promise<string|null>`. base64 WAV via Sarvam `bulbul:v3`, cached. null on failure.
- `ctx.voice.speakAll(lines /* [{te,en}] */) → Promise<(string|null)[]>`.
- `ctx.sse.broadcast(event, data)`. Event names are `"<module>:<event>"`, e.g. `"sos:incident"`.
- `ctx.store(name, seedFn) → { data, save() }`. JSON file at `server/data/<name>.json`; `seedFn()` runs if the file is missing or empty; `save()` is a debounced atomic write. `reset()` re-seeds.
- `ctx.sessions.create(obj) → id`, `ctx.sessions.get(id)`, `ctx.sessions.delete(id)`. Sessions expire after 30 min.
- `ctx.flow(def)`: the slot-filling voice conversation engine (port of `reference/server.mjs` handleSession/handleTurn), see below.
- `ctx.rateLimit(req)` → true if over the limit (120 POSTs / 10 min / IP).

### Voice call HTTP shape (every voice call, mounted at `/api/<id>/call`)
```
POST /api/<id>/call/start   body: { ...moduleSpecific }                        → VoiceReply (with sessionId)
POST /api/<id>/call/turn    body: { sessionId, audio?: base64 16kHz mono WAV, text?: string } → VoiceReply
type VoiceReply = {
  sessionId?: string, said?: string,              // what the caller said (STT or typed)
  reply: { te: string, en: string }[],           // agent lines: Telugu + English subtitle
  audios: (string|null)[],                        // base64 WAV per reply line, same order
  done?: boolean, fields?: object, captured?: object, preview?: object, result?: object,
  timing?: { sttMs?: number, aiMs?: number }, engine?: string
}
```
Errors: 4xx/5xx with `{ error: "human readable" }`.

### `ctx.flow(def)` (slot filling; used by sos and arogya)
```js
def = {
  lines: { greeting:[te,en], ack1, ack2, ack3, sorry, <slotKey>:[te,en], <closeKeys>... },
  slots: [{ key, filled: (fields, session) => bool, maxAsks: 2 }],   // asked in order; line key = slot key
  firstSlot?: "area",                                                // asked right after greeting (default slots[0])
  extractPrompt: (fields, askedKey, utterance, session) => messages,
  clean: (raw) => partialFields,                                     // validate/normalise LLM JSON
  extraLines?: (fields, session) => string[],                        // line keys added once, e.g. ["safety"]
  finish: async (fields, session) => ({ closeKey, result }),         // closing line + result (e.g. incident)
  preview?: (fields, session) => object,
}
const engine = ctx.flow(def);
engine.start(meta) → VoiceReply      // session.meta = meta
engine.turn(body)  → VoiceReply
```
Arrays merge as a union and scalars overwrite (same as the reference). All fixed lines are pre-rendered with TTS at startup (`engine.prewarm()`).
Free-form voice (rythu, scam) means the module implements `/call/start` and `/call/turn` itself with `ctx.voice` + `ctx.ai`, returning a VoiceReply (dynamic TTS).

Core endpoints: `GET /api/health → { ok, engine, gemini, voice, modules: [...] }`, `GET /api/stream` (SSE).

## Sarvam API (verified working in reference: TTS 17/17 OK)
- TTS: `POST https://api.sarvam.ai/text-to-speech`, header `api-subscription-key`, JSON `{ text, language_code:"te-IN", model:"bulbul:v3", temperature:0.85, speaker: VOICE_SPEAKER, pace:1.1, speech_sample_rate:22050, output_audio_codec:"wav" }` → `{ audios:[b64] }`
- STT: `POST https://api.sarvam.ai/speech-to-text` multipart: `file` (wav), `model=saarika:v2.5`, `language_code=te-IN` (or `en-IN`) → `{ transcript }`
- LLM: `POST https://api.sarvam.ai/v1/chat/completions` `{ model:"sarvam-105b", messages, temperature, max_tokens, reasoning_effort:null }` → `choices[0].message.content`. **reasoning_effort:null is required**, or it returns empty content.
- Gemini REST: `POST https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, header `x-goog-api-key`. Default model `gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`. Don't use 2.0 models (shut down) or 2.5 (new keys can't use them).

## Web

- Dev: `cd web && API_PORT=<yourServerPort> npx vite --port <5173+n>`. Vite proxies `/api` → `http://127.0.0.1:${API_PORT||4200}`.
- Path alias `@` → `web/src`.
- Module entry: `web/src/modules/<id>/index.tsx` default-exports a `ModuleDef`. It is auto-discovered via `import.meta.glob("./*/index.tsx", { eager: true })`. If the file below doesn't exist yet when you need it, create it with exactly this content:
```ts
// web/src/modules/types.ts
import type { ReactNode } from "react";
export type ModuleRoute = { path: string; element: ReactNode };
export type ModuleDef = { id: "sos" | "arogya" | "rythu" | "scam"; routes: ModuleRoute[] };
```
- Routes: public page `/<id>`, officials console `/console/<id>`. Landing `/` and `/console` hub are owned by web.
- Shared code (owned by web; import it, don't copy):
  - `@/components/ui`: Button, Card, Badge, Tabs, Input, Textarea, Select, Stat, PageHeader, PriorityBadge
  - `@/components/VoiceCall`: `<VoiceCall base="/api/sos/call" startBody={{...}} title="…" samples={["…"]} onUpdate={(r) => …} onDone={(r) => …} side={<ReactNode/>} />`. Handles mic, VAD auto-stop, 16 kHz WAV, playback queue, typed fallback, chat bubbles (Telugu + English).
  - `@/lib/api`: `api<T>(path, body?)` (POST when body is given, else GET; throws `Error(message)`), `type VoiceReply`
  - `@/lib/sse`: `useStream(eventName, handler)`
  - `@/lib/i18n`: `useLang() → { lang, t(te, en) }`
  - Layout (header with module nav, language toggle, footer) wraps every route automatically.
- Available deps: react 18, react-router-dom 6, tailwindcss 3, lucide-react, clsx, tailwind-merge, leaflet + react-leaflet 4, recharts. Need anything else? Ask `main`.

## Design system (Claude-design quality)
- Feel: trustworthy civic-tech, calm, modern, Telugu-first and bilingual. The Telugu line is primary and the English line smaller beneath it.
- Fonts: "Noto Sans Telugu" + "Inter" (Google Fonts). 16 px base, generous spacing, `rounded-2xl` cards, slate-200 borders, soft shadows, page bg `#f6f7fb`, ink `#0f172a`.
- Primary `#1d4ed8`. Module accents: sos `#e11d48`, arogya `#0d9488`, rythu `#65a30d` (+ amber `#d97706`), scam `#7c3aed`.
- Priority colours: critical `#dc2626`, high `#ea580c`, medium `#ca8a04`, low `#16a34a`.
- Mobile-first: works at 360 px with no horizontal scroll. One clear primary action per screen. lucide-react icons. No emoji in UI chrome (map markers are fine).

## Rules
- Seed/demo data is labelled as demo. Never present invented numbers as real statistics.
- Never print, log or commit secrets. Never touch the Voxera production app, its files, nginx site or services.
- When done, report: files, endpoints/routes, how to test, known issues. Keep the report short.
