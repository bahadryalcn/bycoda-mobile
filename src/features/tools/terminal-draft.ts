export type TerminalDraft = { commands: Record<string, string>; uncertain: boolean };
export const emptyTerminalDraft = (): TerminalDraft => ({ commands: {}, uncertain: false });
/** A complete connection identity fences repaired/repaired-again routes from old commands. */
export function terminalDraftKey(identity: readonly unknown[]) {
  return `bycoda.mobile.draft.v1:terminal:${JSON.stringify(identity)}`;
}
export function decodeTerminalDraft(raw: string): TerminalDraft {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("commands" in value) || !("uncertain" in value) ||
      typeof value.uncertain !== "boolean" || !value.commands || typeof value.commands !== "object" ||
      Array.isArray(value.commands) || Object.values(value.commands).some(command => typeof command !== "string"))
    throw new Error("Invalid saved terminal draft.");
  return value as TerminalDraft;
}
export function encodeTerminalDraft(value: TerminalDraft | null): string | null {
  return value && (value.uncertain || Object.values(value.commands).some(command => command.length)) ? JSON.stringify(value) : null;
}
