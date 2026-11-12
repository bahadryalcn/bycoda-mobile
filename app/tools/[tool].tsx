import { Stack, useLocalSearchParams } from "expo-router";
import { HostToolScreen } from "../../src/features/tools";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
import { useMachines } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";

// Same labels as the tool directory, so the native title is right before the screen mounts.
const toolTitles: Record<string, readonly [tr: string, en: string]> = {
  servers: ["Geliştirme sunucuları", "Dev servers"],
  logs: ["Çalışma günlükleri", "Runtime logs"],
  devices: ["Cihazlar", "Devices"],
  browser: ["Tarayıcı", "Browser"],
  terminals: ["Terminaller", "Terminals"],
  diagnostics: ["Tanılama", "Diagnostics"],
  usage: ["Oturum kullanımı", "Session usage"],
  providers: ["Sağlayıcı merkezi", "Provider center"],
  access: ["Bilgisayar erişimi", "Host access"],
};

export default function HostToolRoute() {
  const { tool, projectId, machineId } = useLocalSearchParams<{ tool: string; projectId?: string; machineId?: string }>();
  const active = useMachines((state) => state.activeId);
  const copy = useCopy();
  const title = toolTitles[tool ?? ""];
  return (
    <WorkspaceRouteScope machineId={machineId}>
      {title ? <Stack.Screen options={{ title: copy(...title) }} /> : null}
      <HostToolScreen key={`${active}:${projectId ?? ""}:${tool}`} tool={tool} projectId={projectId} />
    </WorkspaceRouteScope>
  );
}
