import type { Block } from "./wire";

/**
 * The Host sends a long block as a 32 KiB preview marked with `remoteContent`; `sessions.block`
 * returns the whole block. An action that reuses the words (send a draft, edit from here, copy)
 * must read the whole block first, or it would silently act on the cut preview.
 */
export function needsFullContent(block: Pick<Block, "id" | "remoteContent">, loaded?: Pick<Block, "id">): boolean {
  return !!block.remoteContent && loaded?.id !== block.id;
}

/** The block an action may use: the transcript block itself, or its loaded whole; undefined while only the preview is known. */
export function fullContentBlock<T extends Pick<Block, "id" | "remoteContent">>(block: T, loaded?: T): T | undefined {
  if (!block.remoteContent) return block;
  return loaded && loaded.id === block.id ? loaded : undefined;
}
