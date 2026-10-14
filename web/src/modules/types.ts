// web/src/modules/types.ts
import type { ReactNode } from "react";
export type ModuleRoute = { path: string; element: ReactNode };
export type ModuleDef = { id: "sos" | "arogya" | "rythu" | "scam" | "phone"; routes: ModuleRoute[] };
