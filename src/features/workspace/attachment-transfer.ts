import { File } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { HostTransport } from "@/remote/transport";
import { bytesToBase64, validateAttachment, type StagedAttachment } from "./attachment-model";
import { attachmentOwnerId, attachmentReleases, supportsAttachmentOwnership } from "./attachment-ownership";
import { isScopedStagedFile } from "./attachment-files";

export async function uploadAttachment(client: HostTransport, file: StagedAttachment, sessionId: string, signal: AbortSignal, progress: (value: number) => void) {
  validateAttachment(file);
  if (!isScopedStagedFile(file, `${client.machine.id}:${sessionId}`)) throw new Error("This attachment belongs to another conversation. Choose it again.");
  const local = new File(file.uri);
  if (!local.exists || local.size !== file.size) throw new Error("The selected file is no longer available. Remove it and choose it again.");
  const ownerId = supportsAttachmentOwnership(client) ? attachmentOwnerId(sessionId) : undefined;
  if (ownerId && !file.claimId) throw new Error("Save the attachment claim before uploading.");
  if (ownerId) await attachmentReleases.claim(client, sessionId, [file.id], file.claimId!, { signal });
  const ownership = ownerId ? { ownerId, claimId: file.claimId } : {};
  const status = await client.request<{ offset: number; hash?: string }>("attachments.status", { id: file.id, size: file.size, ...ownership }, { signal });
  if (!Number.isSafeInteger(status.offset) || status.offset < 0 || status.offset > file.size) throw new Error("Invalid upload acknowledgement.");
  const handle = local.open();
  try {
    if (status.offset) {
      const digest = sha256.create();
      let remaining = status.offset;
      try {
        while (remaining > 0) {
          if (signal.aborted) throw new Error("Upload cancelled.");
          const bytes = handle.readBytes(Math.min(192 * 1024, remaining));
          if (!bytes.length) throw new Error("The selected file is incomplete.");
          digest.update(bytes);
          remaining -= bytes.length;
          // Give native lifecycle/cancellation and rendering a turn between bounded reads.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (signal.aborted) throw new Error("Upload cancelled.");
        const hash = bytesToHex(digest.digest());
        if (hash !== status.hash) throw new Error("The computer has different attachment data. Remove it and choose it again.");
      } finally { digest.destroy(); }
    }
    let offset = status.offset;
    do {
      if (signal.aborted) throw new Error("Upload cancelled.");
      handle.offset = offset;
      const bytes = handle.readBytes(Math.min(192 * 1024, file.size - offset));
      const expected = offset + bytes.length;
      if (expected === offset && offset < file.size) throw new Error("The selected file is incomplete.");
      const acknowledgement = await client.request<{ offset: number }>("attachments.upload", { id: file.id, size: file.size, offset, data: bytesToBase64(bytes), ...ownership }, { signal });
      if (acknowledgement.offset !== expected) throw new Error("Invalid upload acknowledgement.");
      offset = expected;
      progress(file.size ? offset / file.size : 1);
    } while (offset < file.size);
  } finally { handle.close(); }
  const { uri: _uri, claimId: _claimId, ...reference } = file;
  return reference;
}
