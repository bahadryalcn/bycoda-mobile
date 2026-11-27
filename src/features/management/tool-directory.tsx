import { FolderOpen, GitBranch, MessagesSquare, CheckSquare, Target, Users, Clock, NotebookPen, Activity, Plug, KeyRound, ShieldCheck, Server, Smartphone, Globe, Terminal, ChartColumn } from "@/ui/duotone-icon";
import { PullRequestIcon } from "./pull-request-icon";
import { computerTools, toolLabels } from "../tools/tool-labels";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { router, type Href } from "expo-router";
import { useState, type ComponentType } from "react";
import { ProjectPicker } from "../workspace/project-picker";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useActiveMachine, useMachines } from "@/state/machines";
import { NavigationGroup, NavigationRow, NoResults, RowIcon, Section } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { managementSections, type ManagementSection } from "./sections";

type CopyPair = readonly [tr: string, en: string];
type HostTool = "servers" | "devices" | "browser" | "terminals" | "diagnostics" | "usage";
type Tool = {
  id: string;
  label: CopyPair;
  /** A row glyph rendered through the shared `RowIcon`. */
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  projectView?: "sessions" | "files" | "git";
  hostTool?: HostTool;
  /** A computer tool without a host tool route still needs this capability. */
  capability?: string;
  managementSection?: ManagementSection;
  /** Only a project's tools sheet lists it; the Tools tab reaches it from the project screen. */
  projectSheetOnly?: boolean;
};

/**
 * One directory feeds the global tools screen and each project's tools sheet. Every row opens a
 * tool; the assistant (dock) and Jira (Inbox tab) are reached from their own owners.
 */
const tools: readonly Tool[] = [
  { id: "sessions", label: ["Oturumlar", "Sessions"], icon: MessagesSquare, projectView: "sessions", projectSheetOnly: true },
  { id: "files", label: ["Dosyalar", "Files"], icon: FolderOpen, projectView: "files", projectSheetOnly: true },
  { id: "git", label: ["Değişiklikler", "Changes"], icon: GitBranch, projectView: "git", projectSheetOnly: true },
  { id: "tasks", label: managementSections.tasks, icon: CheckSquare, managementSection: "tasks" },
  { id: "goals", label: managementSections.goals, icon: Target, managementSection: "goals" },
  { id: "crews", label: managementSections.crews, icon: Users, managementSection: "crews" },
  { id: "automations", label: managementSections.automations, icon: Clock, managementSection: "automations" },
  { id: "stewards", label: managementSections.stewards, icon: ShieldCheck, managementSection: "stewards" },
  { id: "notes", label: managementSections.notes, icon: NotebookPen, managementSection: "notes" },
  { id: "pull-requests", label: ["Pull request’ler", "Pull requests"], icon: PullRequestIcon },
  { id: "terminals", label: toolLabels.terminals, icon: Terminal, hostTool: "terminals" },
  { id: "servers", label: toolLabels.servers, icon: Server, hostTool: "servers" },
  { id: "browser", label: toolLabels.browser, icon: Globe, hostTool: "browser" },
  { id: "devices", label: toolLabels.devices, icon: Smartphone, hostTool: "devices" },
  { id: "usage", label: toolLabels.usage, icon: ChartColumn, hostTool: "usage" },
  { id: "diagnostics", label: toolLabels.diagnostics, icon: Activity, hostTool: "diagnostics" },
  { id: "providers", label: toolLabels.providers, icon: Plug, capability: "providers.center.read" },
  { id: "access", label: toolLabels.access, icon: KeyRound, capability: "host.access.read" },
];

const hostCapabilities = { servers: "dev.servers", devices: "device.host", browser: "browser.shared", terminals: "terminals.v1", diagnostics: "resources.diagnostics", usage: "usage.sessions.read" } as const;

/** Computer-level tools open with any of these capabilities and without a project. */
const computerCapabilities: Partial<Record<HostTool, readonly string[]>> = {
  usage: ["usage.limits.read", "usage.cost.read", "usage.sessions.read"],
  diagnostics: ["resources.diagnostics"],
};

/**
 * Task groups also supply search vocabulary; an empty group never leaves a heading.
 * Work is agent work; Project tools need a project; Computer tools do not.
 */
const groups: readonly { title: CopyPair; ids: readonly string[] }[] = [
  { title: ["İşler", "Work"], ids: ["tasks", "goals", "crews", "automations", "stewards"] },
  { title: ["Proje", "Project"], ids: ["sessions", "files", "git", "notes", "pull-requests", "terminals", "servers", "browser", "devices"] },
  { title: ["Bilgisayar", "Computer"], ids: ["usage", "diagnostics", "providers", "access"] },
];

const isComputerTool = (tool: Tool) => !!tool.hostTool && computerTools.has(tool.hostTool);
/** A tool the computer does not offer; capabilities not yet known count as offered. */
function isUnsupported(tool: Tool, capabilities: readonly string[] | undefined) {
  if (!capabilities) return false;
  if (tool.capability) return !capabilities.includes(tool.capability);
  if (!tool.hostTool) return false;
  const accepted = computerCapabilities[tool.hostTool] ?? [hostCapabilities[tool.hostTool]];
  return !accepted.some((capability) => capabilities.includes(capability));
}
const needsProject = (tool: Tool) =>
  (!!tool.hostTool && !isComputerTool(tool)) || (!!tool.projectView && tool.id !== "sessions");

