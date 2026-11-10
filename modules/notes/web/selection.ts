import { createContext } from "react";
import type { Selection } from "./lib/routes";

/** URL prefix of the Notes module. */
export const BASE = "/notes";

/**
 * The last item the URL resolved to, shared by sidebar and page. Paths are
 * built from names, so right after a rename the old path no longer resolves;
 * the views fall back to this item and rewrite the address bar.
 */
export const LastSelection = createContext<{ current: Selection }>({ current: null });
