import type { MicKind } from "./voice-preferences";

export type MicInput = { name: string; type: string; uid: string };
/** Classifies an audio-session input by its port type or name. */
export function micKind(input: Pick<MicInput, "name" | "type">): MicKind | undefined {
  if (input.type === "builtin" || input.type === "wired" || input.type === "bluetooth" || input.type === "carplay")
    return input.type;
  if (input.type === "other") return undefined;
  const text = `${input.type} ${input.name}`.toLowerCase();
  if (/car/.test(text)) return "carplay";
  if (/bluetooth|hfp|airpods/.test(text)) return "bluetooth";
  if (/wired|headset|usb|headphone|line/.test(text)) return "wired";
  if (/built.?in|iphone|phone/.test(text)) return "builtin";
  return undefined;
}

/** The native inventory can contain several ports of one kind; capture prioritizes kinds. */
export function connectedMicKinds(order: readonly MicKind[], inputs: readonly MicInput[]) {
  const connected = new Set(inputs.map(micKind));
  return order.filter((kind) => connected.has(kind));
}

/** Reorder the connected slots without changing saved priorities for unplugged inputs. */
export function reorderConnectedMics(order: MicKind[], visible: readonly MicKind[], kind: MicKind, to: number): MicKind[] {
  const from = visible.indexOf(kind);
  if (from < 0 || to < 0 || to >= visible.length || from === to) return order;
  const reordered = [...visible];
  reordered.splice(from, 1);
  reordered.splice(to, 0, kind);
  return order.map((item) => visible.includes(item) ? reordered.shift()! : item);
}

export function readMicInputs(native: { listInputs?(): MicInput[] } | null) {
  try { return native?.listInputs?.() ?? []; }
  catch { return []; }
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
