const PREFIX =
  /^\s*(?:codex|claude|cursor|grok|opencode|pi|omp|fx|hermes|antigravity|acp)\s*[·•|:\-–—]\s*/i;

/** Titles sometimes start with "codex · "; the provider icon already says that. */
export function sessionDisplayTitle(title: string | undefined, fallback: string): string {
  const raw = (title ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(PREFIX, "").trim() || fallback;
}
