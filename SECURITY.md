# Security

Sahaya AI handles emergency reports, health answers and suspected fraud, so it is built to collect as little as possible and to fail safely.

## What we do

- **No secrets in the repository.** API keys live only in a server-side `.env` (`chmod 600`), which is git-ignored. See `.env.example` for the variable names.
- **HTTPS everywhere.** nginx terminates TLS with Let's Encrypt; plain HTTP redirects to HTTPS, and the app sends HSTS.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that allows only the microphone (needed for voice calls).
- **Rate limiting** on every `POST /api/*` route per IP, plus a concurrency gate with back-off in front of the speech/LLM provider so one client can't exhaust the shared quota.
- **Input validation.** Request bodies are capped at 8 MB, text fields are length-limited, enums (programmes, water levels, needs) are whitelisted, and model output is parsed defensively and validated before it is stored.
- **Data minimisation.**
  - Scam Shield never stores the message or screenshot, only an anonymous type/verdict count.
  - Arogya health records auto-expire after 48 hours, and transcripts are never returned by the list API.
  - No accounts, no logins, no tracking cookies.
- **Explainable decisions.** The AI only extracts facts; priority and risk come from transparent rules, so a manipulated model reply can't silently escalate or suppress a case.
- **Real phone calls** are limited to whitelisted numbers, capped per day and per number, and time-limited.

## Reporting a vulnerability

Please open a private security advisory on this repository, or email the maintainer listed on the GitHub profile. Do not file public issues for security problems.
