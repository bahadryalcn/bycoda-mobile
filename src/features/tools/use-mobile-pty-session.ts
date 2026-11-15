import { createPtyTail } from "./mobile-pty-tail";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useSecurity } from "@/state/security";
import {
  reviewedMachine,
  isReviewedMachine,
  reviewedMachineIdentityDigest,
} from "@/state/reviewed-machine";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import type { TerminalViewportHandle } from "@/ui/terminal-viewport";
import type { TerminalPacket } from "@/ui/terminal-document";
import { useMobileTheme } from "@/ui/theme";
import type { SessionScope } from "../workspace/session-types";
import { PtyReadScheduler } from "./pty-read-scheduler";
import {
  readMobilePtyLease,
  readMobilePtyClosed,
  readMobilePtyList,
  readMobilePtyOutput,
  type MobilePtyLease,
  type MobilePtyTerminal,
  PTY_KEYS,
} from "./mobile-pty-model";

/**
 * Owns the interactive PTY protocol for one reviewed computer and session: the saved creation
 * receipt, lease, ordered input queue, output cursor and reader loop. The view only renders it.
 */
export function useMobilePtySession({
  scope,
  projectId,
}: {
  scope: SessionScope;
  projectId: string;
}) {
  const theme = useMobileTheme();
  const machine = useActiveMachine();
  const client = useHostClient();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const foreground = useSecurity((state) => state.appState === "active" && state.windowFocused);
  const security = { unlocked, active: foreground };
  const [opening] = useState(() => ({ ...scope, projectId, review: reviewedMachine(machine) }));
  const latest = useRef({ scope, projectId });
  latest.current = { scope, projectId };
  const current = () =>
    isReviewedMachine(opening.review, useMachines.getState()) &&
    latest.current.scope.machineId === opening.machineId &&
    latest.current.scope.sessionId === opening.sessionId &&
    latest.current.projectId === opening.projectId;
  const supported =
    current() &&
    !!opening.review?.environmentId &&
    !!machine?.capabilities?.includes("terminals.pty.desktop.v1");
  const available = supported && security.unlocked && security.active;
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const list = useHostQuery(
    ["mobile-pty", opening.projectId, opening.sessionId],
    "terminals.pty.desktop.list",
    params,
    {
      enabled: available,
      interval: 5000,
      queryFn: async (client, signal) =>
        readMobilePtyList(
          await client.request("terminals.pty.desktop.list", params, { signal }),
          opening.sessionId,
        ),
    },
  );
  const [lease, setLease] = useState<MobilePtyLease | null>(null);
  const [closePending, setClosePending] = useState(false);
  const closeAttempt = useRef<{ terminalId: string; epoch: string; requestId: string } | null>(null);
  const [paused, setPaused] = useState(true);
  const [synced, setSynced] = useState(false);
  const freshProtocol = useRef(false);
  const [lost, setLost] = useState(false);
  const [nonce, setNonce] = useState(randomUUID);
  const [ready, setReady] = useState(false);
  const readyDocument = useRef(false);
  const [gap, setGap] = useState(false);
  const viewport = useRef<TerminalViewportHandle>(null);
  const cursor = useRef(0);
  const tail = useRef(createPtyTail());
  const posted = useRef<{ next: number; dataBase64: string } | null>(null);
  const waiting = useRef<number | null>(null);
  const wakeReader = useRef<(() => void) | undefined>(undefined);
  const sequence = useRef(0);
  const generation = useRef(0);
  const inputQueue = useRef(Promise.resolve());
  const queued = useRef(0);
  const dimensions = useRef({ cols: 80, rows: 24 });
  const store = useMemo(
    () =>
      reviewedOperationStore(
        AsyncStorage,
        `bycoda.mobile.pty-create.v1:${JSON.stringify([opening.machineId, opening.review?.environmentId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const [createFailed, setCreateFailed] = useState(false);
  const [targetDigest, setTargetDigest] = useState("");
  const [targetMatches, setTargetMatches] = useState(false);
  const op = useReviewedOperation({
    source: store,
    canRun: () => available,
    // A failed action stops input and invalidates anything already queued.
    onFailure: () => {
      setPaused(true);
      generation.current++;
    },
    load: async ({ live, fail }) => {
      const digest = await reviewedMachineIdentityDigest(opening.review!, (text) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
      );
      const value = await store.load();
      if (!live()) return null;
      setTargetDigest(digest);
      const matches = !value || value.targetIdentityDigest === digest;
      setTargetMatches(matches);
      if (!matches)
        fail(
          new Error(
            "Saved PTY creation belongs to a different reviewed connection; no operation was sent",
          ),
        );
      return value;
    },
  });
  const { loaded: attempt, setLoaded: setAttempt, error, setError, busy, pendingAction, run } = op;
  const hydrated = !op.loading;
  const allowed = useRef(false);
  allowed.current = available && !list.isError && !paused && !gap && !lost && synced && !closePending;
  useEffect(
    () => () => {
      generation.current++;
      allowed.current = false;
    },
    [],
  );
  const request = async (method: string, fields: Record<string, unknown>) => {
    if (
      !client ||
      !available ||
      !current() ||
      useSecurity.getState().status !== "unlocked" ||
      useSecurity.getState().appState !== "active" ||
      !useSecurity.getState().windowFocused
    )
      throw new Error("Mobile PTY source is unavailable");
    const result = await client.request(method, { ...params, ...fields }, { retry: false });
    if (!current()) throw new Error("Mobile PTY source changed; never replay input");
    return result;
  };
  const fresh = () => {
    setSynced(false);
    readyDocument.current = false;
    cursor.current = 0;
    tail.current.clear();
    posted.current = null;
    waiting.current = null;
    setNonce(randomUUID());
    setReady(false);
    setLost(false);
    setGap(false);
  };
  const confirmed = async (result: unknown, requestId?: string) => {
    if (result && typeof result === "object" && "state" in result && result.state === "failed") {
      setCreateFailed(true);
      throw new Error("Mobile PTY creation failed; inspect before clearing the saved attempt");
    }
    const value = readMobilePtyLease(result, opening.sessionId);
    setSynced(false);
    freshProtocol.current = !!requestId;
    setLease(value);
    sequence.current = 0;
    generation.current++;
    setPaused(value.expiresAt <= Date.now());
    if (requestId) {
      await store.clear(requestId);
      setAttempt(null);
    }
    void list.refetch();
  };
  const create = () => {
    void run(async () => {
      if (
        !hydrated || closeAttempt.current ||
        attempt ||
        !targetMatches ||
        !current() ||
        useSecurity.getState().status !== "unlocked" ||
        useSecurity.getState().appState !== "active" ||
        !useSecurity.getState().windowFocused
      )
        return;
      const claim = await store.claim({
        operationId: randomUUID(),
        environmentId: opening.review!.environmentId!,
        digest: targetDigest,
        targetIdentityDigest: targetDigest,
      });
      setAttempt(claim.attempt);
      if (!claim.claimed) return;
      if (!current()) {
        await store.clear(claim.attempt.operationId);
        setAttempt(null);
        return;
      }
      fresh();
      await confirmed(
        await request("terminals.pty.desktop.create", {
          requestId: claim.attempt.operationId,
          ...dimensions.current,
        }),
        claim.attempt.operationId,
      );
    });
  };
  const attach = (terminal: MobilePtyTerminal, actionKey = `attach:${terminal.terminalId}`) => {
    if (closeAttempt.current) return;
    void run(async () => {
      const retained = lease?.terminal.terminalId === terminal.terminalId && !lost && ready;
      const after = retained ? cursor.current : 0;
      if (!retained) fresh();
      await confirmed(
        await request("terminals.pty.desktop.attach", {
          terminalId: terminal.terminalId,
          epoch: terminal.epoch,
          requestId: randomUUID(),
          after,
          freshRenderer: !retained,
        }),
      );
    }, actionKey);
  };
  const input = (dataBase64: string) => {
    if (!allowed.current || !current() || !lease || !client) return;
    const target = lease;
    const epoch = generation.current;
    queued.current += dataBase64.length;
    if (queued.current > 256 * 1024) {
      queued.current -= dataBase64.length;
      setPaused(true);
      setError(new Error("PTY input is backed up; unsent input was discarded"));
      generation.current++;
      return;
    }
    inputQueue.current = inputQueue.current.then(async () => {
      try {
        if (epoch !== generation.current || !allowed.current || !current()) return;
        const inputSequence = ++sequence.current;
        const receipt = await request("terminals.pty.desktop.write", {
          terminalId: target.terminal.terminalId,
          epoch: target.terminal.epoch,
          leaseId: target.leaseId,
          inputSequence,
          dataBase64,
        });
        if (
          !receipt ||
          typeof receipt !== "object" ||
          !("accepted" in receipt) ||
          receipt.accepted !== true ||
          !("inputSequence" in receipt) ||
          receipt.inputSequence !== inputSequence
        )
          throw new Error("PTY input outcome is unknown; never resend");
        wakeReader.current?.();
      } catch (cause) {
        generation.current++;
        setPaused(true);
        setError(cause);
      } finally {
        queued.current -= dataBase64.length;
      }
    });
  };
  const packet = (packet: TerminalPacket) => {
    if (packet.type === "ready") {
      if (readyDocument.current) {
        setLost(true);
        setPaused(true);
        setReady(false);
        generation.current++;
        waiting.current = null;
        return;
      }
      readyDocument.current = true;
      setReady(true);
      dimensions.current = { cols: packet.cols!, rows: packet.rows! };
      return;
    }
    if (packet.type === "ack" && waiting.current === packet.next) {
      cursor.current = packet.next!;
      // The terminal showed this chunk; keep it once for "Attach output".
      if (posted.current?.next === packet.next) tail.current.push(posted.current.dataBase64);
      posted.current = null;
      waiting.current = null;
      wakeReader.current?.();
      return;
    }
    if (packet.type === "input") input(packet.dataBase64!);
    if (packet.type === "input") wakeReader.current?.();
    if (packet.type === "resize") {
      dimensions.current = { cols: packet.cols!, rows: packet.rows! };
      if (allowed.current && lease && !op.occupied.current)
        void request("terminals.pty.desktop.resize", {
          terminalId: lease.terminal.terminalId,
          epoch: lease.terminal.epoch,
          leaseId: lease.leaseId,
          ...dimensions.current,
        }).catch((cause) => {
          setError(cause);
          setPaused(true);
        });
    }
  };
  useEffect(() => {
    viewport.current?.post({
      type: "configure",
      active: available && !list.isError && !paused && !gap && !lost && synced,
      freshPty: freshProtocol.current,
      theme: {
        background: theme.colors.background,
        foreground: theme.colors.text,
        cursor: theme.colors.text,
        selectionBackground: theme.colors.selected,
      },
    });
    if (!available || list.isError) {
      generation.current++;
      setPaused(true);
    }
    if (!security.unlocked) {
      fresh();
    }
  }, [available, list.isError, paused, gap, lost, ready, security.unlocked, theme.mode, synced]);
  useEffect(() => {
    if (!available || list.isError || !lease || !ready || paused || gap || lost || !client) return;
    let live = true;
    const controller = new AbortController();
    const read = async () => {
      if (!live || waiting.current !== null) return;
      try {
        const after = cursor.current;
        const raw = await client.request(
          "terminals.pty.desktop.read",
          {
            ...params,
            terminalId: lease.terminal.terminalId,
            epoch: lease.terminal.epoch,
            after,
            limit: 32768,
          },
          { signal: controller.signal },
        );
        if (!live || !current()) return;
        const result = readMobilePtyOutput(
          raw,
          lease.terminal.terminalId,
          lease.terminal.epoch,
          after,
        );
        if (result.gap) {
          setGap(true);
          setPaused(true);
          generation.current++;
          return;
        }
        if (result.next > after) {
          waiting.current = result.next;
          posted.current = { next: result.next, dataBase64: result.dataBase64 };
          viewport.current?.post({
            type: "output",
            after,
            next: result.next,
            dataBase64: result.dataBase64,
          });
        }
        if (result.next === after && after === result.end) setSynced(true);
        if (result.state === "exited" && !result.hasMore && result.next === after) {
          setPaused(true);
          setError(new Error("PTY process exited"));
          return;
        }
        return { output: result.next > after, hasMore: result.hasMore };
      } catch (cause) {
        if (live) {
          setError(cause);
          setPaused(true);
          generation.current++;
        }
      }
    };
    const scheduler = new PtyReadScheduler(() => live && waiting.current === null, read);
    wakeReader.current = scheduler.wake;
    scheduler.wake();
    return () => {
      live = false;
      controller.abort();
      scheduler.stop();
      if (wakeReader.current === scheduler.wake) wakeReader.current = undefined;
    };
  }, [available, list.isError, lease, ready, paused, gap, lost, client]);
  const controlsDisabled = !available || list.isError || busy || !hydrated || !targetMatches;
  return {
    supported,
    /** Why the terminal cannot start, or null when it can. */
    unavailable: supported
      ? null
      : !opening.review
        ? ("no-computer" as const)
        : !current()
          ? ("changed" as const)
          : !opening.review.environmentId
            ? ("no-identity" as const)
            : ("unsupported" as const),
    machineName: machine?.name,
    terminals: !lease ? (list.data?.terminals ?? []) : [],
    listFailed: list.isError,
    error: error ?? list.error,
    lease,
    closePending,
    paused,
    gap,
    lost,
    nonce,
    attempt,
    createFailed,
    busy,
    pendingAction,
    controlsDisabled,
    /** Input is accepted right now; read at render, like the terminal's own gate. */
    canInterrupt: allowed.current,
    showTerminal: !!lease && supported && security.unlocked && !list.isError,
    viewport,
    /** Plain text of the last `count` terminal lines the screen has shown. */
    recentOutput: (count: number) => tail.current.lines(count),
    create,
    attach,
    onPacket: packet,
    interrupt: () => input(PTY_KEYS.interrupt),
    /** Sends one key (base64 bytes) through the same ordered, receipt-checked input queue. */
    sendKey: input,
    /** Back to the terminal list without closing the terminal. */
    detach: () => {
      if (closeAttempt.current || op.occupied.current) return;
      generation.current++;
      setPaused(true);
      setLease(null);
      fresh();
    },
    checkCreation: () => {
      if (!attempt) return;
      void run(async () => {
        const result = await request("terminals.pty.desktop.status", {
          requestId: attempt.operationId,
        });
        await confirmed(result, attempt.operationId);
      }, "secondary-1");
    },
    closeTerminal: () => {
      if (!lease) return;
      void run(async () => {
        const prior = closeAttempt.current;
        if (prior && (prior.terminalId !== lease.terminal.terminalId || prior.epoch !== lease.terminal.epoch))
          throw new Error("Mobile PTY source changed; never replay input");
        const closing = prior ?? { terminalId: lease.terminal.terminalId, epoch: lease.terminal.epoch, requestId: randomUUID() };
        closeAttempt.current = closing;
        setClosePending(true);
        allowed.current = false;
        generation.current++;
        setPaused(true);
        const result = await request(prior ? "terminals.pty.desktop.status" : "terminals.pty.desktop.close",
          prior ? { requestId: closing.requestId } : closing);
        readMobilePtyClosed(result);
        closeAttempt.current = null;
        setClosePending(false);
        setLease(null);
        setPaused(true);
        fresh();
        void list.refetch();
      }, "secondary-2");
    },
    clearFailedCreation: () => {
      if (!attempt) return;
      void run(async () => {
        await store.clear(attempt.operationId);
        setAttempt(null);
        setCreateFailed(false);
      }, "secondary-3");
    },
    /** The terminal view reported its screen state is gone. */
    markLost: () => {
      setLost(true);
      setPaused(true);
      generation.current++;
    },
    /** Leaving the screen stops input; nothing queued is replayed. */
    pause: () => {
      generation.current++;
      setPaused(true);
    },
  };
}
