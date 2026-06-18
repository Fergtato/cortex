import { createContext, useContext } from "react";
import type { Store } from "./store";

/** Lets deeply-nested components (e.g. editor node views) reach the store. */
export const StoreContext = createContext<Store | null>(null);

export function useStoreContext(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStoreContext must be used within <StoreContext>");
  return ctx;
}

export interface Nav {
  openPage: (id: string) => void;
  openDatabase: (id: string) => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within <NavContext>");
  return ctx;
}
