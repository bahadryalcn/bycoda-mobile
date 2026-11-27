import { create } from "zustand";
import type { AssistantVoiceTarget } from "./assistant-voice";
import type { AssistantCallPhase } from "./assistant-call-loop";
export const useAssistantCall = create<{
  phase: AssistantCallPhase | "starting";
  target?: AssistantVoiceTarget;
  thread?: import("../../../../src/shared/model/host-contracts/assistant").AssistantThread;
  muted: boolean;
  /** Replies are written but not played; the call keeps listening. */
  speakerMuted: boolean;
  level: number;
  sessionId?: string;
  lastReply?: string;
  utterance?: string;
  replyVersion: number;
  error?: unknown;
  /** The microphone engine's own phase: the computer may still be loading its model while the call listens. */
  capture?: import("./assistant-voice").AssistantVoiceState;
  /** The chain step in flight; after a failure, the step that failed. */
  stage?: import("./assistant-voice-presentation").AssistantVoiceStage;
  /** The call went to sleep after the idle limit, as on the desktop: "Ready. Microphone is off." with Talk, not a failure. */
  asleep?: boolean;
  /** A dropped voice line is being reopened; the attempt number starts at 1. */
  reconnecting?: number;
  /**
   * The sent message's reply outlasted the wait; the call keeps waiting for it on the computer's receipt
   * ("Waiting for reply") instead of stopping. Cleared when the reply arrives or the call ends.
   */
  replyDelayed?: boolean;
  /**
   * A message typed during the call: "queued" waits for the reply in flight (or a capture ending), then
   * "sending" until the computer admits it. Cleared once nothing typed is waiting or the call ends.
   */
  typed?: "queued" | "sending";
  /**
   * A realtime call the computer relays: whether speaking over a reply interrupts it. False (no echo
   * cancellation here, or an older computer) means only a tap interrupts. Undefined for other calls.
   */
  spokenInterrupt?: boolean;
  /** A realtime call relayed by an older computer, which takes no typed turns: the call offers no Write. */
  typingUnavailable?: boolean;
}>(() => ({ phase: "idle", muted: false, speakerMuted: false, level: 0, replyVersion: 0 }));

/** Steps the microphone level is shown in; finer changes are invisible on the orb. */
export const CALL_LEVEL_STEPS = 20;
/** The level as the store keeps it: clamped and stepped, so silence and steady speech stop re-rendering. */
export function callLevel(level: number): number {
  return Number.isFinite(level) ? Math.round(Math.max(0, Math.min(1, level)) * CALL_LEVEL_STEPS) / CALL_LEVEL_STEPS : 0;
}
