import type { CredentialBinding, HostSocketNative } from "../../modules/bycoda-host-socket/src/types";
import { MobileHostWsConnection, HostWsError, type HostWsRequestOptions } from "../remote/ws-connection";

export type AssistantVoiceScope = { sessionId: string; threadId: string; projectId?: string };
const voiceMethods = new Set(["environment.describe", "voice.local.start", "voice.local.transcribe", "voice.cloud.transcribe", "voice.local.release", "voice.local.speak", "voice.local.speechNext", "voice.local.keepAlive"]);
/** Background authority is one native microphone session and one reviewed Room thread. */
export function allowsVoiceRequest(scope: AssistantVoiceScope, method: string, params: Record<string, unknown>) {
  if (voiceMethods.has(method)) return true;
  if (method === "projects.directory") return Object.keys(params).length === 0;
  if (method !== "assistant.request") return false;
  if (params.op === "threads.sendIdentity") return !Object.hasOwn(params, "threadId");
  return ["threads.send", "threads.sendStatus", "threads.messages"].includes(String(params.op)) && params.threadId === scope.threadId;
}

export async function openScopedVoiceConnection(native: HostSocketNative, binding: CredentialBinding, scope: AssistantVoiceScope, current: () => boolean) {
  binding = { ...binding, ...(binding.tls ? { tls: { ...binding.tls } } : {}) };
  scope = { ...scope };
  let released = false;
  const isCurrent = () => !released && current();
  const assertCurrent = () => { if (!isCurrent()) throw new HostWsError("cancelled"); };
  assertCurrent();
  if (!native.acquireVoiceCredential || !native.openVoice) throw new HostWsError("unsupported");
  const credential = await native.acquireVoiceCredential(binding, scope.sessionId, scope.threadId, scope.projectId ?? null);
  assertCurrent();
  // Reuse the normal validated protocol/receipt owner, with a separate native socket authority.
  const channel = {
    open: (handle: string, id: string, generation: number) => native.openVoice!(handle, id, generation, scope.sessionId),
    send: native.send.bind(native), close: native.close.bind(native),
    acknowledge: native.acknowledge.bind(native), addListener: native.addListener.bind(native),
    readBulk: async () => { throw new HostWsError("unsupported"); },
  };
  const connection = new MobileHostWsConnection(channel, binding, credential, 1, `voice-${scope.sessionId}`, undefined, undefined, assertCurrent);
  try {
    await connection.start(); assertCurrent();
    // A Host from before phone voice does not route these methods; say so instead of failing the
    // first voice request as incompatible data.
    // The spoken message itself goes over this socket too (it has no HTTP fallback); a Host that
    // does not route it there would otherwise stop every call at the reply as incompatible data.
    if (!connection.supports("voice.local.start") || !connection.supports("voice.cloud.transcribe") || !connection.supports("assistant.request"))
      throw new HostWsError("unsupported");
  } catch (error) { connection.close(); throw error; }
  return {
    current: isCurrent,
    request<T>(method: string, params: Record<string, unknown> = {}, options: HostWsRequestOptions = {}) {
      assertCurrent();
      if (!allowsVoiceRequest(scope, method, params)) throw new HostWsError("unsupported");
      return connection.request<T>(method, params, options);
    },
    release: () => { if (!released) { released = true; connection.close(); } },
  };
}
