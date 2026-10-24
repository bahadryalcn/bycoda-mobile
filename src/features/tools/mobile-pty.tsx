import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useSecurity } from "@/state/security";
import {
  reviewedMachine,
  isReviewedMachine,
  reviewedMachineIdentityDigest,
} from "@/state/reviewed-machine";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import {
  Body,
  Button,
  ErrorText,
  NavigationRow,
  Notice,
  Row,
  Sheet,
  Stack,
  ScreenList,
} from "@/ui/primitives";
import { TerminalViewport, type TerminalViewportHandle } from "@/ui/terminal-viewport";
import type { TerminalPacket } from "@/ui/terminal-document";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { SessionScope } from "../workspace/session-types";
import { PtyReadScheduler } from "./pty-read-scheduler";
import {
  readMobilePtyLease,
  readMobilePtyList,
  readMobilePtyOutput,
  type MobilePtyLease,
  type MobilePtyTerminal,
} from "./mobile-pty-model";
export function MobilePty({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const theme = useMobileTheme();
  const copy = useCopy();
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
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
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
  const waiting = useRef<number | null>(null);
  const wakeReader = useRef<(() => void) | undefined>(undefined);
  const sequence = useRef(0);
  const generation = useRef(0);
  const inputQueue = useRef(Promise.resolve());
  const queued = useRef(0);
  const pending = useRef(false);
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
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof store.load>>>(null);
  const [hydrated, setHydrated] = useState(false);
  const [targetDigest, setTargetDigest] = useState("");
  const [targetMatches, setTargetMatches] = useState(false);
  useEffect(() => {
    let live = true;
    void reviewedMachineIdentityDigest(opening.review!, (text) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
    )
      .then(async (digest) => {
        const value = await store.load();
        if (!live) return null;
        setTargetDigest(digest);
        const matches = !value || value.targetIdentityDigest === digest;
        setTargetMatches(matches);
        if (!matches)
          setError(
            new Error(
              "Saved PTY creation belongs to a different reviewed connection; no operation was sent",
            ),
          );
        return value;
      })
      .then(
        (value) => {
          if (live) setAttempt(value);
        },
        (cause) => {
          if (live) setError(cause);
        },
      )
      .finally(() => {
        if (live) setHydrated(true);
      });
    return () => {
      live = false;
    };
  }, [store]);
  const allowed = useRef(false);
  allowed.current = available && !list.isError && !paused && !gap && !lost && synced;
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
  const run = async (action: () => Promise<void>) => {
    if (pending.current || !available) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause);
      setPaused(true);
      generation.current++;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const fresh = () => {
    setSynced(false);
    readyDocument.current = false;
    cursor.current = 0;
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
        !hydrated ||
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
  const attach = (terminal: MobilePtyTerminal) => {
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
    });
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
      waiting.current = null;
      wakeReader.current?.();
      return;
    }
    if (packet.type === "input") input(packet.dataBase64!);
    if (packet.type === "input") wakeReader.current?.();
    if (packet.type === "resize") {
      dimensions.current = { cols: packet.cols!, rows: packet.rows! };
      if (allowed.current && lease && !pending.current)
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
  return (
    <Sheet
      visible
      size="full"
      scroll={false}
      title={copy("Etkileşimli terminal", "Interactive terminal")}
      onClose={() => {
        generation.current++;
        setPaused(true);
        onClose();
      }}
    >
      <View style={{ flex: 1 }}>
        <ScreenList
          data={!lease ? (list.data?.terminals ?? []) : []}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              <Body muted>{machine?.name}</Body>
              <Notice
                tone="info"
                message={copy(
                  "Gerçek PTY bilgisayardaki açık ve odaklanmış yerel konuşma üzerinden çalışır. Arka planda giriş durur; eski giriş yeniden gönderilmez.",
                  "Real PTY requires the local conversation focused in the desktop. Input pauses in background; old input is never replayed.",
                )}
              />
              {!supported ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Bu bilgisayar etkileşimli masaüstü terminalini desteklemiyor.",
                    "This computer does not support the interactive desktop terminal.",
                  )}
                />
              ) : null}
              <ErrorText error={error ?? list.error} />
              {gap || lost ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Terminal ekran durumu kayboldu. Çıktı eksikse yeni terminali açıkça oluşturun.",
                    "Terminal screen state was lost. If output is missing, explicitly create a fresh terminal.",
                  )}
                />
              ) : null}
              <Row>
                <Button
                  label={copy("Yeni etkileşimli terminal", "New interactive terminal")}
                  disabled={controlsDisabled || !!attempt}
                  onPress={create}
                />
                {lease ? (
                  <Button
                    label={copy("Sürdür", "Resume")}
                    disabled={controlsDisabled || !paused}
                    onPress={() => attach(lease.terminal)}
                  />
                ) : null}
                {lease ? (
                  <Button
                    label="Ctrl-C"
                    disabled={!allowed.current || busy}
                    onPress={() => input("Aw==")}
                  />
                ) : null}
              </Row>
              {attempt ? (
                <Button
                  label={copy("Oluşturma durumunu kontrol et", "Check creation status")}
                  disabled={controlsDisabled}
                  onPress={() => {
                    void run(async () => {
                      const result = await request("terminals.pty.desktop.status", {
                        requestId: attempt.operationId,
                      });
                      await confirmed(result, attempt.operationId);
                    });
                  }}
                />
              ) : null}
              {lease ? (
                <Button
                  label={copy("Terminali kapat", "Close terminal")}
                  tone="danger"
                  disabled={controlsDisabled}
                  onPress={() => {
                    void run(async () => {
                      await request("terminals.pty.desktop.close", {
                        terminalId: lease.terminal.terminalId,
                        epoch: lease.terminal.epoch,
                        requestId: randomUUID(),
                      });
                      generation.current++;
                      setLease(null);
                      setPaused(true);
                      fresh();
                      void list.refetch();
                    });
                  }}
                />
              ) : null}
              {createFailed && attempt ? (
                <Button
                  label={copy(
                    "Başarısız oluşturma kaydını temizle",
                    "Clear failed creation receipt",
                  )}
                  disabled={controlsDisabled}
                  onPress={() => {
                    void run(async () => {
                      await store.clear(attempt.operationId);
                      setAttempt(null);
                      setCreateFailed(false);
                    });
                  }}
                />
              ) : null}
            </Stack>
          }
          renderItem={({ item: terminal }) => (
            <NavigationRow
              label={terminal.name}
              detail={terminal.state}
              disabled={controlsDisabled || terminal.state !== "running"}
              onPress={() => attach(terminal)}
            />
          )}
        />
        {lease && supported && security.unlocked && !list.isError ? (
          <TerminalViewport
            ref={viewport}
            nonce={nonce}
            onPacket={packet}
            onLost={() => {
              setLost(true);
              setPaused(true);
              generation.current++;
            }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}
