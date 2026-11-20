import { useEffect, useRef, useState } from "react";
import { useSecurity } from "@/state/security";
import type { HostTransport } from "@/remote/transport";
import { createTerminalApi } from "@/remote/services/terminal-api";
import { appendTerminalOutput, emptyTerminalOutput, sameTerminalOutput, terminalPollDelay, TERMINAL_POLL_MS, type TerminalOutput } from "./terminal-model";

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
    let failures = 0;
    let stopped = false;
    let hasMore = false;
    let shownError: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => { clearTimeout(timer); timer = setTimeout(tick, delay); };
    // A read in flight schedules the next poll when it settles, so a tick during a read simply yields.
    const tick = () => {
      if (!scope.active || stopped || fetching) return;
      if (pollingRef.current) void read(false); else schedule(TERMINAL_POLL_MS);
    };
    /** Manual reads show progress; background polls stay silent and skip unchanged buffers and repeated errors. */
    const read = async (manual: boolean) => {
      if (!scope.active || fetching) return;
      fetching = true;
      if (manual) setState((previous) => ({ scope, data: previous?.scope === scope ? previous.data : undefined, isFetching: true, isPending: !output.terminal }));
      try {
        const result = await api.terminalRead(projectId, id, output.cursor, { signal: controller.signal });
        if (!scope.active) return;
        const next = appendTerminalOutput(output, result, projectId, id);
        failures = 0;
        stopped = false;
        hasMore = next.hasMore && pollingRef.current;
        if (manual || shownError !== undefined || !sameTerminalOutput(output, next)) {
          shownError = undefined;
          setState({ scope, data: next, isFetching: false, isPending: false });
        }
        output = next;
      } catch (error) {
        if (!scope.active) return;
        failures += 1;
        hasMore = false;
        const denied = ["auth", "identity"].includes((error as { kind?: string })?.kind ?? "");
        if (denied) { output = emptyTerminalOutput(); stopped = true; }
        const failure = error instanceof Error ? error : new Error(String(error));
        if (manual || denied || shownError !== failure.message) {
          shownError = failure.message;
          setState({ scope, data: output.terminal ? output : undefined, error: failure, isFetching: false, isPending: false });
        }
      } finally {
        fetching = false;
        if (scope.active && !stopped) schedule(terminalPollDelay(failures, hasMore));
      }
    };
    const refetch = () => read(true);
    readRef.current = refetch;
    void read(true);
    return () => {
      scope.active = false;
      controller.abort();
      clearTimeout(timer);
      if (readRef.current === refetch) readRef.current = async () => {};
    };
  }, [client, projectId, id, active]);
  const current = state?.scope.client === client && state.scope.projectId === projectId && state.scope.id === id ? state : undefined;
  return {
    data: current?.data, error: current?.error, isError: !!current?.error,
    isPending: !!id && (!current || current.isPending), isFetching: !!current?.isFetching,
    refetch: () => readRef.current(),
  };
}
