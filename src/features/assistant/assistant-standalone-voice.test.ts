import { afterEach, expect, it, vi } from "vitest";
const audio = vi.hoisted(() => ({ record: vi.fn(async () => {}), speak: vi.fn(async () => {}), cancel: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
vi.mock("./assistant-voice", () => ({ AssistantVoice: class { record = audio.record; speak = audio.speak; cancel = audio.cancel; } }));
vi.mock("./assistant-voice-native", () => ({ nativeVoiceDependencies: (value: unknown) => value }));
import { bindAssistantVoicePort, closeAssistantCompanion, recordAssistantVoice, speakAssistantReply, useAssistantCompanion } from "./assistant-companion-state";
import { useAssistantCall } from "./assistant-call-state";
const target = { machineId: "host", environmentId: "env", threadId: "room" };
afterEach(() => { closeAssistantCompanion(); useAssistantCall.setState({ phase: "idle" }); vi.clearAllMocks(); });
it.each(["dictation", "read aloud"])("rejects a stale %s callback after a continuous call acquired audio", async kind => {
  const release = bindAssistantVoicePort({ machineId: "host", environmentId: "env", port: { current: () => true, request: async <T,>() => ({} as T) } });
  useAssistantCall.setState({ phase: "listening" });
  try {
    if (kind === "dictation") await recordAssistantVoice(target, () => true);
    else await speakAssistantReply(target, "hello", () => true);
    expect(audio.record).not.toHaveBeenCalled(); expect(audio.speak).not.toHaveBeenCalled();
    expect((useAssistantCompanion.getState().error as Error).message).toContain("voice call");
  } finally { release(); }
});
