import { File } from "expo-file-system";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import type { HostTransport } from "@/remote/transport";
import { bytesToBase64, validateAttachment, type StagedAttachment } from "./attachment-model";
import { isScopedStagedFile } from "./attachment-files";

export async function uploadAttachment(client: HostTransport, file: StagedAttachment, sessionId: string, signal: AbortSignal, progress: (value: number) => void) {
  validateAttachment(file);
  if (!isScopedStagedFile(file, `${client.machine.id}:${sessionId}`)) throw new Error("This attachment belongs to another conversation. Choose it again.");
  const local = new File(file.uri);
  if (!local.exists || local.size !== file.size) throw new Error("The selected file is no longer available. Remove it and choose it again.");
  const status = await client.request<{ offset: number; hash?: string }>("attachments.status", { id: file.id, size: file.size }, { signal });
  if (!Number.isSafeInteger(status.offset) || status.offset < 0 || status.offset > file.size) throw new Error("Invalid upload acknowledgement.");
  const handle = local.open();
  try {
    if (status.offset) {
      const prefix = handle.readBytes(status.offset);
      const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, prefix)), (value) => value.toString(16).padStart(2, "0")).join("");
      if (hash !== status.hash) throw new Error("The computer has different attachment data. Remove it and choose it again.");
    }
    let offset = status.offset;
    do {
      if (signal.aborted) throw new Error("Upload cancelled.");
      handle.offset = offset;
      const bytes = handle.readBytes(Math.min(192 * 1024, file.size - offset));
      const expected = offset + bytes.length;
      if (expected === offset && offset < file.size) throw new Error("The selected file is incomplete.");
      const acknowledgement = await client.request<{ offset: number }>("attachments.upload", { id: file.id, size: file.size, offset, data: bytesToBase64(bytes) }, { signal });
      if (acknowledgement.offset !== expected) throw new Error("Invalid upload acknowledgement.");
      offset = expected;
      progress(file.size ? offset / file.size : 1);
    } while (offset < file.size);
  } finally { handle.close(); }
  const { uri: _uri, ...reference } = file;
  return reference;
}
