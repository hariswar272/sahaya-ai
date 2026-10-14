// Aapadbandhu AI server: shared voice-AI core, auto-loaded modules, SSE, and the built web app.
import "./lib/env.mjs";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { SERVER_DIR } from "./lib/env.mjs";
import * as ai from "./lib/ai.mjs";
import * as voice from "./lib/voice.mjs";
import * as sse from "./lib/sse.mjs";
import * as sessions from "./lib/sessions.mjs";
import { createStore, flushAll } from "./lib/store.mjs";
import { createFlow } from "./lib/flow.mjs";
import { isLimited } from "./lib/ratelimit.mjs";
import { sarvamInFlight } from "./lib/sarvam.mjs";
import * as i18n from "./lib/i18n.mjs";

const PORT = Number(process.env.PORT || 4200);
const HOST = process.env.HOST || "127.0.0.1";
const WEB_DIST = path.resolve(SERVER_DIR, "../web/dist");
const MODULES_DIR = path.join(SERVER_DIR, "modules");

const app = Fastify({ bodyLimit: 8 * 1024 * 1024, trustProxy: true, logger: false });

/* ------------------------------------------------------------------ ctx */

const flows = [];
const ctx = {
  ai: {
    llm: ai.llm,
    llmJSON: ai.llmJSON,
    vision: ai.vision,
    parseJSON: ai.parseJSON,
    get hasGemini() {
      return ai.hasGemini();
    },
    get engine() {
      return ai.lastEngine();
    },
  },
  voice: { stt: voice.stt, tts: voice.tts, speakAll: voice.speakAll, toCode: voice.toCode },
  i18n: {
    translate: i18n.translate,
    languages: i18n.LANGUAGES,
    normLang: i18n.normLang,
    sarvamCode: i18n.sarvamCode,
    languageName: i18n.languageName,
  },
  sse: { broadcast: sse.broadcast },
  store: createStore,
  sessions: { create: sessions.create, get: sessions.get, delete: sessions.remove },
  flow(def) {
    const f = createFlow(def, { ai: ctx.ai, voice: ctx.voice, sessions: ctx.sessions, i18n: ctx.i18n });
    flows.push(f);
    return f;
  },
  rateLimit: (req) => isLimited(req),
  log: (...a) => console.log(...a),
};

/* ---------------------------------------------------------------- hooks */

app.addHook("onRequest", async (req, reply) => {
  if (req.method === "POST" && req.url.startsWith("/api/") && isLimited(req)) {
    return reply.code(429).send({ error: "Too many requests. Please slow down." });
  }
});

