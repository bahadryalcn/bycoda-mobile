import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { base64ToBytes } from "@/features/workspace/attachment-model";
import { MAX_MEDIA_BYTES, mediaMime, resolveMediaPath, type MessageContext } from "./media-policy";

export type LoadedMedia = { uri: string; name: string; mimeType: string };
let cacheGeneration = 0;
function checkCache(generation: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Preview cancelled.");
  if (generation !== cacheGeneration) throw new Error("The media cache was cleared. Reopen the preview to load it again.");
}
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
  cacheGeneration++;
  const directory = new Directory(Paths.cache, "chat-media");
  if (directory.exists) directory.delete();
}
export async function loadSessionMedia(context: MessageContext, id: string, name: string, mimeType: string, signal?: AbortSignal): Promise<LoadedMedia> {
  const generation = cacheGeneration; checkCache(generation, signal);
  if (!context.sessionId) throw new Error("This file has no session.");
  const file = destination(context, name);
  file.create();
  const handle = file.open();
  try {
    let offset = 0;
    let size: number | undefined;
    do {
      const chunk = await context.client.request<{ data: string; offset: number; size: number }>("attachments.read", { sessionId: context.sessionId, id, offset }, { signal });
      checkCache(generation, signal);
      if (!Number.isSafeInteger(chunk.size) || chunk.size < 0 || chunk.size > MAX_MEDIA_BYTES || (size !== undefined && size !== chunk.size) || chunk.data.length > 710_000) throw new Error("Invalid attachment response.");
      const bytes = base64ToBytes(chunk.data);
      if (chunk.offset !== offset + bytes.length || chunk.offset > chunk.size || (!bytes.length && offset < chunk.size)) throw new Error("Incomplete attachment response.");
      handle.writeBytesSync(bytes);
      offset = chunk.offset;
      size = chunk.size;
    } while (offset < size!);
    return { uri: file.uri, name, mimeType };
  } catch (error) { handle.close(); if (file.exists) file.delete(); throw error; }
  finally { try { handle.close(); } catch {} }
}
export async function loadProjectMedia(context: MessageContext, rawPath: string, signal?: AbortSignal): Promise<LoadedMedia> {
  const generation = cacheGeneration; checkCache(generation, signal);
  const path = resolveMediaPath(context, rawPath);
  if (!path) throw new Error("This file is outside the selected project.");
  const name = path.split("/").pop() || "file";
  const info = await context.client.request<{ size: number; version: string }>("workspace.run", { command: "read_file_info", args: { path } }, { signal });
  checkCache(generation, signal);
  if (!Number.isSafeInteger(info?.size) || info.size < 0 || info.size > MAX_MEDIA_BYTES || typeof info.version !== "string" || !info.version || info.version.length > 256) throw new Error("File exceeds the preview limit.");
  const file = destination(context, name);
  file.create();
  const handle = file.open();
  try {
    let offset = 0;
    while (offset < info.size) {
      checkCache(generation, signal);
      const length = Math.min(256 * 1024, info.size - offset);
      const chunk = await context.client.request<{ data: string; offset: number; length: number }>("workspace.run", {
        command: "read_file_chunk", args: { path, version: info.version, offset, length },
      }, { signal });
      checkCache(generation, signal);
      if (!chunk || typeof chunk.data !== "string" || chunk.data.length > Math.ceil(length / 3) * 4 || chunk.offset !== offset || !Number.isSafeInteger(chunk.length) || chunk.length < 1 || chunk.length > length) throw new Error("Invalid file chunk.");
      const bytes = base64ToBytes(chunk.data);
      if (bytes.length !== chunk.length) throw new Error("Incomplete file chunk.");
      handle.writeBytesSync(bytes);
      offset += bytes.length;
    }
    const final = await context.client.request<{ size: number; version: string }>("workspace.run", { command: "read_file_info", args: { path } }, { signal });
    checkCache(generation, signal);
    if (signal?.aborted || final?.size !== info.size || final.version !== info.version) throw new Error("The file changed while downloading. Try again.");
    return { uri: file.uri, name, mimeType: mediaMime(name) };
  } catch (error) { handle.close(); if (file.exists) file.delete(); throw error; }
  finally { try { handle.close(); } catch {} }
}
