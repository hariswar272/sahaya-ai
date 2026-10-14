// One gate for every Sarvam API call. The key is shared with the production calling agent, so:
// at most SARVAM_CONCURRENCY (default 3) requests in flight, and 429/5xx are retried with backoff.
const BACKOFF = [800, 2000, 4000];
let active = 0;
const waiting = [];

const max = () => Math.max(1, Number(process.env.SARVAM_CONCURRENCY || 3));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function acquire() {
  return new Promise((resolve) => {
    if (active < max()) {
      active++;
      resolve();
    } else waiting.push(resolve);
  });
}

function release() {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight over
  else active--;
}

// Network blips are worth a retry; our own timeouts are not (the caller is waiting on a live turn).
const transient = (e) => e?.name === "TypeError";

/** fetch with the shared cap + retries. `makeInit` is called per attempt (fresh body/signal). */
export async function sarvamFetch(url, makeInit, label = "sarvam") {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res;
    try {
      res = await fetch(url, makeInit());
    } catch (e) {
      release();
      if (attempt < BACKOFF.length && transient(e)) {
        console.warn(`[${label}] network error, retry ${attempt + 1}/${BACKOFF.length}: ${e.message}`);
        await sleep(BACKOFF[attempt]);
        continue;
      }
      throw e;
    }
    release();
    if ((res.status === 429 || res.status >= 500) && attempt < BACKOFF.length) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 5000) : BACKOFF[attempt];
      console.warn(`[${label}] HTTP ${res.status}, retry ${attempt + 1}/${BACKOFF.length} in ${wait} ms`);
      try {
        await res.body?.cancel();
      } catch {}
      await sleep(wait);
      continue;
    }
    return res;
  }
}

export const sarvamInFlight = () => ({ active, waiting: waiting.length });
