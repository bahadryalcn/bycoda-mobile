export type ProjectDirectoryReadiness =
  | "ready"
  | "loading"
  | "sync-required"
  | "error"
  | "waiting";

type DirectoryState = {
  readable: boolean;
  hasData: boolean;
  grouped: boolean;
  privacyReady?: boolean;
  isFetching: boolean;
  error?: unknown;
};

/** Expired visibility proof is a loading dependency, not a hidden-project verdict. */
export function getProjectDirectoryReadiness({
  readable,
  hasData,
  grouped,
  privacyReady,
  isFetching,
  error,
}: DirectoryState): ProjectDirectoryReadiness {
  if (readable && hasData && (!grouped || privacyReady === true)) return "ready";
  if (error) return "error";
  if (readable && hasData && grouped && privacyReady === false) return "sync-required";
  return isFetching ? "loading" : "waiting";
}
