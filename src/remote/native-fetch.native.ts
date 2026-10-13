import { fetch as expoFetch } from "expo/fetch";

/** Load native networking with the app, before a host request's network deadline starts. */
export const nativeHostFetch = expoFetch as typeof fetch;
