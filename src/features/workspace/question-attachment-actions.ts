import type { HostTransport } from "@/remote/transport";
import { RemoteHostError } from "@/remote/host-error";
import { ATTACHMENT_COUNT, type StagedAttachment, type TransferState } from "./attachment-model";
import { buildReply, questionComplete } from "./question-card-model";
import { questionSubmissionHeld } from "./question-status";
import { questionDraftFiles, type QuestionAttachmentDraftStore } from "./question-attachment-draft";
import type { QuestionDraft } from "./session-types";
import type { UserQuestionPrompt, UserQuestionReply } from "./wire";

type Dependencies = {
  pick(kind: "photo" | "document"): Promise<StagedAttachment[]>;
  prepare(file: StagedAttachment): Promise<string | undefined>;
  upload(file: StagedAttachment, signal: AbortSignal, progress: (value: number) => void): Promise<unknown>;
  stage(files: StagedAttachment[]): Promise<void>;
  flush(): Promise<void>;
  removeFile(file: StagedAttachment): void | Promise<void>;
};
/** One exact question occurrence. Every async continuation checks its captured owner. */
export class QuestionAttachmentActions {
  readonly transfers: Record<string, TransferState> = {};
  private controller?: AbortController;
  constructor(readonly store: QuestionAttachmentDraftStore, readonly identity: string,
    readonly client: HostTransport, private readonly question: UserQuestionPrompt,
    private readonly current: () => boolean, private readonly dependencies: Dependencies,
    private readonly changed: () => void = () => {}) {}
  private check() {
    if (!this.current()) throw new Error("This question changed. Reopen its current answer.");
    this.client.assertCurrentAccess();
    const entry = this.store.read(this.identity);
    if (entry && entry.environmentId !== this.client.machine.environmentId)
      throw new Error("This computer identity changed. Reopen its current question.");
  }
  private entry() {
    return this.store.read(this.identity) ?? { environmentId: this.client.machine.environmentId!, draft: { answers: {}, custom: {} } };
  }
  private editable() {
    this.check();
    if (questionSubmissionHeld({ ...this.question, delivery: this.entry().delivery ?? this.question.delivery }))
      throw new Error("This answer is awaiting confirmation. Check the session before trying again.");
  }
  private item(id: string) {
    const item = this.question.questions.find(item => item.id === id);
    if (!item?.allowCustom || item.preserveCustomWhitespace) throw new Error("This question does not accept attachments.");
    return item;
  }
  load() { return this.store.hydrate(); }
  draft() { return this.entry().draft; }
  transferStates(): Record<string, TransferState> {
    return { ...Object.fromEntries(Object.entries(this.entry().failures ?? {}).map(([id, error]) => [id, { status: "error" as const, progress: 0, error }])), ...this.transfers };
  }
  busy() { return this.store.busy(this.identity); }
  cancel() { this.controller?.abort(); }
  /** Typing: exact text is in memory at once, disk writes coalesce. `immediate` (submit) writes now. */
  saveDraft(draft: QuestionDraft, immediate = false) {
    this.check();
    const next = { ...draft, attachments: this.draft().attachments };
    if (JSON.stringify(next) === JSON.stringify(this.draft())) return immediate ? this.store.flush() : Promise.resolve();
    const entry = { ...this.entry(), draft: next };
    return immediate ? this.store.save(this.identity, entry) : this.store.saveLater(this.identity, entry);
  }
  /** Blur/unmount: write pending text without waiting for the debounce. */
  flushDraft() { return this.store.flush(); }
  choose(id: string, kind: "photo" | "document") {
    return this.store.exclusive(this.identity, async () => {
      this.editable(); this.item(id);
      const files = await this.dependencies.pick(kind);
      try {
        this.editable();
        if (questionDraftFiles(this.entry()).length + files.length > ATTACHMENT_COUNT)
          throw new Error("You can attach up to 20 files.");
      } catch (error) { for (const file of files) await this.dependencies.removeFile(file); throw error; }
      const draft = this.draft();
      await this.store.save(this.identity, { ...this.entry(), draft: { ...draft, attachments: { ...draft.attachments, [id]: [...(draft.attachments?.[id] ?? []), ...files] } } });
    });
  }
  private async upload(id: string, file: StagedAttachment) {
    this.editable(); this.item(id);
    const controller = this.controller = new AbortController();
    const update = (state: TransferState) => { this.transfers[file.id] = state; this.changed(); };
    update({ status: "uploading", progress: 0 });
    try {
      const claimId = await this.dependencies.prepare(file); this.editable();
      const prepared = { ...file, ...(claimId ? { claimId } : {}) };
      const draft = this.draft();
      if (!draft.attachments?.[id]?.some(entry => entry.id === file.id)) throw new Error("Attachment upload cancelled.");
      await this.store.save(this.identity, { ...this.entry(), draft: { ...draft, attachments: { ...draft.attachments,
        [id]: draft.attachments[id].map(entry => entry.id === file.id ? prepared : entry) } } });
      this.editable();
      await this.dependencies.upload(prepared, controller.signal, progress => update({ status: "uploading", progress }));
      this.editable();
      if (this.entry().failures?.[file.id]) {
        const failures = { ...this.entry().failures }; delete failures[file.id];
        await this.store.save(this.identity, { ...this.entry(), failures });
      }
      update({ status: "ready", progress: 1 });
    } catch (error) {
      update({ status: "error", progress: 0, error });
      await this.store.save(this.identity, { ...this.entry(), failures: { ...this.entry().failures, [file.id]: error instanceof Error ? error.message : String(error) } }).catch(() => {});
      throw error;
    }
    finally { this.controller = undefined; }
  }
  retry(id: string, file: StagedAttachment) {
    return this.store.exclusive(this.identity, () => this.upload(id, file));
  }
  remove(id: string, file: StagedAttachment) {
    return this.store.exclusive(this.identity, async () => {
      this.editable(); this.item(id);
      const entry = this.entry();
      const latest = entry.draft.attachments?.[id]?.find(item => item.id === file.id);
      if (!latest) return;
      // Never stage cleanup for a reference whose custody has not reached disk.
      await this.store.save(this.identity, entry); this.editable();
      await this.dependencies.stage([latest]); this.editable();
      await this.store.replace(this.identity, current => ({ ...current, draft: { ...current.draft, attachments: { ...current.draft.attachments,
        [id]: (current.draft.attachments?.[id] ?? []).filter(item => item.id !== file.id) } } }));
      await this.dependencies.removeFile(latest);
      await this.dependencies.flush();
    });
  }
  send(draft: QuestionDraft, skipped: boolean, dispatch: (reply: UserQuestionReply) => Promise<unknown>) {
    return this.store.exclusive(this.identity, async () => {
      let dispatched = false;
      let markedSending = false;
      try {
        this.editable();
        await this.saveDraft(draft, true); this.editable();
        if (!skipped) {
          if (!this.question.questions.every(item => questionComplete(item, this.draft())))
            throw new Error("Complete the question before sending.");
          for (const item of this.question.questions) {
            const files = this.draft().attachments?.[item.id] ?? [];
            if (files.length) this.item(item.id);
            for (const file of files) await this.upload(item.id, file);
          }
        }
        this.editable();
        const reply = skipped ? { kind: "skipped" as const } : buildReply(this.question.questions, this.draft());
        markedSending = true;
        await this.store.save(this.identity, { ...this.entry(), delivery: "sending" });
        this.check();
        // No await between final occurrence/access check and the original dispatcher.
        dispatched = true;
        return await dispatch(reply);
      } catch (error) {
        const delivery = !dispatched || error instanceof RemoteHostError && !error.uncertain ? "failed" : "unknown";
        // Memory is updated even when persistence fails. A remount cannot authorize replay.
        if (markedSending)
          await this.store.save(this.identity, { ...this.entry(), delivery }).catch(() => {});
        throw !dispatched ? new RemoteHostError(this.client.machine.id, "host", error instanceof Error ? error.message : String(error)) : error;
      }
    });
  }
}
