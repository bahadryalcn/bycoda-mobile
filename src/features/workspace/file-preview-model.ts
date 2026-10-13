/** Binary paths never enter the text editor or expected-content write flow. */
export function isMediaFile(path: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|avif|heic|ico|bmp|svg|pdf|mp[34]|m4[av]|wav|ogg|flac|webm|mov|zip|gz|7z|exe|dll|woff2?|ttf|sqlite|db)$/i.test(
    path,
  );
}

export function isFileConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { kind?: string }).kind && (error as { kind?: string }).kind !== "host")
    return false;
  return /(?:file.*(?:changed|conflict)|expected.*content|content.*(?:changed|mismatch)|dosya.*değiş)/i.test(
    error instanceof Error ? error.message : "",
  );
}
