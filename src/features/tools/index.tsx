import { router } from "expo-router";
import { useProjectList } from "../workspace/use-project-directory";
import { useActiveMachine } from "@/state/machines";
import { Button, Empty, Notice, QueryState, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { DevServersScreen } from "./dev-servers-screen";
import { RuntimeLogsScreen } from "./runtime-logs-screen";
import { DevicesScreen } from "./devices-screen";
import { BrowserScreen } from "./browser-screen";
import { TerminalScreen } from "./terminal-screen";

export function HostToolScreen({ tool, projectId }: { tool: string; projectId?: string }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const project = !projects.privacyPending && projects.data?.find((entry) => entry.id === projectId);
  const capability = tool === "servers" ? "dev.servers" : tool === "devices" ? "device.host" : tool === "browser" ? "browser.shared" : tool === "terminals" ? "terminals.v1" : "runtime.logs";
  const supported = machine?.capabilities?.includes(capability);
  if (machine && project && supported) {
    if (tool === "servers") return <DevServersScreen project={project} />;
    if (tool === "logs") return <RuntimeLogsScreen project={project} />;
    if (tool === "devices") return <DevicesScreen project={project} />;
    if (tool === "browser") return <BrowserScreen project={project} />;
    if (tool === "terminals") return <TerminalScreen key={`${machine.id}:${project.id}`} project={project} />;
  }
  return (
    <Screen title={copy("Araçlar", "Tools")}>
      <QueryState query={projects} />
      {machine && !supported ? <Notice message={copy("Bu araç için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on your computer to use this tool.")} /> : null}
      {!projects.isPending && !project ? <Empty title={copy("Proje seçin", "Choose a project")} /> : null}
      <Button label={copy("Projelere dön", "Back to projects")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
