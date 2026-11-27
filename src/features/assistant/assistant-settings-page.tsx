import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { remoteErrorKind } from "@/ui/error-message";
import { useCopy } from "@/ui/copy";
import { QueryState, Section, StateView } from "@/ui/primitives";
import { useProjectList } from "../workspace/use-project-directory";
import { SettingsPage } from "../settings/settings-page";
import type { AssistantResponse } from "../../../../src/shared/model/host-contracts/assistant";
import { AssistantMobileClient } from "./assistant-client";
import { AssistantPermissions } from "./assistant-permissions";
import { AssistantPresence } from "./assistant-presence";
import { assistantNeedsUpdate } from "./assistant-unavailable";

/**
 * Settings → Assistant: the selected computer's assistant preferences that outlive one conversation —
 * the owner's status, notifications, the computer and access. The assistant's ⚙ sheet keeps only this
 * conversation's choices and links here.
 */
export function AssistantSettingsPage() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const storageError = useMachines((state) => state.storageError);
  // The computer these preferences live on is the page's switchable scope pill.
  return (
    <SettingsPage title={copy("Asistan", "Assistant")} scope={machine && !storageError ? { computer: machine.name } : undefined}>
      <AssistantSettingsBody />
    </SettingsPage>
  );
}

export function AssistantSettingsBody() {
  const copy = useCopy();
  const machine = useActiveMachine(),
    connection = useConnectionScope(),
    transport = useHostClient();
  const hydratedMachines = useMachines((state) => state.hydrated);
  const connectionPending = useMachines((state) => state.connectionPending);
  const storageError = useMachines((state) => state.storageError);
  const client = useMemo(
    () =>
      transport && connection.review
        ? new AssistantMobileClient({
            environmentId: connection.review.environmentId,
            current: () => connection.isCurrent(),
            request: (method, params, options) => transport.request(method, params, options),
          })
        : null,
    [transport, connection],
  );
  const waitingForComputer = !hydratedMachines || (!machine && connectionPending);
  if (storageError || waitingForComputer)
    return <QueryState query={{ error: storageError, isLoading: waitingForComputer }} loading="content" />;
  if (!machine)
    return (
      <StateView compact illustration="connect-computer"
        title={copy("Önce bir bilgisayar bağla", "Connect a computer first")}
        description={copy("Asistanın tercihleri bağlı bilgisayarında tutulur.", "The assistant's preferences are kept on your connected computer.")}
        action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.navigate("/machines") }} />
    );
  if (!client)
    return (
      <StateView compact illustration="permission"
        title={copy("Erişim gerekiyor", "Access needed")}
        description={copy("Asistan için bilgisayar erişimini doğrula.", "Verify access to this computer to use the assistant.")}
        action={{ label: copy("Bilgisayarları aç", "Open computers"), onPress: () => router.navigate("/machines") }} />
    );
  return (
    <AssistantSettingsSections
      key={connection.token}
      client={client}
      machineId={machine.id}
      sourceKey={connection.token}
      current={() => connection.isCurrent()}
    />
  );
}

const denied = (error: unknown) =>
  ["auth", "identity", "protocol", "unsupported"].includes(remoteErrorKind(error) ?? "");

function AssistantSettingsSections({ client, machineId, sourceKey, current }: {
  client: AssistantMobileClient;
  machineId: string;
  sourceKey: string;
  current(): boolean;
}) {
  const copy = useCopy(),
    active = useHostReadActive(),
    projects = useProjectList(),
    cache = useQueryClient();
  const [presenceBusy, setPresenceBusy] = useState(false);
  // The same snapshot the assistant screen reads, so a change here is what the assistant shows.
  const key = hostKey(machineId, ["assistant", sourceKey, "snapshot"]);
  const snapshot = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => client.read({ op: "snapshot", limit: 100 }, signal),
    enabled: active,
    retry: false,
    networkMode: "always",
  });
  const state = current() && !denied(snapshot.error) ? snapshot.data?.snapshot : undefined;
  const writable = current() && active && !!state;
  const refresh = async () => { await snapshot.refetch(); };
  if (!state)
    return !snapshot.isPending && assistantNeedsUpdate(snapshot.error) ? (
      <StateView compact illustration="permission"
        title={copy("Bilgisayarındaki bycoda'yı güncelle", "Update bycoda on your computer")}
        description={copy("Bu bilgisayar henüz asistanı sunmuyor. Güncelledikten sonra asistan ayarları burada açılır.", "This computer does not offer the assistant yet. After updating, the assistant's settings appear here.")} />
    ) : <QueryState query={snapshot} loading="content" size="region" />;
  return (
    <>
      <Section title={copy("Durum", "Status")}>
        <AssistantPresence client={client} snapshot={state} enabled={writable} current={current}
          onChanged={() => cache.invalidateQueries({ queryKey: key })}
          onInspected={(value) => cache.setQueryData<AssistantResponse>(key, { snapshot: value })}
          onBusyChange={setPresenceBusy} />
      </Section>
      <AssistantPermissions key={sourceKey} profile={state.profile} client={client}
        projects={projects.directoryReady ? projects.data ?? [] : []}
        enabled={writable && !presenceBusy} current={current} onChanged={refresh} />
    </>
  );
}