export function ToolDirectory({
  projectId,
  fallback = false,
  query = "",
  onNavigate,
  onProjectView,
  onClearSearch,
}: {
  /** null is All projects. undefined means the selected project could not be verified. */
  projectId: string | null | undefined;
  /** `projectId` is the page's stand-in while the shared selection is still All projects. */
  fallback?: boolean;
  query?: string;
  onNavigate?: (navigate: () => void) => void;
  onProjectView?: (view: "sessions" | "files" | "git") => void;
  onClearSearch?: () => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [pending, setPendingTool] = useState<{ tool: Tool; connection: ConnectionScope } | null>(null);
  const pendingTool = pending?.connection === connection && connection.isCurrent() ? pending.tool : null;
  const visible = tools.filter((tool) => {
    // The dock owns Sessions and the project screen owns Files and Changes; only a project's
    // sheet lists them to switch its own view.
    if (tool.projectSheetOnly && !onProjectView) return false;
    const group = groups.find((group) => group.ids.includes(tool.id));
    return matchesSearch([copy(...tool.label), group ? copy(...group.title) : ""].join(" "), query, locale);
  });
  const open = (tool: Tool, picked?: string) => {
    const targetProjectId = picked ?? projectId;
    // Only a project the person picks becomes the shared selection; a stand-in keeps All projects.
    const keepsAll = !picked && fallback;
    if (!machine || !connection.isCurrent() || useMachines.getState().activeId !== machine.id) return;
    const unsupported = isUnsupported(tool, machine.capabilities);
    if ((!unsupported && needsProject(tool) && !targetProjectId) || (tool.managementSection && targetProjectId === undefined)) {
      setPendingTool({ tool, connection });
      return;
    }
    if (tool.projectView && targetProjectId) {
      if (onProjectView) {
        onProjectView(tool.projectView);
        return;
      }
    }
    const navigate = () => {
      if (!connection.isCurrent() || useMachines.getState().activeId !== machine.id) return;
      if (targetProjectId && !keepsAll) useMachines.getState().selectProject(targetProjectId);
      // Pages that accept All projects open with All; the others use their own stand-in.
      const linkedProjectId = keepsAll ? undefined : targetProjectId;
      if (tool.projectView && targetProjectId)
        router.navigate({
          pathname: "/project/[id]",
          params: { id: targetProjectId, machineId: machine.id, view: tool.projectView },
        });
      else if (tool.hostTool && (targetProjectId || unsupported || isComputerTool(tool)))
        router.navigate({ pathname: "/tools/[tool]", params: { tool: tool.hostTool, projectId: targetProjectId ?? "", machineId: machine.id } } as Href);
      else if (tool.managementSection) router.navigate({ pathname: "/manage/[section]", params: {
        section: tool.managementSection,
        machineId: machine.id,
        environmentId: machine.environmentId,
        projectFilter: linkedProjectId ? "project" : "all",
        ...(linkedProjectId ? { projectId: linkedProjectId } : {}),
      } });
      else if (tool.id === "pull-requests")
        router.navigate({ pathname: "/pull-requests", params: { machineId: machine.id, ...(linkedProjectId ? { projectId: linkedProjectId } : {}) } } as Href);
      else if (tool.id === "sessions") router.navigate("/(tabs)/chats" as Href);
      else if (tool.id === "providers") router.navigate({ pathname: "/tools/[tool]", params: { tool: "providers", machineId: machine.id } } as Href);
      else if (tool.id === "access") router.navigate({ pathname: "/tools/[tool]", params: { tool: "access", machineId: machine.id } } as Href);
    };
    if (onNavigate) onNavigate(navigate);
    else navigate();
  };
  const byId = new Map(visible.map((tool) => [tool.id, tool]));
  const rendered = groups
    .map((group) => ({ ...group, tools: group.ids.map((id) => byId.get(id)).filter((tool): tool is Tool => !!tool) }))
    .filter((group) => group.tools.length > 0);
  return (
    <>
      {pendingTool ? <ProjectPicker key={machine?.id} visible onClose={() => setPendingTool(null)} onSelect={(project) => {
        const tool = pendingTool;
        setPendingTool(null);
        open(tool, project.id);
      }} /> : null}
      {!visible.length ? <NoResults searching title={copy("Aramana uyan araç yok.", "No tools match your search.")}
        onClearSearch={onClearSearch} compact={!!onProjectView} /> : null}
      {rendered.map((group) => (
        <Section key={group.title[1]} title={copy(...group.title)}>
          <NavigationGroup>
            {group.tools.map((tool) => {
              const Icon = tool.icon;
              const unsupported = isUnsupported(tool, machine?.capabilities);
              // With all projects in scope, say before the tap that a project will be asked for.
              const asksForProject = !unsupported && needsProject(tool) && !projectId && !onProjectView;
              return (
                <NavigationRow
                  key={tool.id}
                  label={copy(...tool.label)}
                  detail={unsupported ? copy("Bu bilgisayarda yok", "Not on this computer")
                    : asksForProject ? copy("Proje seçin", "Choose a project") : undefined}
                  icon={<RowIcon glyph={Icon} />}
                  onPress={() => open(tool)}
                />
              );
            })}
          </NavigationGroup>
        </Section>
      ))}
    </>
  );
}
