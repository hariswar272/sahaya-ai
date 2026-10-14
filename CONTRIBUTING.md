# Contributing

Thanks for helping make Sahaya AI better. Please read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.

## Setup

```bash
npm run install:all          # installs server/ and web/
cp .env.example .env         # add your SARVAM_API_KEY
npm run build                # builds the PWA into web/dist
npm start                    # http://127.0.0.1:4200
```

For UI work run `npm run dev` (Vite with hot reload) next to the server.

## Before you open a pull request

```bash
npm test          # server unit tests
npm run lint      # ESLint for server and web
npm run typecheck # TypeScript
npm run build     # production build
```

CI runs the same checks on every push.

## Adding a lifeline module

1. Create `server/modules/<id>.mjs` that default-exports `{ id, register(app, ctx) }`. Use `ctx.flow(def)` for voice conversations, `ctx.store(name)` for persistence and `ctx.sse.broadcast()` for dashboards.
2. Keep decisions in **rules**: let the model extract facts, then decide priority or risk in code with a human-readable reason. Add unit tests for the rules in `server/test/<id>.test.mjs`.
3. Create `web/src/modules/<id>/` with a public page and (optionally) a console, and register the route in `web/src/App.tsx`.
4. Add the module to the smoke test in `scripts/smoke.mjs`.

## Style

* `.editorconfig` and `.prettierrc.json` define formatting (2 spaces, double quotes, 160 columns).
* Write code in English; keep the public UI in English and the AI's spoken lines in Telugu with an English pair.
* Never commit `.env`, data files or recordings.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.
