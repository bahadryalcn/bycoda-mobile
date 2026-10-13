import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { base64ToBytes } from "@/features/workspace/attachment-model";
import { MAX_MEDIA_BYTES, mediaMime, resolveMediaPath, type MessageContext } from "./media-policy";

export type LoadedMedia = { uri: string; name: string; mimeType: string };
function destination(context: MessageContext, name: string) {
  const directory = new Directory(Paths.cache, "chat-media", encodeURIComponent(context.machineId));
  directory.create({ idempotent: true, intermediates: true });
  const previous = directory.list().filter((item): item is File => item instanceof File).sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
  let bytes = previous.reduce((total, file) => total + file.size, 0);
  while (previous.length > 24 || bytes > 48 * 1024 * 1024) { const oldest = previous.shift(); if (!oldest) break; bytes -= oldest.size; oldest.delete(); }
  // Cache files are private, random, and never interpreted as a path from the host.
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? "bin";
  return new File(directory, `${randomUUID()}.${extension}`);
}
export function clearMediaCache() {
  const directory = new Directory(Paths.cache, "chat-media");
  if (directory.exists) directory.delete();
}
export async function loadSessionMedia(context: MessageContext, id: string, name: string, mimeType: string, signal?: AbortSignal): Promise<LoadedMedia> {
  if (!context.sessionId) throw new Error("This file has no session.");
  const file = destination(context, name);
  file.create();
  const handle = file.open();
  try {
    let offset = 0;
    let size: number | undefined;
    do {
      const chunk = await context.client.request<{ data: string; offset: number; size: number }>("attachments.read", { sessionId: context.sessionId, id, offset }, { signal });
      if (!Number.isSafeInteger(chunk.size) || chunk.size < 0 || chunk.size > MAX_MEDIA_BYTES || (size !== undefined && size !== chunk.size) || chunk.data.length > 710_000) throw new Error("Invalid attachment response.");
      const bytes = base64ToBytes(chunk.data);
      if (chunk.offset !== offset + bytes.length || chunk.offset > chunk.size || (!bytes.length && offset < chunk.size)) throw new Error("Incomplete attachment response.");
      handle.writeBytes(bytes);
      offset = chunk.offset;
      size = chunk.size;
    } while (offset < size!);
    return { uri: file.uri, name, mimeType };
  } catch (error) { handle.close(); if (file.exists) file.delete(); throw error; }
  finally { try { handle.close(); } catch {} }
}
export async function loadProjectMedia(context: MessageContext, rawPath: string, signal?: AbortSignal): Promise<LoadedMedia> {
  const path = resolveMediaPath(context, rawPath);
  if (!path) throw new Error("This file is outside the selected project.");
  const name = path.split("/").pop() || "file";
  const encoded = await context.client.request<string>("workspace.run", { command: "read_binary_file", args: { path } }, { signal });
  if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4) throw new Error("File exceeds the preview limit.");
  const file = destination(context, name);
  file.create();
  file.write(base64ToBytes(encoded));
  return { uri: file.uri, name, mimeType: mediaMime(name) };
}
