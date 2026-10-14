import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { ModuleDef } from "../types";
import ScamPage from "./ScamPage";

// The console pulls in the charts, so it loads only when opened.
const ScamConsole = lazy(() => import("./ScamConsole"));

const Loading = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-slate-400" />
  </div>
);

const mod: ModuleDef = {
  id: "scam",
  routes: [
    { path: "/scam", element: <ScamPage /> },
    {
      path: "/console/scam",
      element: (
        <Suspense fallback={<Loading />}>
          <ScamConsole />
        </Suspense>
      ),
    },
  ],
};

export default mod;
