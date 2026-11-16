import { create } from "zustand";
import type { AssistantVoiceTarget } from "./assistant-voice";
import type { AssistantCallPhase } from "./assistant-call-loop";
export const useAssistantCall = create<{
  phase: AssistantCallPhase | "starting";
  target?: AssistantVoiceTarget;
  thread?: import("../../../../src/shared/model/host-contracts/assistant").AssistantThread;
  muted: boolean;
  level: number;
  sessionId?: string;
  lastReply?: string;
  utterance?: string;
  replyVersion: number;
  error?: unknown;
}>(() => ({ phase: "idle", muted: false, level: 0, replyVersion: 0 }));
