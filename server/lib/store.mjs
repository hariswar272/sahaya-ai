// Tiny JSON-file store: one file per name under DATA_DIR (default server/data), atomic debounced saves.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "./env.mjs";

const dataDir = () => process.env.DATA_DIR || path.join(SERVER_DIR, "data");
const stores = new Map();

const isEmpty = (d) => d == null || (Array.isArray(d) ? d.length === 0 : typeof d === "object" && Object.keys(d).length === 0);

/**
 * Opens (or returns the already-open) JSON store `<DATA_DIR>/<name>.json`.
 * @param {string} name  letters, digits, "_" or "-" only
 * @param {() => object} [seedFn]  initial contents when the file is missing or empty
 * @returns {{data: object, save: () => void}} `data` is live; call `save()` after changing it
 */
export function createStore(name, seedFn) {
  if (!/^[a-z0-9_-]+$/i.test(String(name))) throw new Error(`store: bad name "${name}"`);
  if (stores.has(name)) return stores.get(name);
  const file = path.join(dataDir(), `${name}.json`);
  const seed = () => (typeof seedFn === "function" ? seedFn() : {});

  let data = null;
  try {
    if (existsSync(file)) data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`[store] ${name}: unreadable, reseeding (${e.message})`);
  }
  const seeded = isEmpty(data);
  if (seeded) data = seed();

  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, file);
    } catch (e) {
      console.error(`[store] ${name}: save failed: ${e.message}`);
    }
  };

  const store = {
    get data() {
      return data;
    },
    set data(v) {
      data = v;
    },
    /** Debounced: many saves within 250 ms become one write. Always read through store.data. */
    save() {
      if (!timer) timer = setTimeout(flush, 250);
    },
    flush,
    /** Re-run the seed and persist immediately. Returns the new data. */
    reset() {
      data = seed();
      flush();
      return data;
    },
  };
  stores.set(name, store);
  if (seeded) store.save();
  return store;
}

/** Writes every pending store to disk immediately (used on shutdown). */
export function flushAll() {
  for (const s of stores.values()) s.flush();
}
