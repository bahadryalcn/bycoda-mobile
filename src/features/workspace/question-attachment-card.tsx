import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HostTransport } from "@/remote/transport";
import { Button, ErrorText, Row, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { QuestionCard } from "./question-card";
import { ComposerAttachments } from "./composer-attachments";
import { QuestionAttachmentActions } from "./question-attachment-actions";
import { questionAttachmentStore } from "./question-attachment-draft";
import { questionCardIdentity } from "./question-card-state";
import { attachmentReleases, supportsAttachmentOwnership } from "./attachment-ownership";
import { pickAttachments, removeStagedFile } from "./attachment-files";
import { uploadAttachment } from "./attachment-transfer";
import { retainedAttachmentFiles } from "./attachment-retention";
import { reconcileQuestionAttachments } from "./question-attachment-cleanup";
import { questionSubmissionHeld } from "./question-status";
import type { QuestionCardProps, QuestionDraft, SessionScope } from "./session-types";

/** All controls use the ordinary picker/uploader/claims and the original command dispatcher. */
export function QuestionAttachmentCard(props: QuestionCardProps & { client: HostTransport; scope: SessionScope }) {
  const { client, scope } = props;
  const identity = questionCardIdentity(props.draftScope, props.question);
  const [binding, setBinding] = useState({ client, generation: 0 });
  if (binding.client !== client) setBinding({ client, generation: binding.generation + 1 });
  return <QuestionAttachmentOwner key={JSON.stringify([identity, binding.generation])} {...props} identity={identity} />;
}
function QuestionAttachmentOwner({ client, scope, identity, ...props }: QuestionCardProps & { client: HostTransport; scope: SessionScope; identity: string }) {
  const copy = useCopy();
  const [store] = useState(() => questionAttachmentStore(AsyncStorage, scope.machineId, scope.sessionId));
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [, refresh] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>();
  const live = useRef(true);
  const latest = useRef(props); latest.current = props;
  const [owner] = useState(() => new QuestionAttachmentActions(store, identity, client, props.question,
    () => live.current && !latest.current.disabled && !questionSubmissionHeld(latest.current.question), {
      pick: kind => pickAttachments(kind, `${scope.machineId}:${scope.sessionId}`, "question"),
      prepare: file => supportsAttachmentOwnership(client) ? attachmentReleases.prepare(client, scope.sessionId, file) : Promise.resolve(undefined),
      upload: (file, signal, progress) => uploadAttachment(client, file, scope.sessionId, signal, progress, "question"),
      stage: files => attachmentReleases.stage(client, scope.sessionId, files),
      flush: () => attachmentReleases.flush(client),
      removeFile: async file => {
        const retained = await retainedAttachmentFiles(AsyncStorage, scope.machineId, scope.sessionId, client.machine.environmentId!);
        if (!retained.some(reference => reference.id === file.id || reference.uri === file.uri)) removeStagedFile(file);
      },
    }, () => { if (live.current) refresh(value => value + 1); }));
  const load = () => {
    setError(undefined);
    void owner.load().then(() => { if (live.current) setReady(true); }).catch(cause => { if (live.current) setError(cause); });
  };
  // This exact occurrence owns all asynchronous continuation and cancellation.
  useEffect(() => { live.current = true; load(); return () => { live.current = false; owner.cancel(); }; }, [owner]);
  // Only authoritative failed delivery clears a persisted sending/unknown latch.
  useEffect(() => {
    if (ready && props.question.delivery === "failed") {
      const entry = store.read(identity);
      if (entry && entry.delivery !== "failed")
        void store.save(identity, { ...entry, delivery: "failed" }).catch(setError);
    }
  }, [ready, props.question.delivery, props.deliveryVersion, identity, store]);
  const saveDraft = useCallback((draft: QuestionDraft) => {
    if (live.current && !latest.current.disabled)
      void owner.saveDraft(draft).catch(cause => { if (live.current) setError(cause); });
  }, [owner]);
  const action = (operation: () => Promise<unknown>) => {
    setError(undefined);
    void operation().catch(cause => { if (live.current) setError(cause); });
  };
  if (!ready) return <Stack><ErrorText error={error} /><Button label={error ? copy("Yeniden dene", "Retry") : copy("Yükleniyor…", "Loading…")} busy={!error} onPress={load} /></Stack>;
  const entry = store.read(identity);
  const question = entry?.delivery && !props.question.delivery ? { ...props.question, delivery: entry.delivery } : props.question;
  return <Stack>
    <ErrorText error={error} />
    <QuestionCard {...props} question={question} initialDraft={entry?.draft} onDraftChange={saveDraft}
      attachments={owner.draft().attachments ?? {}} attachmentBusy={owner.busy()}
      submitAnswer={(reply, draft) => owner.send(draft, reply.kind === "skipped", props.onAnswer)}
      attachmentControls={(id, held) => {
        const item = props.question.questions.find(item => item.id === id);
        if (!item?.allowCustom || item.preserveCustomWhitespace) return null;
        return <Stack>
          <ComposerAttachments files={owner.draft().attachments?.[id] ?? []} transfers={owner.transferStates()} disabled={held}
            onRemove={file => action(() => owner.remove(id, file))} onRetry={file => action(() => owner.retry(id, file))} />
          <Row>
            <Button label={copy("Dosya ekle", "Attach file")} tone="quiet" density="compact" disabled={held} onPress={() => action(() => owner.choose(id, "document"))} />
            <Button label={copy("Fotoğraflar", "Photos")} tone="quiet" density="compact" disabled={held} onPress={() => action(() => owner.choose(id, "photo"))} />
          </Row>
        </Stack>;
      }} />
  </Stack>;
}

/** The authoritative session snapshot owns orphan cleanup, never a card's unmount. */
export function QuestionAttachmentCleanup({ client, scope, revision, identities, disabled }: {
  client: HostTransport; scope: SessionScope; revision: number; identities: string[]; disabled: boolean;
}) {
  const [error, setError] = useState<unknown>();
  const key = JSON.stringify(identities);
  // Compare snapshot identity after every await, including privacy/connection changes.
  useEffect(() => {
    let current = true;
    if (disabled || client.machine.id !== scope.machineId) return;
    const store = questionAttachmentStore(AsyncStorage, scope.machineId, scope.sessionId);
    void reconcileQuestionAttachments(store, revision, new Set(JSON.parse(key) as string[]), client.machine.environmentId!,
      () => current, {
        stage: files => { client.assertCurrentAccess(); return attachmentReleases.stage(client, scope.sessionId, files); },
        removeFile: async file => {
          const retained = await retainedAttachmentFiles(AsyncStorage, scope.machineId, scope.sessionId, client.machine.environmentId!);
          if (!retained.some(reference => reference.id === file.id || reference.uri === file.uri)) removeStagedFile(file);
        },
        flush: () => attachmentReleases.flush(client),
      }).then(() => { if (current) setError(undefined); }).catch(cause => { if (current) setError(cause); });
    return () => { current = false; };
  }, [client, scope.machineId, scope.sessionId, revision, key, disabled]);
  return <ErrorText error={error} />;
}
