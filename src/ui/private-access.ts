import { createContext, useContext } from "react";
export type PrivateContentAccess = { allowed: boolean; check: () => boolean };
const publicAccess: PrivateContentAccess = { allowed: true, check: () => true };
export const PrivateContentContext = createContext<PrivateContentAccess>(publicAccess);
export const PrivateContentAccessProvider = PrivateContentContext.Provider;
export function usePrivateContentAccess() { return useContext(PrivateContentContext); }
export function usePrivateContentAllowed() { const value = usePrivateContentAccess(); return value.allowed && value.check(); }
