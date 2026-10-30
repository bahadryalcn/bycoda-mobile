import { useEffect, useRef, useState, type RefObject } from "react";
import { useCopy } from "@/ui/copy";
import type { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { pickAttachments, removeStagedFile } from "./attachment-files";
import { ATTACHMENT_COUNT, type StagedAttachment, type TransferState } from "./attachment-model";
import { attachmentReleases, supportsAttachmentOwnership } from "./attachment-ownership";
import { uploadAttachment } from "./attachment-transfer";
import type { SessionScope } from "./session-types";
import type { useLocalDraft } from "./use-local-draft";

/**
 * Owns attachment staging, upload progress, retry and removal for one composer draft.
 * The send owner starts and ends a transfer through begin/end so upload, retry and send
 * stay single-flight.
 */
export function useComposerAttachments({
  scope,
  client,
  draft,
  submission,
  mounted,
  setLocalError,
}: {
  scope: SessionScope;
  client: ReturnType<typeof useHostClient>;
  draft: Pick<ReturnType<typeof useLocalDraft<ComposerDraft>>, "valueRef" | "setValue" | "persist">;
  submission: RefObject<boolean>;
  mounted: RefObject<boolean>;
  setLocalError: (error: unknown) => void;
}) {
  const copy = useCopy();
  const { valueRef, setValue, persist } = draft;
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transfers, setTransfers] = useState<Record<string, TransferState>>({});
  const transfer = useRef<AbortController | null>(null);
  const claimedFiles = useRef(new Map<string, StagedAttachment>());
  useEffect(() => () => transfer.current?.abort(), []);
  const begin = (controller: AbortController) => {
    transfer.current = controller;
    setUploading(true);
  };
  const end = () => {
    if (mounted.current) setUploading(false);
    transfer.current = null;
  };
  const choose = async (kind: "photo" | "document") => {
    setPicking(true);
    setLocalError(null);
    try {
      const files = await pickAttachments(kind, `${scope.machineId}:${scope.sessionId}`);
      if (!mounted.current) {
        files.forEach(removeStagedFile);
        return;
      }
      const current = valueRef.current ?? emptyComposerDraft();
      if (current.attachments.length + files.length > ATTACHMENT_COUNT) {
        files.forEach(removeStagedFile);
        throw new Error(
          copy("En fazla 20 dosya ekleyebilirsin.", "You can attach up to 20 files."),
        );
      }
      setValue({ ...current, attachments: [...current.attachments, ...files] });
    } catch (cause) {
      if (mounted.current) setLocalError(cause);
    } finally {
      if (mounted.current) setPicking(false);
    }
  };
  const upload = async (file: StagedAttachment, controller: AbortController) => {
    if (!client) throw new Error(copy("Bilgisayara bağlan.", "Connect to your computer."));
    const update = (state: TransferState) => {
      if (mounted.current) setTransfers((current) => ({ ...current, [file.id]: state }));
    };
    update({ status: "uploading", progress: 0 });
    try {
      let prepared = file;
      if (supportsAttachmentOwnership(client)) {
        await attachmentReleases.flush(client).catch(() => {});
        const claimId = await attachmentReleases.prepare(client, scope.sessionId, file);
        prepared = { ...file, claimId };
        if (
          !mounted.current ||
          !valueRef.current?.attachments.some((entry) => entry.id === file.id)
        )
          throw new Error("Attachment upload cancelled.");
        setValue((current) =>
          current
            ? {
                ...current,
                attachments: current.attachments.map((entry) =>
                  entry.id === file.id ? { ...entry, claimId } : entry,
                ),
              }
            : current,
        );
      }
      // Claim only after the private file reference and generation are durable.
      await persist();
      claimedFiles.current.set(file.id, prepared);
      const ref = await uploadAttachment(
        client,
        prepared,
        scope.sessionId,
        controller.signal,
        (progress) => update({ status: "uploading", progress }),
      );
      update({ status: "ready", progress: 1 });
      return ref;
    } catch (cause) {
      update({ status: "error", progress: 0, error: cause });
      throw cause;
    }
  };
  const retry = async (file: StagedAttachment) => {
    if (transfer.current || submission.current) return;
    const controller = new AbortController();
    begin(controller);
    setLocalError(null);
    try {
      await upload(file, controller);
    } catch {
      /* The attachment card owns upload failure and retry. */
    } finally {
      end();
    }
  };
  const remove = (file: StagedAttachment) => {
    void (async () => {
      const machine =
        client?.machine ??
        useMachines.getState().machines.find((entry) => entry.id === scope.machineId);
      const latest =
        valueRef.current?.attachments.find((entry) => entry.id === file.id) ??
        claimedFiles.current.get(file.id) ??
        file;
      if (machine) await attachmentReleases.stage({ machine }, scope.sessionId, [latest]);
      setValue((current) => ({
        ...(current ?? emptyComposerDraft()),
        attachments: (current?.attachments ?? []).filter((entry) => entry.id !== file.id),
      }));
      await persist();
      removeStagedFile(file);
      claimedFiles.current.delete(file.id);
      if (client) void attachmentReleases.flush(client).catch(() => {});
    })().catch((cause) => {
      if (mounted.current) setLocalError(cause);
    });
  };
  return {
    picking,
    uploading,
    transfers,
    /** The active transfer; non-null while an upload, retry or send owns the attachments. */
    transfer,
    claimedFiles,
    begin,
    end,
    cancel: () => transfer.current?.abort(),
    choose,
    upload,
    retry,
    remove,
  };
}
