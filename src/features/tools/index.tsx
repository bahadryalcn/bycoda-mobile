import { ProjectDirectoryFeedback } from "../workspace/project-directory-feedback";
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { HostProject } from "@/domain/types";
import { useProjectList } from "../workspace/use-project-directory";
import { ProjectPicker } from "../workspace/project-picker";
import { useActiveMachine } from "@/state/machines";
import { Empty, QueryState, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMachineStatus } from "@/ui/machine-bar";
import { space } from "@/ui/tokens";
import { DevServersScreen } from "./dev-servers-screen";
import { DevicesScreen } from "./devices-screen";
import { BrowserScreen } from "./browser-screen";
import { TerminalScreen } from "./terminal-screen";
import { DiagnosticsScreen } from "./diagnostics-screen";
import { UsageScreen } from "./usage-screen";
import { ProviderCenter } from "./provider-center";
import { AccessCenter } from "./access-center";
import { PrivateContentBoundary } from "@/ui/private-content";
import { NoComputerGate } from "@/ui/no-computer";
import { computerTools, isToolId, toolLabels } from "./tool-labels";
import { goBack, leaveTo } from "@/ui/navigation";

type SharedProjectProps = {
  /** The shared project selection (`useLocalProjectScope`); never a route-private project. */
  projectId?: string;
  /** Picking a project here sets the shared selection. */
  onSelectProject?: (projectId: string) => void;
  /** The shared header pill, for pages whose content depends on the project. */
  scopeControl?: ReactNode;
};

export function HostToolScreen({ tool, projectId, onSelectProject, scopeControl }: { tool: string } & SharedProjectProps) {
  if (tool === "providers") return <ProviderCenter />;
  if (tool === "access") return <AccessCenter />;
  // Resources never depend on a project; usage stays one screen and narrows Tokens to the shared project.
  if (tool === "diagnostics" || computerTools.has(tool)) return <ComputerToolScreen tool={tool as "usage" | "diagnostics"}
    projectId={projectId} onSelectProject={onSelectProject} scopeControl={scopeControl} />;
  return <ProjectHostToolScreen tool={tool} projectId={projectId} onSelectProject={onSelectProject} />;
}

