# Changelog

All notable changes to Sahaya AI. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-10-14

### Added
- Disaster SOS: Telugu voice/text intake, rule-based triage, auto-dispatch for critical cases, live control-room map, AI situation report and resource forecast.
- Arogya Call: programme-specific health check-ins (ANC, NCD, TB) with explainable danger-sign rules and a risk-ranked ASHA dashboard; records expire after 48 hours.
- Rythu Call: live 7-day weather (Open-Meteo), live mandi prices (Agmarknet), trend fit, net-gain sell advice and officer alert broadcasts.
- Scam Shield: 20+ detection rules merged with AI analysis, spoken Telugu explanations, one-tap 1930 / cybercrime.gov.in actions and anonymous trend statistics.
- Real outbound phone calls through Sarvam Samvaad / Plivo (whitelisted, rate-limited).
- Installable PWA (always-light theme, lazy-loaded modules) and a Flutter WebView Android app.
- Shared slot-filling conversation engine with pre-rendered, disk-cached voice lines.

### Security
- HTTPS with HSTS, Content-Security-Policy (hashed inline bootstrap), nosniff/frame/referrer/permissions headers.
- Per-IP rate limiting, body-size caps, enum whitelists and defensive parsing of model output.
- `@fastify/static` upgraded to 10.x (path-traversal advisories); `npm audit` gate in CI.

### Quality
- 69 offline unit tests (`node:test`) with coverage script; end-to-end smoke test; GitHub Actions CI (lint, typecheck, tests, audit, build).
- ESLint flat configs for server and web, Prettier/EditorConfig, JSDoc on platform services.
- Architecture, contributing and security documentation; Docker build.

### Accessibility
- Skip link, live regions for call status and dashboards, labelled form fields and map region, decorative icons hidden from screen readers, `lang="te"` on Telugu text, reduced-motion support.
