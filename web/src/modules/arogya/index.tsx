import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { ModuleDef } from "../types";
import ArogyaPage from "./ArogyaPage";

// The dashboard pulls in the charts, so it loads only when opened.
const ArogyaConsole = lazy(() => import("./ArogyaConsole"));

const Loading = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
  </div>
);

const mod: ModuleDef = {
  id: "arogya",
  routes: [
    { path: "/arogya", element: <ArogyaPage /> },
    {
      path: "/console/arogya",
      element: (
        <Suspense fallback={<Loading />}>
          <ArogyaConsole />
        </Suspense>
      ),
    },
  ],
};

export default mod;
