import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { mediaAccessRevoked, visibleMediaData } from "./media-policy";

// Query objects belong to their QueryClient and disappear with its cache/GC.
// Keep denial across reader remounts without storing credentials or changing keys.
const denied = new WeakSet<object>();

export function usePrivateMediaData<T>(queryKey: QueryKey, query: {
  data: T | undefined; error: unknown; isError: boolean; isSuccess: boolean; isFetching: boolean;
}): T | undefined {
  const client = useQueryClient();
  const owner = client.getQueryCache().find({ queryKey, exact: true });
  if (owner) {
    // Observer snapshots can lag the cache during concurrent renders/remounts.
    if (mediaAccessRevoked(owner.state.error)) denied.add(owner);
    else if (owner.state.status === "success" && !owner.state.error && owner.state.fetchStatus === "idle") denied.delete(owner);
    if (denied.has(owner)) return undefined;
  }
  return owner ? visibleMediaData(query) : undefined;
}
