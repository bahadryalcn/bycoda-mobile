import type { HostSession, SessionSync } from "./types";

/** Never apply a delta from another session or an obsolete revision. */
export function applySessionSync(known: HostSession | undefined, sync: SessionSync): HostSession {
  if (sync.kind === "snapshot") return sync.value;
  if (!known || known.revision !== (sync.kind === "delta" ? sync.base : sync.revision))
    throw new Error("Session changed; reload its transcript.");
  if (sync.kind === "unchanged") return known;
  if (known.session.id !== sync.value.session.id) throw new Error("Session identity mismatch.");
  if (Boolean(known.history) !== Boolean(sync.partial))
    throw new Error("Transcript window changed; reload history.");
  const blocks = new Map(known.session.blocks.map((block) => [block.id, block]));
  for (const block of sync.blocks) blocks.set(block.id, block);
  return {
    ...sync.value,
    session: {
      ...sync.value.session,
      blocks: sync.blockIds.map((id) => {
        const block = blocks.get(id);
        if (!block) throw new Error("Transcript delta is incomplete.");
        return block.remoteContent
          ? { ...block, remoteContent: { ...block.remoteContent, revision: sync.value.revision } }
          : block;
      }),
    },
  };
}
