import { ProjectDirectoryFeedback } from "../workspace/project-directory-feedback";
import { router } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import type { HostProject } from "@/domain/types";
import { useProjectList } from "../workspace/use-project-directory";
import { useActiveMachine } from "@/state/machines";
import { Empty, QueryState, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { DevServersScreen } from "./dev-servers-screen";
import { RuntimeLogsScreen } from "./runtime-logs-screen";
import { DevicesScreen } from "./devices-screen";
import { BrowserScreen } from "./browser-screen";
import { TerminalScreen } from "./terminal-screen";
import { DiagnosticsScreen } from "./diagnostics-screen";
import { UsageScreen } from "./usage-screen";
import { ProviderCenter } from "./provider-center";
import { AccessCenter } from "./access-center";
import { PrivateContentBoundary } from "@/ui/private-content";

export function HostToolScreen({ tool, projectId }: { tool: string; projectId?: string }) {
  if (tool === "providers") return <ProviderCenter />;
  if (tool === "access") return <AccessCenter />;
  return <ProjectHostToolScreen tool={tool} projectId={projectId} />;
}
function ProjectHostToolScreen({ tool, projectId }: { tool: string; projectId?: string }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const visibleProject = projects.directoryReady ? projects.data?.find((entry) => entry.id === projectId) : undefined;
  const retained = useRef<{ machineId: string; projectId: string; project: HostProject } | undefined>(undefined);
  if (machine && visibleProject) retained.current = { machineId: machine.id, projectId: visibleProject.id, project: visibleProject };
  const remembered = retained.current;
  const project = visibleProject ?? (remembered?.machineId === machine?.id && remembered?.projectId === projectId ? remembered?.project : undefined);
  const capability = tool === "servers" ? "dev.servers" : tool === "devices" ? "device.host" : tool === "browser" ? "browser.shared" : tool === "terminals" ? "terminals.v1" : tool === "logs" ? "runtime.logs" : tool === "diagnostics" ? "resources.diagnostics" : tool === "usage" ? "usage.sessions.read" : null;
  const supported = !!capability && machine?.capabilities?.includes(capability);
  const toolName = ({ servers: copy("Geliştirme sunucuları", "Dev servers"), logs: copy("Çalışma günlükleri", "Runtime logs"), devices: copy("Cihazlar", "Devices"), browser: copy("Tarayıcı", "Browser"), terminals: copy("Terminaller", "Terminals"), diagnostics: copy("Tanılama", "Diagnostics"), usage: copy("Oturum kullanımı", "Session usage") } as Record<string, string>)[tool] ?? copy("Araçlar", "Tools");
  if (!capability) return (
    <Screen title={copy("Araçlar", "Tools")} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="search-empty" title={copy("Araç bulunamadı", "Tool not found")}
          action={{ label: copy("Projelere dön", "Back to projects"), onPress: () => router.replace("/") }} />
      </View>
    </Screen>
  );
  return (
    <View style={{ flex: 1 }}>
      {!visibleProject || !supported ? <Screen title={toolName} scroll={false}><View style={{ flex: 1, paddingHorizontal: space.screen }}>
        <ProjectDirectoryFeedback query={projects} readiness={projects.readiness}
          privacyUnavailable={projects.privacyUnavailable}
          loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")} />
        {projects.directoryReady && machine?.capabilities && !supported ? <Empty compact={false} illustration="permission"
          title={copy("Kullanılamıyor", "Unavailable")}
          detail={copy("Bu bilgisayar bu aracı sunmuyor: bycoda eski olabilir veya araç bu sistemde yok.", "This computer doesn't offer this tool: bycoda may be outdated or the tool is unavailable here.")}
          action={{ label: copy("Projelere dön", "Back to projects"), onPress: () => router.replace("/") }} /> : null}
        {projects.directoryReady && !visibleProject && !(machine?.capabilities && !supported) ? <Empty compact={false} illustration="no-projects" title={projectId
          ? copy("Bu bilgisayarda proje bulunamadı.", "Project not found on this computer.")
          : copy("Proje seçin", "Choose a project")}
          action={{ label: copy("Projelere dön", "Back to projects"), onPress: () => router.replace("/") }} /> : null}
      </View></Screen> : null}
      <PrivateContentBoundary visible={!!visibleProject && !!supported} isAllowed={() => !!project && projects.isProjectVisible(project.id)}>
        {machine && project && supported ? <ProjectToolContent key={`${machine.id}:${project.id}:${tool}`} tool={tool} project={project} /> : null}
      </PrivateContentBoundary>
    </View>
  );
}

function ProjectToolContent({ tool, project }: { tool: string; project: HostProject }) {
  if (tool === "servers") return <DevServersScreen project={project} />;
  if (tool === "logs") return <RuntimeLogsScreen project={project} />;
  if (tool === "diagnostics") return <DiagnosticsScreen project={project} />;
  if (tool === "usage") return <UsageScreen project={project} />;
  if (tool === "devices") return <DevicesScreen project={project} />;
  if (tool === "browser") return <BrowserScreen project={project} />;
  if (tool === "terminals") return <TerminalScreen project={project} />;
  return null;
}
