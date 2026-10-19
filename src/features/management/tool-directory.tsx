import { router, type Href } from "expo-router";
import { useState } from "react";
import { ProjectPicker } from "../workspace/project-picker";
import FolderOpen from "lucide-react-native/icons/folder-open";
import GitBranch from "lucide-react-native/icons/git-branch";
import MessageSquare from "lucide-react-native/icons/message-square";
import CheckSquare from "lucide-react-native/icons/square-check-big";
import Target from "lucide-react-native/icons/target";
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
import { useActiveMachine, useMachines } from "@/state/machines";
import { Empty, NavigationGroup, NavigationRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { IconTile } from "@/ui/icon-tile";
import { enterItem } from "@/ui/motion";
import Animated from "react-native-reanimated";
import { managementSections, type ManagementSection } from "./sections";

type CopyPair = readonly [tr: string, en: string];
type Tool = {
  id: string;
  label: CopyPair;
  icon: typeof FolderOpen;
  tint: string;
  projectView?: "sessions" | "files" | "git";
  hostTool?: "servers" | "logs" | "devices" | "browser" | "terminals";
  managementSection?: ManagementSection;
};

/** One directory feeds the global tools screen and each project's tools sheet. */
const tools: readonly Tool[] = [
  { id: "sessions", label: ["Oturumlar", "Sessions"], icon: MessageSquare, tint: colors.accent, projectView: "sessions" },
  { id: "files", label: ["Dosyalar", "Files"], icon: FolderOpen, tint: colors.info, projectView: "files" },
  { id: "git", label: ["Değişiklikler", "Changes"], icon: GitBranch, tint: colors.warning, projectView: "git" },
  { id: "tasks", label: managementSections.tasks, icon: CheckSquare, tint: colors.accent, managementSection: "tasks" },
  { id: "goals", label: managementSections.goals, icon: Target, tint: colors.success, managementSection: "goals" },
  { id: "automations", label: managementSections.automations, icon: Clock, tint: colors.warning, managementSection: "automations" },
  { id: "stewards", label: managementSections.stewards, icon: ShieldCheck, tint: colors.success, managementSection: "stewards" },
  { id: "notes", label: managementSections.notes, icon: NotebookPen, tint: colors.warning, managementSection: "notes" },
  { id: "social", label: managementSections.social, icon: MessageCircle, tint: colors.info, managementSection: "social" },
  { id: "inbox", label: ["Gelen kutusu", "Inbox"], icon: Inbox, tint: colors.danger },
  { id: "terminals", label: ["Terminaller", "Terminals"], icon: Terminal, tint: colors.muted, hostTool: "terminals" },
  { id: "servers", label: ["Geliştirme sunucuları", "Dev servers"], icon: Server, tint: colors.success, hostTool: "servers" },
  { id: "logs", label: ["Çalışma günlükleri", "Runtime logs"], icon: ScrollText, tint: colors.muted, hostTool: "logs" },
  { id: "browser", label: ["Tarayıcı", "Browser"], icon: Globe, tint: colors.info, hostTool: "browser" },
  { id: "devices", label: ["Cihazlar", "Devices"], icon: Smartphone, tint: colors.accent, hostTool: "devices" },
  { id: "computers", label: ["Bilgisayarlar", "Computers"], icon: Laptop, tint: colors.muted },
];

/** Short inset groups, each a Settings-style list; empty groups disappear while searching. */
const groups: readonly (readonly string[])[] = [
  ["sessions", "files", "git"],
  ["tasks", "goals", "automations", "stewards", "notes", "social", "inbox"],
  ["terminals", "servers", "logs", "browser", "devices"],
  ["computers"],
];

export function ToolDirectory({
  projectId,
  query = "",
  onNavigate,
  onProjectView,
}: {
  projectId?: string | null;
  query?: string;
  onNavigate?: (navigate: () => void) => void;
  onProjectView?: (view: "sessions" | "files" | "git") => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [pendingTool, setPendingTool] = useState<Tool | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const visible = tools.filter((tool) =>
    copy(...tool.label).toLocaleLowerCase().includes(normalized),
  );
  if (!visible.length)
    return <Empty title={copy("Aramana uyan araç yok.", "No tools match your search.")} />;
  const open = (tool: Tool, targetProjectId = projectId) => {
    if (!machine || useMachines.getState().activeId !== machine.id) return;
    if ((tool.hostTool || (tool.projectView && tool.id !== "sessions")) && !targetProjectId) {
      setPendingTool(tool);
      return;
    }
    if (tool.projectView && targetProjectId) {
      if (onProjectView) {
        onProjectView(tool.projectView);
        return;
      }
    }
    const navigate = () => {
      if (useMachines.getState().activeId !== machine.id) return;
      if (targetProjectId) useMachines.getState().selectProject(targetProjectId);
      if (tool.projectView && targetProjectId)
        router.push({
          pathname: "/project/[id]",
          params: { id: targetProjectId, machineId: machine.id, view: tool.projectView },
        });
      else if (tool.hostTool && targetProjectId)
        router.push({ pathname: "/tools/[tool]", params: { tool: tool.hostTool, projectId: targetProjectId, machineId: machine.id } } as Href);
      else if (tool.managementSection) router.push(`/manage/${tool.managementSection}`);
      else if (tool.id === "sessions") router.push("/(tabs)/chats" as Href);
      else if (tool.id === "inbox") router.push("/inbox");
      else if (tool.id === "computers") router.push("/machines");
    };
    if (onNavigate) onNavigate(navigate);
    else navigate();
  };
  const byId = new Map(visible.map((tool) => [tool.id, tool]));
  const rendered = groups
    .map((ids) => ids.map((id) => byId.get(id)).filter((tool): tool is Tool => !!tool))
    .filter((group) => group.length > 0);
  return (
    <>
      {pendingTool ? <ProjectPicker key={machine?.id} visible onClose={() => setPendingTool(null)} onSelect={(project) => {
        const tool = pendingTool;
        setPendingTool(null);
        open(tool, project.id);
      }} /> : null}
      {rendered.map((group, index) => (
        <Animated.View key={group.map((tool) => tool.id).join("-")} entering={enterItem(index)}>
          <NavigationGroup>
            {group.map((tool) => {
              const Icon = tool.icon;
              return (
                <NavigationRow
                  key={tool.id}
                  label={copy(...tool.label)}
                  icon={
                    <IconTile color={tool.tint}>
                      <Icon size={18} strokeWidth={2} color={tool.tint} />
                    </IconTile>
                  }
                  onPress={() => open(tool)}
                />
              );
            })}
          </NavigationGroup>
        </Animated.View>
      ))}
    </>
  );
}
