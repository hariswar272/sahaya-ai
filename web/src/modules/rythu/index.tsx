import type { ModuleDef } from "../types";
import RythuPage from "./RythuPage";
import RythuConsole from "./RythuConsole";

const mod: ModuleDef = {
  id: "rythu",
  routes: [
    { path: "/rythu", element: <RythuPage /> },
    { path: "/console/rythu", element: <RythuConsole /> },
  ],
};

export default mod;
