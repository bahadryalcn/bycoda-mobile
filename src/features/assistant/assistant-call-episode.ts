import { create } from "zustand";
import type { AssistantMessage } from "../../../../src/shared/model/host-contracts/assistant";
import { useAssistantCall } from "./assistant-call-state";

/**
 * One voice call as the owner sees it: from the tap that starts it until it ends or fails. A dropped line
 * that reopens on its own stays the same call. The conversation itself persists per scope; the episode
 * only marks where in it this call began, and holds the call screen's own view state, which starts
 * closed for every call instead of being remembered on the device.
 */
export type AssistantCallEpisode = {
  id: number;
  threadId?: string;
  /** Phone clock; shown only while the call has no message of its own yet. */
  startedAt: number;
  /**
   * The newest message time (Host clock) the conversation held when the call began, so the call's
   * messages are the later ones without comparing two clocks. `null`: the conversation was empty.
   * `undefined`: not read yet.
   */
  baseline?: number | null;
  open: boolean;
  /** The call screen's transcript (header chat button). */
  transcript: boolean;
  /** The call screen's text composer ("Write" in the dock). */
  composer: boolean;
  /** The call screen shows the conversation's messages from before this call. */
  earlier: boolean;
  /** The owner's last words in this call; kept after a failure clears the call state. */
  lastUtterance?: string;
};

type CallSnapshot = { phase: string; reconnecting?: number; threadId?: string; utterance?: string };

/** Earlier calls of this app run are kept so the chat can mark exactly where each began. */
const KEPT_EPISODES = 20;

/** The episode list after a call state change; unchanged input returns the same array. */
export function nextCallEpisodes(episodes: AssistantCallEpisode[], call: CallSnapshot, now: number): AssistantCallEpisode[] {
  const engaged = call.phase !== "idle" || call.reconnecting !== undefined;
  const last = episodes.at(-1);
  if (engaged && !last?.open) {
    const episode: AssistantCallEpisode = { id: (last?.id ?? 0) + 1, threadId: call.threadId, startedAt: now, open: true, transcript: false, composer: false, earlier: false,
      ...(call.utterance?.trim() ? { lastUtterance: call.utterance } : {}) };
    return [...episodes.slice(-(KEPT_EPISODES - 1)), episode];
  }
  if (!last) return episodes;
  const patch: Partial<AssistantCallEpisode> = {};
  if (!engaged && last.open) Object.assign(patch, { open: false, composer: false });
  if (engaged && !last.threadId && call.threadId) patch.threadId = call.threadId;
  if (last.open && call.utterance?.trim() && call.utterance !== last.lastUtterance) patch.lastUtterance = call.utterance;
  return Object.keys(patch).length ? [...episodes.slice(0, -1), { ...last, ...patch }] : episodes;
}

export const useAssistantCallEpisodes = create<{ episodes: AssistantCallEpisode[] }>(() => ({ episodes: [] }));

const follow = (state: ReturnType<typeof useAssistantCall.getState>) => {
  const { episodes } = useAssistantCallEpisodes.getState();
  const next = nextCallEpisodes(episodes, { phase: state.phase, reconnecting: state.reconnecting, threadId: state.target?.threadId, utterance: state.utterance }, Date.now());
  if (next !== episodes) useAssistantCallEpisodes.setState({ episodes: next });
};
follow(useAssistantCall.getState());
useAssistantCall.subscribe(follow);

/** The latest call, which the call screen shows. */
export const useAssistantCallEpisode = () => useAssistantCallEpisodes(state => state.episodes.at(-1));

export function updateAssistantCallEpisode(id: number, patch: Partial<Pick<AssistantCallEpisode, "transcript" | "composer" | "earlier" | "baseline">>) {
  useAssistantCallEpisodes.setState(({ episodes }) => ({
    episodes: episodes.map(episode => episode.id === id ? { ...episode, ...patch } : episode),
  }));
}

/** The newest message time a conversation holds, as a call baseline. */
export const assistantCallBaseline = (messages: readonly Pick<AssistantMessage, "createdAt">[]): number | null =>
  messages.length ? Math.max(...messages.map(message => message.createdAt)) : null;

/** Index of the first message of a call, `messages.length` when it has none yet, `undefined` before its baseline is read. */
export function assistantCallStart(messages: readonly Pick<AssistantMessage, "createdAt">[], baseline: number | null | undefined): number | undefined {
  if (baseline === undefined) return undefined;
  if (baseline === null) return 0;
  const index = messages.findIndex(message => message.createdAt > baseline);
  return index < 0 ? messages.length : index;
}

/**
 * Calls before this app run are recognized from the messages: a call's words and replies are marked as
 * spoken, and its turns follow each other within minutes (a silent call sleeps after three). A spoken
 * message from the owner after a longer quiet begins another call.
 */
export const CALL_GAP_MS = 5 * 60_000;

export type AssistantTranscriptRow<M extends AssistantMessage = AssistantMessage> =
  | { kind: "message"; id: string; message: M }
  | { kind: "call"; id: string; at: number };

/**
 * The conversation with a separator where each call began: exactly for calls this phone made (from their
 * baselines), inferred for older ones. `trailing` adds the separator of a call that has said nothing yet.
 */
export function assistantTranscriptRows<M extends AssistantMessage>(messages: readonly M[], calls: readonly Pick<AssistantCallEpisode, "baseline">[] = [], options: { trailing?: number } = {}): AssistantTranscriptRow<M>[] {
  const known = new Set<number>();
  for (const call of calls) {
    const start = assistantCallStart(messages, call.baseline);
    if (start !== undefined && start < messages.length) known.add(start);
  }
  const rows: AssistantTranscriptRow<M>[] = [];
  let lastVoice: number | undefined;
  messages.forEach((message, index) => {
    const inferred = message.via === "voice" && message.role === "user" &&
      (lastVoice === undefined || message.createdAt - lastVoice > CALL_GAP_MS);
    if (known.has(index) || inferred) rows.push({ kind: "call", id: `call:${message.id}`, at: message.createdAt });
    // A call begun by typing still anchors its spoken turns, so they do not mark a second start.
    if (message.via === "voice" || known.has(index)) lastVoice = message.createdAt;
    rows.push({ kind: "message", id: message.id, message });
  });
  if (options.trailing !== undefined) rows.push({ kind: "call", id: "call:current", at: options.trailing });
  return rows;
}
