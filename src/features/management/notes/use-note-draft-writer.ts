import { useEffect, useState } from "react";
import { AppState } from "@/state/app-state";
import { createNoteDraftWriter, type NoteDraftWriteState } from "../note-draft-writer";
import type { NoteDraftOwner } from "../note-drafts";

/**
 * The editor owns its save state so a keystroke re-renders the editor, not the Notes list.
 * The owner is captured once: a draft always stays under the machine its note came from.
 */
export function useNoteDraftWriter(owner: NoteDraftOwner | null) {
  const [state, setState] = useState<NoteDraftWriteState>({ status: "idle" });
  const [writer] = useState(() => createNoteDraftWriter(owner, setState));
  // Effect: leaving the foreground or unmounting are the last safe moments to persist a debounced edit.
  useEffect(() => {
    const flush = () => { void writer.flush().catch(() => {}); };
    const subscription = AppState.addEventListener("change", (next) => { if (next !== "active") flush(); });
    return () => { subscription.remove(); flush(); };
  }, [writer]);
  return { writer, state };
}
