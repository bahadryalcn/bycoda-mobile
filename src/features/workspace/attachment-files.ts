import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDraftStorageOwner } from "@/state/local-draft-storage";
import { ATTACHMENT_COUNT, base64ToBytes, validateAttachment, type StagedAttachment } from "./attachment-model";
import { readBrowserCapture, type BrowserCaptureScope } from "../tools/browser-annotation-model";
import { parseBrowserAnnotation } from "../../../../src/shared/lib/browserAnnotation";

export async function pickAttachments(kind: "photo" | "document", scope: string, custody: "composer" | "question" = "composer"): Promise<StagedAttachment[]> {
  const owner = createDraftStorageOwner(AsyncStorage, custody === "question" ? `bycoda.mobile.question-attachments.v1:${scope}` : `bycoda.mobile.draft.v1:${scope}`);
  const picked = kind === "photo"
    ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: ATTACHMENT_COUNT, quality: 1 })
    // Android's picker grants access to the content URI. Copy it directly into
    // our private draft directory; Expo Go's picker cache can be outside this
    // experience's readable FileSystem scope.
    : await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: Platform.OS !== "android" });
  if (picked.canceled) return [];
  return owner.run(async () => {
  const directory = new Directory(Paths.document, custody === "question" ? "question-drafts" : "chat-drafts", encodeURIComponent(scope));
  directory.create({ idempotent: true, intermediates: true });
  const files: StagedAttachment[] = [];
  try {
    for (const asset of picked.assets.slice(0, ATTACHMENT_COUNT)) {
      const id = randomUUID();
      const source = new File(asset.uri);
      const name = ("name" in asset ? asset.name : asset.fileName) || source.name || "attachment";
      const mimeType = asset.mimeType ?? "application/octet-stream";
      const file: StagedAttachment = { id, name, mimeType, size: source.size, uri: new File(directory, id).uri, kind: mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "file" };
      validateAttachment(file);
      files.push(file);
      await source.copy(new File(file.uri));
    }
    return files;
  } catch (error) { for (const file of files) removeStagedFile(file); throw error; }
  });
}
export function removeStagedFile(file: StagedAttachment) {
  // Persisted URI is untrusted. Only our app-owned staging directory is removable.
  const roots = ["chat-drafts", "question-drafts"].map(folder => new Directory(Paths.document, folder).uri + "/");
  if (roots.some(root => file.uri.startsWith(root)) && !file.uri.includes("..")) { const local = new File(file.uri); if (local.exists) local.delete(); }
}
export function stageBrowserCapture(value: unknown, comment: string, scope: BrowserCaptureScope & { machineId: string }): StagedAttachment {
  return createDraftStorageOwner(AsyncStorage, `bycoda.mobile.draft.v1:${scope.machineId}:${scope.sessionId}`).runSync(() => {
  const capture = readBrowserCapture(value, scope);
  const { screenshot, ...metadata } = capture;
  const browserAnnotation = parseBrowserAnnotation({ ...metadata, comment });
  const bytes = base64ToBytes(screenshot.data);
  const id = randomUUID();
  const directory = new Directory(Paths.document, "chat-drafts", encodeURIComponent(`${scope.machineId}:${scope.sessionId}`));
  const file: StagedAttachment = { id, name: "browser-element.jpg", kind: "image", mimeType: "image/jpeg", size: bytes.length,
    uri: new File(directory, id).uri, browserAnnotation };
  validateAttachment(file);
  try { directory.create({ idempotent: true, intermediates: true }); const local = new File(file.uri); local.create(); local.writeSync(bytes); return file; }
  catch (error) { removeStagedFile(file); throw error; }
  });
}
export function isScopedStagedFile(file: StagedAttachment, scope: string, custody: "composer" | "question" = "composer") {
  return file.uri === new File(Paths.document, custody === "question" ? "question-drafts" : "chat-drafts", encodeURIComponent(scope), file.id).uri;
}
export function clearAttachmentDraftFiles(retainedScopes: readonly string[]) {
  const directory = new Directory(Paths.document, "chat-drafts");
  if (!directory.exists) return;
  const keep = new Set(retainedScopes.map(scope => new Directory(directory, encodeURIComponent(scope)).uri.replace(/\/+$/, "")));
  const entries = directory.list();
  const root = directory.uri.replace(/\/+$/, "") + "/";
  if (entries.some(entry => {
    const path = entry.uri.replace(/\/+$/, "");
    if (!path.startsWith(root)) return true;
    const child = path.slice(root.length);
    try { return !child || child.includes("/") || decodeURIComponent(child).split(/[\\/]/).some(part => part === "." || part === ".."); }
    catch { return true; }
  })) throw new Error("Invalid attachment draft directory entry.");
  for (const entry of entries) if (!keep.has(entry.uri.replace(/\/+$/, ""))) entry.delete();
}
/** Copies a local file (for example a cached image) into the draft staging folder as an attachment. */
export async function stageLocalFile(file: { uri: string; name: string; mimeType?: string }, scope: string): Promise<StagedAttachment> {
  const owner = createDraftStorageOwner(AsyncStorage, `bycoda.mobile.draft.v1:${scope}`);
  return owner.run(async () => {
    const shared = file.uri.startsWith("content:");
    if (!shared && !file.uri.startsWith("file:")) throw new Error("Only a downloaded file can be attached.");
    // Android share grants (content://) can expire with the sending app, so read them once into
    // our cache first; the cached copy is private and removed again below.
    const cached = shared ? new File(Paths.cache, `shared-${randomUUID()}`) : undefined;
    try {
      if (cached) await new File(file.uri).copy(cached);
      const directory = new Directory(Paths.document, "chat-drafts", encodeURIComponent(scope));
      directory.create({ idempotent: true, intermediates: true });
      const source = cached ?? new File(file.uri), id = randomUUID(), mimeType = file.mimeType ?? "application/octet-stream";
      const staged: StagedAttachment = { id, name: file.name || source.name || "attachment", mimeType, size: source.size, uri: new File(directory, id).uri,
        kind: mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "file" };
      validateAttachment(staged);
      try { await source.copy(new File(staged.uri)); return staged; } catch (error) { removeStagedFile(staged); throw error; }
    } finally { if (cached?.exists) cached.delete(); }
  });
}
