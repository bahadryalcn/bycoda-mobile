import { useMemo } from "react";
import { useListScrollMemory } from "@/ui/use-list-scroll-memory";
import type { InboxBrowseMemory } from "./inbox-browse-memory";
import type { InboxOrigin } from "./provider-protocol";

/** Inbox persistence adapter for the shared measured list owner. */
export function useInboxScrollMemory<T>(memory: Pick<InboxBrowseMemory, "scroll"> | null, origin: InboxOrigin, offset: number, ready: boolean, rowCount: number, options: { suspended?: boolean } = {}) {
  const port = useMemo(() => memory ? { scroll: (value: number) => memory.scroll(origin, value) } : null, [memory, origin.machineId, origin.projectId]);
  return useListScrollMemory<T>(port, offset, ready, rowCount, options);
}