app.setErrorHandler((err, req, reply) => {
  let status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  let msg = err.message || "Error";
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.url}: ${err.stack || err.message}`);
    if (/^(STT|TTS|Sarvam|Gemini)\b/.test(msg)) {
      status = 502;
      msg = "The AI service is busy right now. Please try again.";
    } else msg = "Something went wrong. Please try again.";
  }
  reply.code(status).send({ error: msg });
});

/* --------------------------------------------------------------- core API */

const loaded = [];
const failed = [];

app.get("/api/health", async () => ({
  ok: true,
  engine: ai.lastEngine(),
  gemini: ai.hasGemini(),
  geminiModel: ai.geminiModelName(),
  voice: voice.hasVoice(),
  modules: loaded,
  failed,
  sse: sse.clientCount(),
  sessions: sessions.size(),
  sarvam: sarvamInFlight(),
  tts: voice.stats,
  time: new Date().toISOString(),
}));

// Translation for the web UI and modules: English source strings → any supported language.
app.get("/api/i18n/languages", async () => i18n.LANGUAGES);
app.get("/api/i18n/dict/:lang", async (req, reply) => {
  reply.header("Cache-Control", "no-cache");
  return { lang: i18n.normLang(req.params.lang), translations: i18n.dictionary(req.params.lang) };
});
app.post("/api/i18n", async (req) => {
  const b = req.body || {};
  const lang = i18n.normLang(b.lang);
  const strings = (Array.isArray(b.strings) ? b.strings : []).filter((s) => typeof s === "string" && s.length <= 1000).slice(0, 400);
  return { lang, translations: await i18n.translate(lang, strings) };
});

app.get("/api/stream", (req, reply) => {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\nevent: hello\ndata: {}\n\n");
  sse.addClient(res, req.raw);
});

/* --------------------------------------------------------------- modules */

const files = existsSync(MODULES_DIR) ? readdirSync(MODULES_DIR).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort() : [];
for (const f of files) {
  try {
    const mod = (await import(pathToFileURL(path.join(MODULES_DIR, f)).href)).default;
    if (!mod?.id || typeof mod.register !== "function") throw new Error("must default-export { id, register(app, ctx) }");
    if (loaded.includes(mod.id)) throw new Error(`duplicate module id "${mod.id}"`);
    let ok = true;
    await app.register(
      async (sub) => {
        try {
          await mod.register(sub, ctx);
        } catch (e) {
          ok = false;
          console.error(`[modules] ${f} register() failed: ${e.stack || e.message}`);
        }
      },
      { prefix: `/api/${mod.id}` },
    );
    (ok ? loaded : failed).push(mod.id);
  } catch (e) {
    failed.push(f);
    console.error(`[modules] skipped ${f}: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ web */

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Aapadbandhu AI</title>
<body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto"><h1>Aapadbandhu AI</h1>
<p>The API is running. The web app is not built yet: run <code>npm run build</code> in <code>web/</code>.</p>
<p><a href="/api/health">/api/health</a></p></body>`;

// A missing dist only warns; files are served as soon as `vite build` creates them.
await app.register(fastifyStatic, {
  root: WEB_DIST,
  prefix: "/",
  cacheControl: false,
  setHeaders(res, file) {
    res.setHeader("Cache-Control", /[\\/]assets[\\/]/.test(file) ? "public, max-age=31536000, immutable" : "no-cache");
  },
});

app.setNotFoundHandler((req, reply) => {
  const url = req.raw.url || "/";
  // Missing files (old hashed chunks, sw.js mid-build) get a real 404, never index.html served as JS.
  const looksLikeFile = /\.[a-z0-9]{1,12}$/i.test(url.split("?")[0]);
  if ((req.method === "GET" || req.method === "HEAD") && !url.startsWith("/api/") && !looksLikeFile) {
    if (existsSync(path.join(WEB_DIST, "index.html"))) return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    return reply.type("text/html; charset=utf-8").send(NOT_BUILT);
  }
  reply.code(404).send({ error: "Not found" });
});

/* --------------------------------------------------------------- startup */

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.stack || e));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    flushAll();
    i18n.flushI18n();
    app.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

await app.listen({ port: PORT, host: HOST });
console.log(
  `Aapadbandhu AI on http://${HOST}:${PORT} · modules: ${loaded.join(", ") || "none"}${failed.length ? ` · FAILED: ${failed.join(", ")}` : ""} · AI: ${
    ai.hasGemini() ? "Gemini + Sarvam fallback" : "Sarvam"
  } · voice: ${voice.hasVoice() ? "on" : "OFF (no SARVAM_API_KEY)"}`,
);

// Pre-render every flow's fixed lines in the background so first callers hear replies instantly.
// Only in production (or PREWARM=1): the Sarvam key is shared with the live calling agent, and
// worker test servers restarting all day must not burn its rate limit. Lines persist on disk.
const PREWARM = process.env.NODE_ENV === "production" || process.env.PREWARM === "1";
if (voice.hasVoice() && flows.length) {
  if (PREWARM) {
    (async () => {
      let n = 0;
      for (const f of flows) n += await f.prewarm({ concurrency: 2, delayMs: 300 }).catch(() => 0);
      console.log(`Voice ready: ${n} fixed lines across ${flows.length} flow(s) (tts ${JSON.stringify(voice.stats)})`);
    })();
  } else console.log("Prewarm skipped (dev). Set PREWARM=1 or NODE_ENV=production to pre-render fixed lines.");
}
