import type { MicKind } from "./voice-preferences";

export type MicInput = { name: string; type: string; uid: string };
/** Classifies an audio-session input by its port type or name. */
export function micKind(input: Pick<MicInput, "name" | "type">): MicKind | undefined {
  const text = `${input.type} ${input.name}`.toLowerCase();
  if (/car/.test(text)) return "carplay";
  if (/bluetooth|hfp|airpods/.test(text)) return "bluetooth";
  if (/wired|headset|usb|headphone|line/.test(text)) return "wired";
  if (/built.?in|iphone|phone/.test(text)) return "builtin";
  return undefined;
}
/** First available input in the owner's order; undefined leaves the system default in charge. */
export function pickMicInput(order: readonly MicKind[], inputs: readonly MicInput[]): MicInput | undefined {
  for (const kind of order) { const found = inputs.find((input) => micKind(input) === kind); if (found) return found; }
  return undefined;
}

/** Android: prefers the owner's highest-priority attached input for the next capture; no match keeps the default. */
export function applyAndroidMicPriority(order: readonly MicKind[], native: { listInputs?(): MicInput[]; setPreferredInput?(uid: string | null): void }): MicInput | undefined {
  try {
    if (!native.listInputs || !native.setPreferredInput) return undefined;
    const pick = pickMicInput(order, native.listInputs());
    native.setPreferredInput(pick?.uid ?? null);
    return pick;
  } catch { return undefined; }
}

export type MicRecorder = { prepareToRecordAsync(): Promise<void>; getAvailableInputs(): MicInput[]; setInput(uid: string): void; release(): void };
/**
 * Applies the owner's order through the audio session's preferred input (iOS). A prepared
 * recorder is the only expo-audio handle that lists and selects inputs; it is released at once.
 * Best effort: any failure leaves the system default.
 */
export async function applyMicPriority(order: readonly MicKind[], createRecorder: () => MicRecorder): Promise<MicInput | undefined> {
  let recorder: MicRecorder | undefined;
  try {
    recorder = createRecorder();
    await recorder.prepareToRecordAsync();
    const pick = pickMicInput(order, recorder.getAvailableInputs());
    if (pick) recorder.setInput(pick.uid);
    return pick;
  } catch { return undefined; }
  finally { try { recorder?.release(); } catch { /* shortcut: a failed release only delays cleanup */ } }
}
