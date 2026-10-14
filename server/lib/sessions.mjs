// In-memory call sessions, expiring 30 minutes after last use.
import crypto from "node:crypto";

const TTL = 30 * 60 * 1000;
const MAX = 5000;
const map = new Map();

/** Stores `obj` itself (so callers keep a live reference) and returns its id. */
export function create(obj = {}) {
  const s = obj && typeof obj === "object" ? obj : {};
  const id = crypto.randomUUID();
  s.sessionId = id;
  if (s.id === undefined) s.id = id;
  s.created = Date.now();
  s.touched = s.created;
  map.set(id, s);
  if (map.size > MAX) map.delete(map.keys().next().value);
  return id;
}

/** Returns the live session object for `id` (touching its expiry), or null when unknown/expired. */
export function get(id) {
  const s = id ? map.get(String(id)) : null;
  if (!s) return null;
  if (Date.now() - s.touched > TTL) {
    map.delete(String(id));
    return null;
  }
  s.touched = Date.now();
  return s;
}

export const remove = (id) => map.delete(String(id));
export const size = () => map.size;

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of map) if (now - s.touched > TTL) map.delete(id);
}, 5 * 60 * 1000).unref();
