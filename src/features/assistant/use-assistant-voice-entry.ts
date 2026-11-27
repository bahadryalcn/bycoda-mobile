import { useEffect, useRef, useState } from "react";
import { cancelAssistantVoice, openAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";
import { startAssistantCall } from "./assistant-call-session";
import { useAssistantCall } from "./assistant-call-state";
import type { AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";

/** A route command is consumed once, then waits for the existing scope/read guards. No automatic retry. */
export function useAssistantVoiceEntry({ requested, consume, ready, blocked = false, machineId, environmentId, thread, open, current }: {
  requested: boolean; consume(): void; ready: boolean;
  /** The call cannot become ready (assistant off, no access, computer needs an update): stop waiting so the screen can say why. */
  blocked?: boolean;
  machineId: string; environmentId: string;
  thread: AssistantThread | null; open(): Promise<AssistantThread | undefined>; current(): boolean;
}) {
  const [pending, setPending] = useState(requested);
  const [opening, setOpening] = useState(false);
  const consumed = useRef(false), openingRequest = useRef(false), mounted = useRef(true);
  // A removed route must not start capture after a pending conversation read resolves.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const start = () => {
    useAssistantCompanion.setState({ surface: "voice" });
    setPending(true);
  };
  // voice=1 is an explicit owner command; clearing it permits another long press on this route.
  useEffect(() => {
    if (!requested) { consumed.current = false; return; }
    if (consumed.current) return;
    consumed.current = true;
    start(); consume();
  }, [requested, consume]);
  // A request that can never become ready is dropped instead of showing "Connecting…" forever.
  useEffect(() => {
    if (pending && blocked) setPending(false);
  }, [pending, blocked]);
  // Use the normal open/start paths only after snapshot, project and connection validation.
  useEffect(() => {
    if (!pending || !ready || !current() || opening || openingRequest.current) return;
    const call = useAssistantCall.getState();
    if (call.phase !== "idle") { setPending(false); return; }
    if (!thread) {
      openingRequest.current = true; setOpening(true);
      void open().then(opened => {
        if (mounted.current && !opened) setPending(false);
      }).catch(() => { if (mounted.current) setPending(false); }).finally(() => {
        openingRequest.current = false;
        if (mounted.current) setOpening(false);
      });
      return;
    }
    setPending(false);
    cancelAssistantVoice();
    openAssistantCompanion(machineId, environmentId);
    useAssistantCompanion.setState({ thread, projectId: thread.projectId ?? "", surface: "voice" });
    void startAssistantCall({ machineId, environmentId, threadId: thread.id }, () => mounted.current && current()).catch(error => useAssistantCall.setState({ error }));
  }, [pending, ready, machineId, environmentId, thread, open, current, opening]);
  return { pending, start, cancel: () => setPending(false) };
}
