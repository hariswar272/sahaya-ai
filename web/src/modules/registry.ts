// Registry of all modules; the router, navbar and home page are generated from this list.
import type { ModuleDef } from "./types";

// Every web/src/modules/<id>/index.tsx registers itself, loaded lazily on first visit
// so the main bundle stays small. A missing module just isn't listed.
export const moduleLoaders = import.meta.glob<{ default: ModuleDef }>("./*/index.tsx");

/** Module ids present in this build (from the folder names). */
export const moduleIds: string[] = Object.keys(moduleLoaders)
  .map((k) => k.match(/^\.\/([^/]+)\/index\.tsx$/)?.[1])
  .filter((x): x is string => !!x);

const ids = new Set(moduleIds);

/** Does a route like "/sos" or "/console/sos" have a module behind it? */
export const hasRoute = (path: string) => {
  const m = path.match(/^\/(?:console\/)?([^/]+)/);
  return !!m && ids.has(m[1]);
};

/** Load a module definition by id. */
export function loadModule(id: string): Promise<ModuleDef | null> {
  const loader = moduleLoaders[`./${id}/index.tsx`];
  if (!loader) return Promise.resolve(null);
  return loader()
    .then((m) => m.default ?? null)
    .catch((e) => {
      console.error("module failed to load", id, e);
      return null;
    });
}
