// Per-IP POST limiter (RATE_LIMIT per 10 minutes, default 600: judges on one venue NAT share an IP).
const WINDOW = 10 * 60 * 1000;
const hits = new Map();

const ipOf = (req) => req.ip || req.socket?.remoteAddress || "unknown";

/** Counts this request once and returns true when the IP is over the limit. */
export function isLimited(req) {
  if (req.rateLimited !== undefined) return req.rateLimited;
  const max = Number(process.env.RATE_LIMIT || 600);
  const now = Date.now();
  const ip = ipOf(req);
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now);
  hits.set(ip, arr);
  req.rateLimited = arr.length > max;
  return req.rateLimited;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const keep = arr.filter((t) => now - t < WINDOW);
    if (keep.length) hits.set(ip, keep);
    else hits.delete(ip);
  }
}, 60_000).unref();
