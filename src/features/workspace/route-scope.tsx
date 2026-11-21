import { useRef, type PropsWithChildren } from "react";
import { router, Stack } from "expo-router";
import { useMachines } from "@/state/machines";
import { Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RouteMachine } from "./route-machine";

export function WorkspaceRouteScope({
  machineId,
  children,
}: PropsWithChildren<{ machineId?: string }>) {
  // Router entries can be reused for a new explicit computer. An active
  // computer change alone must never retarget the already-open entry.
  return <BoundWorkspaceRoute key={machineId} machineId={machineId}>{children}</BoundWorkspaceRoute>;
}

function BoundWorkspaceRoute({
  machineId,
  children,
}: PropsWithChildren<{ machineId?: string }>) {
  const active = useMachines((state) => state.activeId);
  const copy = useCopy();
  const binding = useRef(new RouteMachine(machineId ?? active));
  const origin = useMachines((state) =>
    state.machines.find((machine) => machine.id === binding.current.origin),
  );
  if (!binding.current.matches(active))
    return (
      <Screen>
        <Stack.Screen options={{ title: copy("Bilgisayar seç", "Choose computer"), headerTitle: undefined, headerRight: undefined }} />
        <StateView
          illustration="unreachable"
          title={binding.current.origin === null ? copy("Bilgisayar bağla", "Connect a computer") : copy(
            "Bu çalışma alanı başka bir bilgisayara ait.",
            "This workspace belongs to another computer.",
          )}
          description={
            origin
              ? `${copy("Bilgisayar:", "Computer:")} ${origin.name}`
              : copy(
                  "Çalışma alanını istediğin bilgisayarın proje listesinden aç.",
                  "Open this workspace from the intended computer’s project list.",
                )
          }
          action={{
            label: copy("Bilgisayar seç", "Choose computer"),
            onPress: () => router.push("/machines"),
          }}
          secondaryAction={{
            label: copy("Projelere dön", "Back to projects"),
            onPress: () => router.replace("/"),
          }}
        />
      </Screen>
    );
  return children;
}
