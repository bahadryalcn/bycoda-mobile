import { expect, it } from "vitest";
import type { AssistantMessage } from "../../../../src/shared/model/host-contracts/assistant";
import {
  assistantCallBaseline,
  assistantCallStart,
  assistantTranscriptRows,
  CALL_GAP_MS,
  nextCallEpisodes,
  updateAssistantCallEpisode,
  useAssistantCallEpisodes,
} from "./assistant-call-episode";
import { useAssistantCall } from "./assistant-call-state";

const message = (id: string, createdAt: number, role: "user" | "assistant", via: "text" | "voice"): AssistantMessage =>
  ({ id, createdAt, updatedAt: createdAt, role, via, text: id, threadId: "thread-a", version: 1, jobIds: [] });
const minute = 60_000;

it("opens one episode per call, closed views first, and keeps it through a reconnect", () => {
  let episodes = nextCallEpisodes([], { phase: "starting", threadId: "thread-a" }, 100);
  expect(episodes).toEqual([{ id: 1, threadId: "thread-a", startedAt: 100, open: true, transcript: false, composer: false, earlier: false }]);
  expect(nextCallEpisodes(episodes, { phase: "listening", threadId: "thread-a" }, 200)).toBe(episodes);
  // A dropped line reopening on its own is the same call.
  episodes = [{ ...episodes[0], transcript: true, composer: true }];
  expect(nextCallEpisodes(episodes, { phase: "idle", reconnecting: 1, threadId: "thread-a" }, 300)).toBe(episodes);
  episodes = nextCallEpisodes(episodes, { phase: "sending", threadId: "thread-a", utterance: "Hello there" }, 400);
  expect(episodes[0].lastUtterance).toBe("Hello there");
  // A failure closes the call but keeps its words and its open transcript for the stopped screen.
  episodes = nextCallEpisodes(episodes, { phase: "idle", threadId: "thread-a" }, 500);
  expect(episodes[0]).toMatchObject({ open: false, transcript: true, composer: false, lastUtterance: "Hello there" });
  // The next call starts with both views closed again instead of inheriting the last choice.
  episodes = nextCallEpisodes(episodes, { phase: "starting", threadId: "thread-a" }, 600);
  expect(episodes).toHaveLength(2);
  expect(episodes[1]).toMatchObject({ id: 2, startedAt: 600, open: true, transcript: false, composer: false, earlier: false });
  expect(episodes[1].lastUtterance).toBeUndefined();
});

it("follows the shared call state and updates only the named episode", () => {
  useAssistantCallEpisodes.setState({ episodes: [] });
  useAssistantCall.setState({ phase: "starting", target: { machineId: "m", environmentId: "e", threadId: "thread-a" } });
  const [episode] = useAssistantCallEpisodes.getState().episodes;
  expect(episode).toMatchObject({ threadId: "thread-a", open: true });
  updateAssistantCallEpisode(episode.id, { transcript: true, baseline: 5 });
  expect(useAssistantCallEpisodes.getState().episodes[0]).toMatchObject({ transcript: true, baseline: 5 });
  useAssistantCall.setState({ phase: "idle", target: undefined });
  expect(useAssistantCallEpisodes.getState().episodes[0].open).toBe(false);
  useAssistantCallEpisodes.setState({ episodes: [] });
});

it("finds a call's first message from the conversation's newest message at its start", () => {
  const messages = [message("a", 10, "user", "text"), message("b", 20, "assistant", "text"), message("c", 30, "user", "voice")];
  expect(assistantCallBaseline([])).toBeNull();
  expect(assistantCallBaseline(messages.slice(0, 2))).toBe(20);
  expect(assistantCallStart(messages, 20)).toBe(2);
  expect(assistantCallStart(messages, null)).toBe(0);
  expect(assistantCallStart(messages, 30)).toBe(3);
  expect(assistantCallStart(messages, undefined)).toBeUndefined();
});

it("marks where each call began: exactly for this phone's calls, inferred for older ones", () => {
  const t = 1_000_000;
  const messages = [
    message("typed", t, "user", "text"), message("typed-reply", t + 1, "assistant", "text"),
    // An older call: spoken turns a few minutes apart, then a reply that took long to write.
    message("call1-1", t + 10 * minute, "user", "voice"), message("call1-r1", t + 14 * minute, "assistant", "voice"),
    message("call1-2", t + 16 * minute, "user", "voice"), message("call1-r2", t + 17 * minute, "assistant", "voice"),
    // A second call soon after the first is only separable because this phone knows when it began.
    message("call2-1", t + 19 * minute, "user", "voice"), message("call2-r1", t + 20 * minute, "assistant", "voice"),
    // A call from another device after a long quiet.
    message("call3-1", t + 20 * minute + CALL_GAP_MS + 1, "user", "voice"),
  ];
  const separators = (rows: ReturnType<typeof assistantTranscriptRows>) =>
    rows.flatMap((row, index) => row.kind === "call" ? [rows[index + 1]?.id ?? "end"] : []);
  expect(separators(assistantTranscriptRows(messages))).toEqual(["call1-1", "call3-1"]);
  expect(separators(assistantTranscriptRows(messages, [{ baseline: t + 17 * minute }]))).toEqual(["call1-1", "call2-1", "call3-1"]);
  expect(assistantTranscriptRows(messages, [{ baseline: t + 17 * minute }]).find(row => row.kind === "call" && row.id === "call:call2-1"))
    .toMatchObject({ at: t + 19 * minute });
  // A call that has not spoken yet is marked at the end, at the time the phone started it.
  const rows = assistantTranscriptRows(messages.slice(0, 2), [{ baseline: t + 1 }], { trailing: 42 });
  expect(rows.at(-1)).toEqual({ kind: "call", id: "call:current", at: 42 });
  expect(rows.filter(row => row.kind === "call")).toHaveLength(1);
});
