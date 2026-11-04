import { createContext } from "react";
import type { WebMenuLayer } from "./overlay-web-focus";

/** The product overlay controller also owns portalled menu keyboard focus. */
export const OverlayWebMenuContext = createContext<{
  register(menu: WebMenuLayer): () => void;
} | null>(null);
