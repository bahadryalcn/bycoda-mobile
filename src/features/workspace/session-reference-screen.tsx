import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useMachines } from "@/state/machines";
import { deviceIsOffline, useDeviceOffline } from "@/state/device-network";
import { useConsentPending, useHostClient, useHostReadActive } from "@/state/queries";
import { useHostRuntimeStartupFailed } from "@/state/host-runtime-state";
import { selectMobileHostTransport } from "@/remote/lan-ws";
import { assertAppAccess } from "@/state/security";
import {
  Body,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  QueryState,
  Screen,
  StateView,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { errorMessage, remoteErrorKind } from "@/ui/error-message";
import { errorTitle } from "@/ui/state-model";
import { space } from "@/ui/tokens";
import { useSwitchComputer } from "../connections/use-switch-computer";
import {
  parseSessionReference,
  referenceMachines,
  resolveSessionReference,
} from "./session-reference";
import { useLatestCallback } from "./use-latest-callback";

export function SessionReferenceScreen({ link }: { link: string }) {
  const copy = useCopy();
  const reference = useMemo(() => parseSessionReference(link), [link]);
  const machines = useMachines((state) => state.machines);
  const activeId = useMachines((state) => state.activeId);
  const ready = useMachines(
    (state) => state.hydrated && !state.storageError && !state.connectionPending,
  );
  const storageError = useMachines((state) => state.storageError);
  const candidates = useMemo(
    () => (reference ? referenceMachines(reference, machines) : []),
    [reference, machines],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const client = useHostClient();
  const startupFailed = useHostRuntimeStartupFailed();
  const deviceOffline = useDeviceOffline();
  const readable = useHostReadActive();
  const consentPending = useConsentPending();
  const switcher = useSwitchComputer();
  const request = useRef(0);
  const automaticChoice = useRef<string | null>(null);
  const selectionScope = useRef<object | null>(null);
  const openedReferenceScope = useRef<object | null>(null);
  const openingConnections = useRef(false);
  const chosen = candidates.find((machine) => machine.id === chosenId);
  const selectedHere = !!chosen && chosen.id === activeId;
  const openingConversation = selectedHere && !!client && readable && !deviceOffline &&
    !error && !switcher.busy && !switcher.operation.error;
  const waitingForConnection = selectedHere && !client && !consentPending && !deviceOffline &&
    !error && !switcher.busy && !switcher.operation.error;
  const connectionStartupFailed = waitingForConnection && readable && startupFailed &&
    selectMobileHostTransport(chosen?.capabilities ?? [], true) === "native-wss";
  const errorKind = remoteErrorKind(error);
  const repairConnection = errorKind === "auth" || errorKind === "identity";
  const readTimedOut = errorKind === "timeout" && !!chosen;
  const showOffline = deviceOffline && !repairConnection;
  const manageConnections = () => {
    if (openingConnections.current) return;
    openingConnections.current = true;
    router.push({ pathname: "/machines", params: { returnToPrevious: "1" } });
  };
  const manageAction = { label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections, reserveTouchTarget: true };

  // The reference stays mounted behind Computers. Allow one push per visit.
  useFocusEffect(useCallback(() => {
    openingConnections.current = false;
  }, []));

  // Ignore a draft flush that finishes after the reference or read access changes.
  useLayoutEffect(() => {
    selectionScope.current = readable ? {} : null;
    return () => { selectionScope.current = null; };
  }, [link, readable]);

  const choose = useLatestCallback((id: string) => {
    const scope = selectionScope.current;
    if (!scope || switcher.busy) return;
    request.current++;
    const selected = () => {
      setChosenId(id);
      setError(null);
      setAttempt((value) => value + 1);
    };
    if (id === useMachines.getState().activeId) {
      switcher.operation.reset();
      selected();
    } else {
      void switcher.switchTo(id, selected, () => selectionScope.current === scope);
    }
  });

  // A single eligible computer can be selected without asking the reader.
  useEffect(() => {
    if (!reference || !ready || !readable || chosen || candidates.length !== 1) return;
    const id = candidates[0].id;
    if (automaticChoice.current === id) return;
    automaticChoice.current = id;
    choose(id);
  }, [reference, ready, readable, chosen, candidates, choose]);

  // Cancel stale lookups when the route, connection, network or access changes.
  useEffect(() => {
    if (!reference || !ready || !chosenId || activeId !== chosenId || !client || !readable || deviceOffline) return;
    const machine = machines.find((value) => value.id === chosenId);
    const scope = selectionScope.current;
    if (!scope || openedReferenceScope.current === scope || !machine || !candidates.some((value) => value.id === machine.id)) return;
    const controller = new AbortController();
    const ticket = ++request.current;
    const current = () => {
      assertAppAccess();
      const state = useMachines.getState();
      const latest = state.machines.find((value) => value.id === machine.id);
      if (
        controller.signal.aborted ||
        deviceIsOffline() ||
        selectionScope.current !== scope ||
        ticket !== request.current ||
        !state.hydrated ||
        state.storageError ||
        state.connectionPending ||
        state.activeId !== machine.id ||
        latest?.endpoint !== machine.endpoint ||
        latest?.environmentId !== machine.environmentId ||
        latest?.lanKey !== machine.lanKey
      )
        throw new Error("This computer connection changed. Reopen its current route.");
    };
    setError(null);
    void resolveSessionReference(
      reference,
      machine,
      (method, params, options) => client.request(method, params, options),
      current,
      controller.signal,
    )
      .then((route) => {
        current();
        router.replace(route);
        // The computer descriptor can refresh before the native replacement commits.
        openedReferenceScope.current = scope;
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && ticket === request.current) setError(failure);
      });
    return () => {
      controller.abort();
      request.current++;
    };
  }, [reference, ready, chosenId, activeId, client, readable, deviceOffline, machines, candidates, attempt]);

  return (
    <Screen footer={
      <Button tone="quiet"
        label={copy("Projelere dön", "Back to projects")}
        onPress={() => router.replace("/")}
      />
    }>
      <View style={{ flexGrow: 1, justifyContent: "center", gap: space.md }}>
        {!reference ? (
          <StateView
            illustration="error"
            title={copy("Oturum bağlantısı geçersiz.", "Invalid conversation link.")}
          />
        ) : storageError ? (
          <QueryState query={{ error: storageError }} onManageConnections={manageConnections} />
        ) : !ready ? (
          <Loading centered label={copy("Bağlantılar yükleniyor…", "Loading connections…")} />
        ) : !candidates.length ? (
          <Empty
            title={copy("Bu oturum için eşleştirilmiş bilgisayar bulunamadı.", "No paired computer is available for this conversation.")}
            action={{
              label: copy("Bilgisayar bağla", "Connect a computer"),
              onPress: () => router.navigate({ pathname: "/machines", params: { start: "choices" } }),
            }}
          />
        ) : (
          <>
            {switcher.busy ? (
              <Loading label={copy("Bağlantı kontrol ediliyor…", "Checking connection…")} />
            ) : switcher.operation.error ? (
              <ErrorNotice error={switcher.operation.error} onRetry={chosen ? () => choose(chosen.id) : undefined} />
            ) : showOffline ? (
              <QueryState query={{ fetchStatus: "paused" }} loading="inline" />
            ) : repairConnection ? (
              <StateView
                tone="danger"
                illustration="locked"
                title={errorTitle(errorKind, copy)}
                description={errorMessage(error, copy, undefined, { read: true })}
                action={manageAction}
              />
            ) : readTimedOut ? (
              <StateView
                compact
                tone="warning"
                title={copy("Bilgisayardan zamanında yanıt gelmedi", "The computer took too long to respond")}
                description={chosen.name}
                action={{
                  label: copy("Yeniden dene", "Retry"),
                  onPress: () => choose(chosen.id),
                  reserveTouchTarget: true,
                }}
              />
            ) : error ? (
              <ErrorNotice error={error} onRetry={chosen && errorKind !== "unsupported" ? () => choose(chosen.id) : undefined}>
                {chosen ? <Body muted>{chosen.name}</Body> : null}
              </ErrorNotice>
            ) : openingConversation ? (
              <View style={{ gap: space.xs }}>
                <Loading label={copy("Oturum açılıyor…", "Opening conversation…")} />
                <Body muted>{chosen.name}</Body>
              </View>
            ) : selectedHere && consentPending ? (
              <Loading label={copy("Bağlantı kontrol ediliyor…", "Checking connection…")} />
            ) : connectionStartupFailed ? (
              <StateView compact tone="warning"
                title={copy("Bağlantı başlatılamadı", "Connection couldn’t start")}
                description={copy(
                  "Bycoda’yı yeniden başlat, ardından oturum bağlantısını aç.",
                  "Close and reopen Bycoda, then open this link again.",
                )}
              />
            ) : waitingForConnection ? (
              <StateView compact tone="warning"
                title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
                description={chosen?.name}
                action={manageAction}
              />
            ) : (
              <Body muted>
                {copy(
                  "Oturumun bulunduğu eşleştirilmiş bilgisayarı seç.",
                  "Choose the paired computer that owns this conversation.",
                )}
              </Body>
            )}
            {candidates.filter((machine) =>
              machine.id !== chosenId || !(error || waitingForConnection || openingConversation)
            ).map((machine) => (
              <Button
                key={machine.id}
                label={machine.name}
                selected={machine.id === chosenId}
                disabled={switcher.busy}
                onPress={() => choose(machine.id)}
              />
            ))}
            {!repairConnection && !waitingForConnection ? (
              <Button tone="quiet" {...manageAction} />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
