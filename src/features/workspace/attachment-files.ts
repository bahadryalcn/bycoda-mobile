import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { ATTACHMENT_COUNT, validateAttachment, type StagedAttachment } from "./attachment-model";

export async function pickAttachments(kind: "photo" | "document", scope: string): Promise<StagedAttachment[]> {
  const picked = kind === "photo"
    ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: ATTACHMENT_COUNT, quality: 1 })
    // Android's picker grants access to the content URI. Copy it directly into
    // our private draft directory; Expo Go's picker cache can be outside this
    // experience's readable FileSystem scope.
    : await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: Platform.OS !== "android" });
  if (picked.canceled) return [];
  const directory = new Directory(Paths.document, "chat-drafts", encodeURIComponent(scope));
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
}
export function removeStagedFile(file: StagedAttachment) {
  // Persisted URI is untrusted. Only our app-owned staging directory is removable.
  const root = new Directory(Paths.document, "chat-drafts").uri + "/";
  if (file.uri.startsWith(root) && !file.uri.includes("..")) { const local = new File(file.uri); if (local.exists) local.delete(); }
}
export function isScopedStagedFile(file: StagedAttachment, scope: string) {
  return file.uri === new File(Paths.document, "chat-drafts", encodeURIComponent(scope), file.id).uri;
}
export function clearAttachmentDraftFiles() {
  const directory = new Directory(Paths.document, "chat-drafts");
  if (directory.exists) directory.delete();
}
