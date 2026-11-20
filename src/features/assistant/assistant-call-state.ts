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
}>(() => ({ phase: "idle", muted: false, speakerMuted: false, level: 0, replyVersion: 0 }));
