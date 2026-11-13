import { isBinaryDocument } from "@/ui/media-policy";

/** Binary paths never enter the text editor or expected-content write flow. */
export function isMediaFile(path: string): boolean {
  return isBinaryDocument(path);
}

export function isFileConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { kind?: string }).kind && (error as { kind?: string }).kind !== "host")
    return false;
  return /(?:file.*(?:changed|conflict)|expected.*content|content.*(?:changed|mismatch)|dosya.*değiş)/i.test(
    error instanceof Error ? error.message : "",
  );
}
