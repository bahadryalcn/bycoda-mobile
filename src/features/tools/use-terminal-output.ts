import { useEffect, useRef, useState } from "react";
import { useSecurity } from "@/state/security";
import type { HostTransport } from "@/remote/transport";
import { createTerminalApi } from "@/remote/services/terminal-api";
import { appendTerminalOutput, emptyTerminalOutput, type TerminalOutput } from "./terminal-model";

type Scope = { client: HostTransport; projectId: string; id: string; active: boolean };
type ReadState = { scope: Scope; data?: TerminalOutput; error?: Error; isFetching: boolean; isPending: boolean };

/** Cursor reads are serialized and cancelled when computer, project or terminal changes. */
export function useTerminalOutput(client: HostTransport | null, projectId: string, id: string, polling: boolean, focused = true) {
  const available = useSecurity((s) => s.status === "unlocked" && s.appState === "active" && s.windowFocused);
  const active = focused && available;
  const [state, setState] = useState<ReadState>();
  const readRef = useRef<() => Promise<void>>(async () => {});
  const pollingRef = useRef(polling);
  pollingRef.current = polling;
  useEffect(() => {
    if (!client || !id || !active) return;
    const scope: Scope = { client, projectId, id, active: true };
    const api = createTerminalApi((...args) => client.request(...args));
    const controller = new AbortController();
    let output = emptyTerminalOutput();
    let fetching = false;
    let more: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (!scope.active || fetching) return;
      fetching = true;
      setState((previous) => ({ scope, data: previous?.scope === scope ? previous.data : undefined, isFetching: true, isPending: !output.terminal }));
      try {
        const result = await api.terminalRead(projectId, id, output.cursor, { signal: controller.signal });
        if (!scope.active) return;
        output = appendTerminalOutput(output, result, projectId, id);
        setState({ scope, data: output, isFetching: false, isPending: false });
        if (result.hasMore && pollingRef.current) more = setTimeout(() => { void read(); }, 100);
      } catch (error) {
        if (!scope.active) return;
        const denied = ["auth", "identity"].includes((error as { kind?: string })?.kind ?? "");
        if (denied) output = emptyTerminalOutput();
        setState({ scope, data: output.terminal ? output : undefined, error: error instanceof Error ? error : new Error(String(error)), isFetching: false, isPending: false });
      } finally { fetching = false; }
    };
    readRef.current = read;
    void read();
    const timer = setInterval(() => { if (pollingRef.current) void read(); }, 1500);
    return () => {
      scope.active = false;
      controller.abort();
      clearInterval(timer);
      clearTimeout(more);
      if (readRef.current === read) readRef.current = async () => {};
    };
  }, [client, projectId, id, active]);
  const current = state?.scope.client === client && state.scope.projectId === projectId && state.scope.id === id ? state : undefined;
  return {
    data: current?.data, error: current?.error, isError: !!current?.error,
    isPending: !!id && (!current || current.isPending), isFetching: !!current?.isFetching,
    refetch: () => readRef.current(),
  };
}
