import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMachines } from "@/state/machines";
import { useConsentPending, useHostClient, useHostReadActive } from "@/state/queries";
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
import { space } from "@/ui/tokens";
import {
  parseSessionReference,
  referenceMachines,
  resolveSessionReference,
} from "./session-reference";

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
  const readable = useHostReadActive();
  const consentPending = useConsentPending();
  const request = useRef(0);
  const chosen = candidates.find((machine) => machine.id === chosenId);
  const selectedHere = !!chosen && chosen.id === activeId;
  const resolving = selectedHere && !!client && readable;
  const waitingForConnection = selectedHere && !client && !consentPending;
  const manageConnections = () => router.push("/machines");
  const manageAction = { label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections };

  // A single eligible computer can be selected without asking the reader.
  useEffect(() => {
    if (!reference || !ready || !readable || chosenId || candidates.length !== 1) return;
    useMachines.getState().selectMachine(candidates[0].id);
    setChosenId(candidates[0].id);
  }, [reference, ready, readable, chosenId, candidates]);

  // Cancel stale lookups when the route, selected connection or access changes.
  useEffect(() => {
    if (!reference || !ready || !chosenId || activeId !== chosenId || !client || !readable) return;
    const machine = machines.find((value) => value.id === chosenId);
    if (!machine || !candidates.some((value) => value.id === machine.id)) return;
    const controller = new AbortController();
    const ticket = ++request.current;
    const current = () => {
      assertAppAccess();
      const state = useMachines.getState();
      const latest = state.machines.find((value) => value.id === machine.id);
      if (
        controller.signal.aborted ||
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
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && ticket === request.current) setError(failure);
      });
    return () => {
      controller.abort();
      request.current++;
    };
  }, [reference, ready, chosenId, activeId, client, readable, machines, candidates, attempt]);

  const choose = (id: string) => {
    request.current++;
    useMachines.getState().selectMachine(id);
    setChosenId(id);
    setError(null);
    setAttempt((value) => value + 1);
  };
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
            action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: manageConnections }}
          />
        ) : (
          <>
            {error ? (
              <ErrorNotice error={error} onRetry={chosen ? () => choose(chosen.id) : undefined} />
            ) : resolving ? (
              <Loading label={copy("Oturum açılıyor…", "Opening conversation…")} />
            ) : selectedHere && consentPending ? (
              <Loading label={copy("Bağlantı kontrol ediliyor…", "Checking connection…")} />
            ) : waitingForConnection ? (
              <StateView compact tone="warning"
                title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
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
            {candidates.map((machine) => (
              <Button
                key={machine.id}
                label={machine.name}
                selected={machine.id === chosenId}
                busy={!error && resolving && machine.id === chosenId}
                onPress={() => choose(machine.id)}
              />
            ))}
            {(!waitingForConnection || !!error) ? (
              <Button tone="quiet" {...manageAction} />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
