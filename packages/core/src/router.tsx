import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface RouterApi {
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterApi | null>(null);

/** Minimal History API router: the shell only needs "current path" and "go to". */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (to === window.location.pathname) return;
    if (opts?.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setPath(window.location.pathname);
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within <RouterProvider>");
  return ctx;
}

/** Splits `/finance/accounts/1` into `{ moduleId: "finance", subpath: "/accounts/1" }`. */
export function splitPath(path: string): { moduleId: string; subpath: string } {
  const m = /^\/([^/]+)(\/.*)?$/.exec(path);
  if (!m) return { moduleId: "", subpath: "/" };
  return { moduleId: decodeURIComponent(m[1]), subpath: m[2] || "/" };
}
