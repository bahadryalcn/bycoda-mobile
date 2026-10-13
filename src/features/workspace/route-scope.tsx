import { useRef, type PropsWithChildren } from "react";
import { router } from "expo-router";
import { useMachines } from "@/state/machines";
import { Body, Button, Empty, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RouteMachine } from "./route-machine";

export function WorkspaceRouteScope({
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
        <Empty
          title={copy(
            "Bu çalışma alanı başka bir bilgisayara ait.",
            "This workspace belongs to another computer.",
          )}
          detail={
            origin
              ? `${copy("Bilgisayar:", "Computer:")} ${origin.name}`
              : copy(
                  "Çalışma alanını istediğin bilgisayarın proje listesinden aç.",
                  "Open this workspace from the intended computer’s project list.",
                )
          }
        />
        <Body muted>
          {copy(
            "Seçili bilgisayarda farklı bir çalışma alanı açabilirsin.",
            "You can open another workspace on the selected computer.",
          )}
        </Body>
        <Button
          label={copy("Projelere dön", "Back to projects")}
          onPress={() => router.replace("/")}
        />
        <Button
          label={copy("Bilgisayar seç", "Choose computer")}
          onPress={() => router.push("/machines")}
        />
      </Screen>
    );
  return children;
}
