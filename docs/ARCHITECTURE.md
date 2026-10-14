# Architecture

Sahaya AI is a small monorepo: a Fastify API that also serves the built web app, a React PWA, and a Flutter WebView wrapper for Android.

```
┌─────────────────────────────┐        ┌──────────────────────────────────────────┐
│  web/  (React + Vite PWA)   │  HTTPS │  server/  (Node 22 + Fastify 5)          │
│  src/components  shared UI  │◄──────►│  index.mjs   bootstrap, hooks, static    │
│  src/modules/<id>  pages    │  JSON  │  lib/        shared platform services    │
│  android/  WebView wrapper  │  SSE   │  modules/    one file per lifeline       │
└─────────────────────────────┘        └──────────────┬───────────────────────────┘
                                                      │
                               Sarvam AI (STT · TTS · LLM · translate) · Gemini (optional)
                               Open-Meteo · data.gov.in Agmarknet · Samvaad / Plivo (calls)
```

## Server

### Bootstrap (`server/index.mjs`)

1. Loads `.env`, creates the Fastify app, and installs the cross-cutting hooks: security headers on every response, per-IP rate limiting on `POST /api/*`, and a single error handler that maps provider failures to `502` and never leaks stack traces.
2. Builds a **context object** (`ctx`) that exposes the platform services to modules: `ai`, `voice`, `i18n`, `sse`, `store`, `sessions`, `flow`, `rateLimit`, `log`.
3. **Auto-loads modules** from `server/modules/*.mjs`. Each module default-exports `{ id, register(app, ctx) }` and is mounted under `/api/<id>`. A module that throws is reported in `/api/health` instead of taking the server down.
4. Serves `web/dist` with immutable caching for hashed assets, and an SPA fallback that never serves `index.html` for missing files.
5. In production, pre-renders every fixed voice line in the background so first callers hear replies instantly.

### Platform services (`server/lib/`)

| File | Responsibility |
|---|---|
| `ai.mjs` | LLM calls with automatic Gemini → Sarvam fallback, a tolerant JSON parser for model output, vision for screenshots. |
| `voice.mjs` | Speech-to-text and text-to-speech through Sarvam with a two-level (memory + disk) TTS cache keyed by a hash of text and language. |
| `flow.mjs` | The **slot-filling conversation engine** (see below). |
| `i18n.mjs` | Language normalisation and translation of English source strings into ten Indian languages, cached on disk. |
| `sarvam.mjs` | A concurrency gate (max 3 in flight) with exponential back-off in front of every Sarvam request. |
| `store.mjs` | Tiny JSON document stores with debounced writes and `flushAll()` on shutdown. |
| `sessions.mjs` | In-memory call sessions with expiry. |
| `sse.mjs` | One Server-Sent Events stream shared by all dashboards. |
| `ratelimit.mjs` | Fixed-window per-IP limiter. |
| `env.mjs` | `.env` loading and path constants. |

### The conversation engine (`lib/flow.mjs`)

Every voice call is a **declarative flow definition**: fixed lines in Telugu and English, a list of *slots* (facts to collect, each with a `filled` predicate and a maximum number of asks), an `extractPrompt` that asks the LLM to pull facts out of free speech, a `clean` step that validates the model output, and a `finish` step that turns the collected facts into a result.

The engine owns the loop: greet → ask the first slot → (transcribe → extract → merge → acknowledge → ask the next unfilled slot) → finish. The LLM only ever *extracts*; it never decides priority or risk. That keeps every decision explainable and lets the engine be unit-tested with the AI, voice and session layers replaced by stubs.

### Modules (`server/modules/`)

| Module | What it owns |
|---|---|
| `sos.mjs` | Disaster SOS flow, rule-based triage (`triage()`), team assignment, control-room state, AI situation report and resource forecast. |
| `arogya.mjs` | Programme-specific health check-in flows (ANC, NCD, TB) with danger-sign rules and a 48-hour record expiry. |
| `rythu.mjs` | Farmer advice: live weather (Open-Meteo), live mandi prices (Agmarknet), trend fit and net-gain sell advice, officer alerts. |
| `scam.mjs` | Scam Shield: 20+ detection rules merged with an AI analysis in a way that the AI can never downgrade a rule-detected scam. |
| `phone.mjs` | Real outbound calls through Samvaad or Plivo, restricted to a whitelist with daily caps. |

Each module registers its own routes, owns its own store, and talks to the rest of the system only through `ctx`.

## Web

* `src/components/` holds shared UI: the layout and navigation, the **`VoiceCall`** component (mic capture → `/api/<module>/call/turn` → plays the returned audio), device frames, charts and the preloader.
* `src/modules/<id>/` holds one public page and one console (dashboard) per lifeline. Modules are lazy-loaded so the main bundle stays small.
* Dashboards subscribe to `/api/stream` (SSE) and patch local state on events; there is no polling.
* The UI is English; the AI speaks Telugu. All motion goes through Framer Motion with `reducedMotion="user"`.

## Data and privacy

* Stores are JSON files under `server/data/` (git-ignored). Nothing is stored for scam checks except an anonymous type/verdict count; health records expire after 48 hours.
* Secrets live only in `.env` (see `.env.example`).

## Testing

* `server/test/*.test.mjs` — 69 offline unit tests (`node:test`) covering the engine, every module's rules and the shared helpers.
* `scripts/smoke.mjs` — an end-to-end run against a live server: every module's API plus a full voice-call flow.
* `.github/workflows/ci.yml` — tests, typecheck and production build on every push.
