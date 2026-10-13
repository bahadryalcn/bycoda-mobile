export type QueryLike = {
  data?: unknown;
  status?: "pending" | "error" | "success";
  fetchStatus?: "fetching" | "paused" | "idle";
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  isSuccess?: boolean;
  isEnabled?: boolean;
  error?: unknown;
  refetch?: () => unknown;
};

export type QueryPresentation =
  | "idle"
  | "loading"
  | "paused"
  | "error"
  | "stale-error"
  | "empty"
  | "ready";

/** Pending describes absent data; it does not mean an enabled request is running. */
export function getQueryPresentation(query: QueryLike, empty = false): QueryPresentation {
  const hasData = query.data !== undefined;
  if (query.error) {
    const kind = (query.error as { kind?: string }).kind;
    return hasData && kind !== "auth" && kind !== "identity" ? "stale-error" : "error";
  }
  if (query.fetchStatus === "paused") return "paused";
  if (query.isEnabled === false && !hasData) return "idle";
  if (
    !hasData &&
    (query.isLoading ||
      ((query.isPending || query.status === "pending") && query.fetchStatus !== "idle"))
  )
    return "loading";
  if (empty && (query.isSuccess || query.status === "success")) return "empty";
  return hasData || query.isSuccess || query.status === "success" ? "ready" : "idle";
}
