import { questionSubmissionHeld } from "./question-status";
import { questionDraftFiles, type QuestionAttachmentDraftStore } from "./question-attachment-draft";
import type { StagedAttachment } from "./attachment-model";

/** Absence proves only that an unsent draft is orphaned. Receipts, navigation and
 * absence of submitted/unknown questions never prove provider consumption. */
export async function reconcileQuestionAttachments(store: QuestionAttachmentDraftStore, revision: number,
  active: ReadonlySet<string>, environmentId: string, current: () => boolean,
  cleanup: { stage(files: StagedAttachment[]): Promise<void>; removeFile(file: StagedAttachment): Promise<void>; flush(): Promise<void> }) {
  await store.hydrate();
  if (!current()) return;
  const orphan = store.observe(revision, active);
  for (const [identity, entry] of store.all()) {
    if (entry.environmentId !== environmentId || !orphan(identity) || store.busy(identity) ||
      questionSubmissionHeld({ requestId: 0, questions: [], delivery: entry.delivery })) continue;
    await store.exclusive(identity, async () => {
      const allowed = () => current() && orphan(identity);
      if (!allowed()) return;
      // A failed earlier write is still memory-owned; make it durable before staging.
      await store.save(identity, entry);
      if (!allowed()) return;
      const files = questionDraftFiles(entry);
      await cleanup.stage(files);
      await store.remove(identity, allowed);
      if (store.read(identity)) return;
      for (const file of files) await cleanup.removeFile(file);
      await cleanup.flush();
    });
  }
}
