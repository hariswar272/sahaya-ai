import { lazy, Suspense, useEffect, useMemo, type ComponentType } from "react";
import { BrowserRouter, matchPath, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { LangProvider } from "@/lib/i18n";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadModule, moduleIds } from "@/modules/registry";
import type { ModuleDef } from "@/modules/types";
import NotFound from "@/pages/NotFound";

const Landing = lazy(() => import("@/pages/Landing"));
const ConsoleHub = lazy(() => import("@/pages/ConsoleHub"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageLoader() {
  return (
    <div className="container-page py-10">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="skeleton h-64 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Renders the matching route of a lazily loaded module. */
function moduleScreen(id: string): ComponentType {
  return lazy(async () => {
    const def: ModuleDef | null = await loadModule(id);
    function ModuleScreen() {
      const { pathname } = useLocation();
      const clean = pathname.replace(/\/+$/, "") || "/";
      const route = def?.routes.find((r) => r.path === clean) ?? def?.routes.find((r) => matchPath({ path: r.path, end: true }, clean));
      return route ? <>{route.element}</> : <NotFound />;
    }
    return { default: ModuleScreen };
  });
}

export default function App() {
  const screens = useMemo(() => Object.fromEntries(moduleIds.map((id) => [id, moduleScreen(id)])), []);

  return (
    <MotionConfig reducedMotion="user">
    <LangProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Landing />
                </Suspense>
              }
            />
            <Route
              path="/console"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ConsoleHub />
                </Suspense>
              }
            />
            {moduleIds.flatMap((id) => {
              const Screen = screens[id];
              const el = (
                <ErrorBoundary key={id}>
                  <Suspense fallback={<PageLoader />}>
                    <Screen />
                  </Suspense>
                </ErrorBoundary>
              );
              return [
                <Route key={`${id}:pub`} path={`/${id}`} element={el} />,
                <Route key={`${id}:pub/*`} path={`/${id}/*`} element={el} />,
                <Route key={`${id}:con`} path={`/console/${id}`} element={el} />,
                <Route key={`${id}:con/*`} path={`/console/${id}/*`} element={el} />,
              ];
            })}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </LangProvider>
    </MotionConfig>
  );
}
