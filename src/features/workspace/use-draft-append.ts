import { useEffect, useRef, type RefObject } from "react";
import { mediaMime } from "@/ui/media-policy";
import { ATTACHMENT_COUNT } from "./attachment-model";
import { removeStagedFile, stageLocalFile } from "./attachment-files";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { appendDraftAttachment, appendDraftText, subscribeDraftAppend, type DraftAppendRequest } from "./draft-append";
import type { useLocalDraft } from "./use-local-draft";

/** Applies requests other screens made through appendToDraft once the draft is loaded. */
export function useDraftAppend({ draftKey, scopeKey, ready, draft, mounted, locked, setLocalError }: {
  draftKey: string; scopeKey: string; ready: boolean; mounted: RefObject<boolean>;
  /** True while a send or upload owns the draft. */
  locked: () => boolean;
  draft: Pick<ReturnType<typeof useLocalDraft<ComposerDraft>>, "valueRef" | "setValue">;
  setLocalError: (error: unknown) => void;
}) {
  const latest = useRef({ draft, locked, setLocalError }); latest.current = { draft, locked, setLocalError };
  useEffect(() => {
    if (!ready) return;
    const apply = async (request: DraftAppendRequest) => {
      const { draft, locked } = latest.current;
      if (locked()) throw new Error("Wait for the current send or upload to finish.");
      if (request.text) draft.setValue(appendDraftText(draft.valueRef.current ?? emptyComposerDraft(), request.text));
      if (!request.file) return;
      const staged = await stageLocalFile({ ...request.file, mimeType: request.file.mimeType ?? mediaMime(request.file.name) }, scopeKey);
      try {
        const current = latest.current.draft;
        if (!mounted.current || latest.current.locked()) throw new Error("The draft changed before the file could be attached.");
        current.setValue(appendDraftAttachment(current.valueRef.current ?? emptyComposerDraft(), staged, ATTACHMENT_COUNT));
      } catch (error) { removeStagedFile(staged); throw error; }
    };
    return subscribeDraftAppend(draftKey, request => {
      apply(request).catch(error => { if (mounted.current) latest.current.setLocalError(error); });
    });
  }, [ready, draftKey, scopeKey, mounted]);
}
