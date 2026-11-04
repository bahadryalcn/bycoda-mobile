import { router, type Href } from "expo-router";
import { useState } from "react";
import { ProjectPicker } from "../workspace/project-picker";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import FolderOpen from "lucide-react-native/icons/folder-open";
import GitBranch from "lucide-react-native/icons/git-branch";
import MessageSquare from "lucide-react-native/icons/message-square";
import CheckSquare from "lucide-react-native/icons/square-check-big";
import Target from "lucide-react-native/icons/target";
import Users from "lucide-react-native/icons/users";
import Clock from "lucide-react-native/icons/clock";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Inbox from "lucide-react-native/icons/inbox";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Server from "lucide-react-native/icons/server";
import ScrollText from "lucide-react-native/icons/scroll-text";
import Smartphone from "lucide-react-native/icons/smartphone";
import Globe from "lucide-react-native/icons/globe";
import Terminal from "lucide-react-native/icons/terminal";
import ChartColumn from "lucide-react-native/icons/chart-column";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Empty, NavigationGroup, NavigationRow, Section } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { managementSections, type ManagementSection } from "./sections";

type CopyPair = readonly [tr: string, en: string];
type Tool = {
  id: string;
  label: CopyPair;
  icon: typeof FolderOpen;
  projectView?: "sessions" | "files" | "git";
  hostTool?: "servers" | "logs" | "devices" | "browser" | "terminals" | "diagnostics" | "usage";
  managementSection?: ManagementSection;
};

/** One directory feeds the global tools screen and each project's tools sheet. */
const tools: readonly Tool[] = [
  { id: "assistant", label: ["Asistan", "Assistant"], icon: MessageCircle },
  { id: "sessions", label: ["Oturumlar", "Sessions"], icon: MessageSquare, projectView: "sessions" },
  { id: "files", label: ["Dosyalar", "Files"], icon: FolderOpen, projectView: "files" },
  { id: "git", label: ["Değişiklikler", "Changes"], icon: GitBranch, projectView: "git" },
  { id: "tasks", label: managementSections.tasks, icon: CheckSquare, managementSection: "tasks" },
  { id: "goals", label: managementSections.goals, icon: Target, managementSection: "goals" },
  { id: "crews", label: managementSections.crews, icon: Users, managementSection: "crews" },
  { id: "automations", label: managementSections.automations, icon: Clock, managementSection: "automations" },
  { id: "stewards", label: managementSections.stewards, icon: ShieldCheck, managementSection: "stewards" },
  { id: "notes", label: managementSections.notes, icon: NotebookPen, managementSection: "notes" },
  { id: "social", label: managementSections.social, icon: MessageCircle, managementSection: "social" },
  { id: "inbox", label: ["Gelen kutusu", "Inbox"], icon: Inbox },
  { id: "terminals", label: ["Terminaller", "Terminals"], icon: Terminal, hostTool: "terminals" },
  { id: "servers", label: ["Geliştirme sunucuları", "Dev servers"], icon: Server, hostTool: "servers" },
  { id: "logs", label: ["Çalışma günlükleri", "Runtime logs"], icon: ScrollText, hostTool: "logs" },
  { id: "diagnostics", label: ["Tanılama", "Diagnostics"], icon: Server, hostTool: "diagnostics" },
  { id: "usage", label: ["Oturum kullanımı", "Session usage"], icon: ChartColumn, hostTool: "usage" },
  { id: "browser", label: ["Tarayıcı", "Browser"], icon: Globe, hostTool: "browser" },
  { id: "devices", label: ["Cihazlar", "Devices"], icon: Smartphone, hostTool: "devices" },
  { id: "computers", label: ["Bilgisayarlar", "Computers"], icon: Laptop },
  { id: "providers", label: ["Sağlayıcı merkezi", "Provider center"], icon: Server },
  { id: "access", label: ["Bilgisayar erişimi", "Host access"], icon: ShieldCheck },
];

/** Task groups also supply search vocabulary; an empty group never leaves a heading. */
const groups: readonly { title: CopyPair; ids: readonly string[] }[] = [
  { title: ["Proje", "Project"], ids: ["sessions", "files", "git", "notes"] },
  { title: ["İşler", "Work"], ids: ["tasks", "goals", "crews", "automations", "stewards"] },
  { title: ["İletişim", "Communication"], ids: ["assistant", "inbox", "social"] },
  { title: ["Geliştirme", "Development"], ids: ["terminals", "servers", "logs", "diagnostics", "usage", "browser", "devices"] },
  { title: ["Bilgisayar", "Computer"], ids: ["providers", "access", "computers"] },
];

export function ToolDirectory({
  projectId,
  query = "",
  onNavigate,
  onProjectView,
  onClearSearch,
}: {
  projectId?: string | null;
  query?: string;
  onNavigate?: (navigate: () => void) => void;
  onProjectView?: (view: "sessions" | "files" | "git") => void;
  onClearSearch?: () => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [pending, setPendingTool] = useState<{ tool: Tool; connection: ConnectionScope } | null>(null);
  const pendingTool = pending?.connection === connection && connection.isCurrent() ? pending.tool : null;
  const normalized = query.trim().toLocaleLowerCase();
  const visible = tools.filter((tool) => {
    const group = groups.find((group) => group.ids.includes(tool.id));
    return [copy(...tool.label), group ? copy(...group.title) : ""]
      .join(" ").toLocaleLowerCase().includes(normalized);
  });
  const open = (tool: Tool, targetProjectId = projectId) => {
    if (!machine || !connection.isCurrent() || useMachines.getState().activeId !== machine.id) return;
    if ((tool.hostTool || (tool.projectView && tool.id !== "sessions")) && !targetProjectId) {
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
      if (targetProjectId) useMachines.getState().selectProject(targetProjectId);
      if (tool.projectView && targetProjectId)
        router.push({
          pathname: "/project/[id]",
          params: { id: targetProjectId, machineId: machine.id, view: tool.projectView },
        });
      else if (tool.hostTool && targetProjectId)
        router.push({ pathname: "/tools/[tool]", params: { tool: tool.hostTool, projectId: targetProjectId, machineId: machine.id } } as Href);
      else if (tool.managementSection) router.push(`/manage/${tool.managementSection}`);
      else if (tool.id === "assistant") router.push("/assistant" as Href);
      else if (tool.id === "sessions") router.push("/(tabs)/chats" as Href);
      else if (tool.id === "inbox") router.push("/inbox");
      else if (tool.id === "computers") router.push("/machines");
      else if (tool.id === "providers") router.push({ pathname: "/tools/[tool]", params: { tool: "providers", machineId: machine.id } } as Href);
      else if (tool.id === "access") router.push({ pathname: "/tools/[tool]", params: { tool: "access", machineId: machine.id } } as Href);
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
      {!visible.length ? <Empty compact title={copy("Aramana uyan araç yok.", "No tools match your search.")}
        action={onClearSearch ? { label: copy("Aramayı temizle", "Clear search"), onPress: onClearSearch } : undefined} /> : null}
      {rendered.map((group) => (
        <Section key={group.title[1]} title={copy(...group.title)}>
          <NavigationGroup>
            {group.tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <NavigationRow
                  key={tool.id}
                  label={copy(...tool.label)}
                  icon={
                    <Icon size={20} strokeWidth={1.8} color={colors.muted} />
                  }
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
