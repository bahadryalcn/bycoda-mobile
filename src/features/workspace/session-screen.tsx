import { useCallback, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveMachine } from "@/state/machines";
import { Empty, QueryState, Screen } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { SessionComposer } from "./session-composer";
import { SessionKeyboardFrame } from "./session-keyboard-frame";
import { useSessionSnapshot } from "./session-queries";
import { SessionSettings } from "./session-settings";
import { SessionToolbar } from "./session-toolbar";
import { SessionTranscript } from "./session-transcript";
import { TranscriptViewFilter } from "./transcript-view-filter";
import type { TranscriptView } from "./transcript-model";
import { UncertainCommand, useCommands } from "./shared";
import type { SessionScope, SessionScreenProps, SessionWorkspaceProps } from "./session-types";

export function SessionScreen({ id, projectId }: SessionScreenProps) {
  const machine = useActiveMachine();
  const copy = useCopy();
  if (!machine) {
    return (
      <Screen>
        <Empty title={copy("Bilgisayara bağlan", "Connect to a computer")} />
      </Screen>
    );
  }
  return (
    <SessionWorkspace
      key={`${machine.id}:${id}`}
      id={id}
      projectId={projectId}
      machineId={machine.id}
    />
  );
}

function SessionWorkspace({ id, projectId: routeProjectId, machineId }: SessionWorkspaceProps) {
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const scope = useMemo<SessionScope>(() => ({ machineId, sessionId: id }), [machineId, id]);
  const snapshot = useSessionSnapshot(scope);
  const session = snapshot.data;
  const projectId = session?.projectId ?? routeProjectId;
  const command = useCommands();
  const [settings, setSettings] = useState(false);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("messages");
  const blocked = command.isPending || command.error instanceof UncertainCommand;
  const sendCommand = command.mutateAsync;
  const refetchSnapshot = snapshot.refetch;
  const dispatch = useCallback(
    async (params: Record<string, unknown>) => {
      const receipt = await sendCommand(params);
      void refetchSnapshot();
      return receipt;
    },
    [sendCommand, refetchSnapshot],
  );

  const refresh = () => {
    void snapshot.refetch();
  };
  const receiptHandled = () => {
    command.reset();
    refresh();
  };

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: session?.session.title || copy("Oturum", "Session"),
        headerRight: () => <TranscriptViewFilter value={transcriptView} onChange={setTranscriptView} />,
      }} />
      <SessionKeyboardFrame
        composer={
          <SessionComposer
            scope={scope}
            session={session}
            blocked={blocked}
            busy={command.isPending}
            onCommand={dispatch}
          />
        }
        style={{
          flex: 1,
          width: "100%",
          maxWidth: metrics.contentWidth,
          alignSelf: "center",
          paddingLeft: Math.max(insets.left, space.screen),
          paddingRight: Math.max(insets.right, space.screen),
          paddingTop: space.xs,
        }}
      >
        <SessionToolbar
          scope={scope}
          projectId={projectId}
          query={snapshot}
          command={command}
          blocked={blocked}
          onSettings={() => setSettings(true)}
          onRefresh={refresh}
          onCommand={dispatch}
        />
        <QueryState query={snapshot} />
        <SessionTranscript
          view={transcriptView}
          scope={scope}
          session={session}
          blocked={blocked}
          command={command}
          onCommand={dispatch}
          onReceiptHandled={receiptHandled}
        />
      </SessionKeyboardFrame>
      {settings && session && projectId ? (
        <SessionSettings
          onClose={() => setSettings(false)}
          value={session}
          projectId={projectId}
          disabled={blocked}
          onCommand={dispatch}
          onUpdated={refresh}
        />
      ) : null}
    </Screen>
  );
}
