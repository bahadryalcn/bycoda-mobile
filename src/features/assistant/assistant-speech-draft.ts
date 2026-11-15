import type { AssistantVoiceTarget } from "./assistant-voice";

export type PendingSpeech = { id: string; target: AssistantVoiceTarget; text: string };
export type AssistantDraft = { text: string; speechIds: string[] };
export const pendingSpeechKey = "bycoda.mobile.assistant-voice.v1:pending";
export function decodePendingSpeech(raw: string): PendingSpeech {
  const value = JSON.parse(raw) as PendingSpeech;
  if (!value || typeof value.id !== "string" || !value.id || value.id.length > 200 || !value.target ||
    ![value.target.machineId, value.target.environmentId, value.target.threadId].every(id => typeof id === "string" && !!id && id.length <= 200) ||
    typeof value.text !== "string" || !value.text || value.text.length > 16000) throw new Error("The saved speech draft could not be read.");
  return value;
}
export function decodeAssistantDraft(raw: string): AssistantDraft {
  if (raw.startsWith('{"bycodaAssistantDraft":1,')) {
    const value = JSON.parse(raw) as { text?: unknown; speechIds?: unknown };
    if (typeof value.text !== "string" || !Array.isArray(value.speechIds) || !value.speechIds.every(id => typeof id === "string" && id.length <= 200))
      throw new Error("The assistant draft could not be read.");
    return { text: value.text, speechIds: value.speechIds };
  }
  return { text: raw, speechIds: [] };
}
export const encodeAssistantDraft = (value: AssistantDraft | null) => value && (value.text || value.speechIds.length > 0)
  ? JSON.stringify({ bycodaAssistantDraft: 1, text: value.text, speechIds: value.speechIds }) : null;
export function mergePendingSpeech(draft: AssistantDraft | null, speech: PendingSpeech): AssistantDraft {
  if (draft?.speechIds.includes(speech.id)) return draft;
  const text = [draft?.text, speech.text].filter(Boolean).join("\n");
  if (text.length > 16000) throw new Error("The message is too long. Shorten the draft before adding speech.");
  return { text, speechIds: [...(draft?.speechIds ?? []), speech.id] };
}
