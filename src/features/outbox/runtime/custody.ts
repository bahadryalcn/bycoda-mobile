import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HostTransport } from "@/remote/transport";
import { decodeComposerDraft } from "../../workspace/composer-draft";
import { composerDraftKey, attachmentReleases } from "../../workspace/attachment-ownership";
import { retainedAttachmentFiles } from "../../workspace/attachment-retention";
import { removeStagedFile } from "../../workspace/attachment-files";
import { sameOutboxDraft, type OutboxRow } from "../model/outbox";
import { sendOutbox } from "./store";

export async function cleanOutboxFiles(row: OutboxRow) {
  // Scanner includes outbox custody via the integration patch. Any unread source retains bytes.
  const retained = await retainedAttachmentFiles(AsyncStorage, row.machineId, row.sessionId, row.environmentId);
  for (const file of row.draft.attachments) if (!retained.some(value => value.id === file.id || value.uri === file.uri)) removeStagedFile(file);
}

/** Accepted tombstones bridge process death before the composer durably clears its draft. */
export async function finishOutbox(row: OutboxRow, client: HostTransport) {
  row.status = "delivered";
  await sendOutbox.update(row);
  const raw = await AsyncStorage.getItem(composerDraftKey(row.machineId, row.sessionId));
  if (!raw || !sameOutboxDraft(decodeComposerDraft(raw), row.draft)) {
    await sendOutbox.remove(row);
    await cleanOutboxFiles(row).catch(() => {});
    await attachmentReleases.flush(client).catch(() => {});
  }
}
