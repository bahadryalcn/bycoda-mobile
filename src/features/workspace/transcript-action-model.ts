/** The Host canonicalizes CR/CRLF note bodies; no other whitespace is rewritten. */
export function matchesTranscriptNote(value: unknown, id: string, text: string) {
  if (!value || typeof value !== "object" || !("id" in value) || !("body" in value)) return false;
  return value.id === id && typeof value.body === "string" && value.body.replace(/\r\n?/g, "\n") === text.replace(/\r\n?/g, "\n");
}
export function transcriptNoteTitle(text: string, fallback: string) {
  const first = text.split("\n").find(line => line.trim())?.replace(/^#+\s*/, "") || fallback;
  return Array.from(first).slice(0, 160).join("");
}
