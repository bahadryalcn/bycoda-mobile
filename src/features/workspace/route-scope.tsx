import { useRef, type PropsWithChildren } from "react";
import { useMachines } from "@/state/machines";
import { Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { NO_COMPUTER_ACTION, NO_COMPUTER_TITLE } from "@/ui/no-computer";
import { RouteMachine } from "./route-machine";
import { leaveTo, pushOnce } from "@/ui/navigation";

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
  if (!binding.current.matches(active)) {
    // The route keeps its own title; only the body explains why the workspace is held back.
    const noComputer = binding.current.origin === null;
    return (
      <Screen>
        <StateView
          illustration={noComputer ? "connect-computer" : "unreachable"}
          title={noComputer ? copy(...NO_COMPUTER_TITLE) : copy(
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
            label: noComputer ? copy(...NO_COMPUTER_ACTION) : copy("Bilgisayar seç", "Choose computer"),
            onPress: () => pushOnce("/machines"),
          }}
          secondaryAction={{
            label: copy("Projelere dön", "Back to projects"),
            onPress: () => leaveTo("/"),
          }}
        />
      </Screen>
    );
  }
  return children;
}