/** Usage and computer resources read computer-level data, so they open without a project. */
function ComputerToolScreen({ tool, projectId, onSelectProject, scopeControl }: { tool: "usage" | "diagnostics" } & SharedProjectProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const project = projectId && projects.directoryReady && projects.isProjectVisible(projectId)
    ? projects.data?.find((entry) => entry.id === projectId) : undefined;
  const title = copy(...toolLabels[tool]);
  const capabilities = tool === "usage"
    ? ["usage.limits.read", "usage.cost.read", "usage.sessions.read"]
    : ["resources.diagnostics"];
  if (!machine) return <Screen title={title} scroll={false}><NoComputerGate /></Screen>;
  if (!machine.capabilities) return (
    <Screen title={title} scroll={false}><View style={{ flex: 1, paddingHorizontal: space.screen }}><ToolAvailabilityFeedback /></View></Screen>
  );
  if (!capabilities.some((capability) => machine.capabilities!.includes(capability))) return (
    <Screen title={title} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="permission" title={copy("Bu bilgisayarda yok", "Not on this computer")}
          detail={copy("Bu bilgisayar bu aracı sunmuyor: bycoda eski olabilir veya araç bu sistemde yok.", "This computer doesn't offer this tool: bycoda may be outdated or the tool is unavailable here.")}
          action={{ label: copy("Geri dön", "Go back"), onPress: () => goBack("/manage") }} />
      </View>
    </Screen>
  );
  return tool === "usage"
    ? <UsageScreen key={machine.id} project={project} onSelectProject={onSelectProject} scopeControl={scopeControl} />
    : <DiagnosticsScreen key={machine.id} />;
}
function ProjectHostToolScreen({ tool, projectId, onSelectProject }: { tool: string } & Omit<SharedProjectProps, "scopeControl">) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const [choosingProject, setChoosingProject] = useState(false);
  const visibleProject = projects.directoryReady ? projects.data?.find((entry) => entry.id === projectId) : undefined;
  const retained = useRef<{ machineId: string; projectId: string; project: HostProject } | undefined>(undefined);
  if (machine && visibleProject) retained.current = { machineId: machine.id, projectId: visibleProject.id, project: visibleProject };
  const remembered = retained.current;
  const project = visibleProject ?? (remembered?.machineId === machine?.id && remembered?.projectId === projectId ? remembered?.project : undefined);
  const capability = tool === "servers" ? "dev.servers" : tool === "devices" ? "device.host" : tool === "browser" ? "browser.shared" : tool === "terminals" ? "terminals.v1" : tool === "diagnostics" ? "resources.diagnostics" : tool === "usage" ? "usage.sessions.read" : null;
  const supported = !!capability && machine?.capabilities?.includes(capability);
  const needsCapabilities = !!visibleProject && !!machine && !machine.capabilities;
  const canChooseProject = supported && !!projects.data?.length;
  const toolName = isToolId(tool) ? copy(...toolLabels[tool]) : copy("Araçlar", "Tools");
  if (!capability) return (
    <Screen title={copy("Araçlar", "Tools")} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="search-empty" title={copy("Araç bulunamadı", "Tool not found")}
          action={{ label: copy("Projelere dön", "Back to projects"), onPress: () => leaveTo("/") }} />
      </View>
    </Screen>
  );
  return (
    <View style={{ flex: 1 }}>
      {!visibleProject || !supported ? <Screen title={toolName} scroll={false}><View style={{ flex: 1, paddingHorizontal: space.screen }}>
        {needsCapabilities ? <ToolAvailabilityFeedback /> : (
          <ProjectDirectoryFeedback query={projects} readiness={projects.readiness}
            privacyUnavailable={projects.privacyUnavailable}
            loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")} />
        )}
        {projects.directoryReady && machine?.capabilities && !supported ? <Empty compact={false} illustration="permission"
          title={copy("Bu bilgisayarda yok", "Not on this computer")}
          detail={copy("Bu bilgisayar bu aracı sunmuyor: bycoda eski olabilir veya araç bu sistemde yok.", "This computer doesn't offer this tool: bycoda may be outdated or the tool is unavailable here.")}
          action={{ label: copy("Geri dön", "Go back"), onPress: () => goBack("/manage") }} /> : null}
        {projects.directoryReady && !visibleProject && !(machine?.capabilities && !supported) ? <Empty compact={false} illustration="no-projects" title={projectId
          ? copy("Bu bilgisayarda proje bulunamadı.", "Project not found on this computer.")
          : copy("Proje gerekli", "Project required")}
          action={canChooseProject ? {
            label: copy("Proje seçin", "Choose a project"),
            onPress: () => setChoosingProject(true),
          } : { label: copy("Projelere dön", "Back to projects"), onPress: () => leaveTo("/") }} /> : null}
      </View></Screen> : null}
      {choosingProject && canChooseProject ? (
        <ProjectPicker visible onClose={() => setChoosingProject(false)} onSelect={(selected) => {
          setChoosingProject(false);
          if (machine && projects.isProjectVisible(selected.id, selected.cwd)) onSelectProject?.(selected.id);
        }} />
      ) : null}
      <PrivateContentBoundary visible={!!visibleProject && !!supported} isAllowed={() => !!project && projects.isProjectVisible(project.id)}>
        {machine && project && supported ? <ProjectToolContent key={`${machine.id}:${project.id}:${tool}`} tool={tool} project={project} /> : null}
      </PrivateContentBoundary>
    </View>
  );
}

function ToolAvailabilityFeedback() {
  const copy = useCopy();
  const { health, phase } = useMachineStatus();
  // Capabilities are still being applied to the paired machine after the descriptor arrives.
  const query = {
    ...health,
    data: undefined,
    isEnabled: undefined,
    isPending: true,
    fetchStatus: phase === "connected" || phase === "checking" ? "fetching" as const : "paused" as const,
  };
  return <QueryState query={query} loading="centered" loadingLabel={copy("Bağlantı kontrol ediliyor…", "Checking connection…")} />;
}

function ProjectToolContent({ tool, project }: { tool: string; project: HostProject }) {
  if (tool === "servers") return <DevServersScreen project={project} />;
  if (tool === "devices") return <DevicesScreen project={project} />;
  if (tool === "browser") return <BrowserScreen project={project} />;
  if (tool === "terminals") return <TerminalScreen project={project} />;
  return null;
}
