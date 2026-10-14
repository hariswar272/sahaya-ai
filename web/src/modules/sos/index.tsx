import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { ModuleDef } from "../types";
import SosPage from "./SosPage";

// The control room pulls in Leaflet, so it loads only when opened.
const SosConsole = lazy(() => import("./SosConsole"));

const Loading = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-slate-400" />
  </div>
);

const mod: ModuleDef = {
  id: "sos",
  routes: [
    { path: "/sos", element: <SosPage /> },
    {
      path: "/console/sos",
      element: (
        <Suspense fallback={<Loading />}>
          <SosConsole />
        </Suspense>
      ),
    },
  ],
};

export default mod;
