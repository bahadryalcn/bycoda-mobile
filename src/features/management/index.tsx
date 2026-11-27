import type { ManagementScreenProps } from "./shared/types";
import { useState, type ComponentType } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Empty, SearchField, Screen, useCollapsibleSearch } from "@/ui/primitives";
import { NoComputerGate } from "@/ui/no-computer";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { ProjectScopePill } from "../workspace/project-scope-pill";
import { useRequiredProjectScope } from "./shared/required-project-scope";
import { TasksScreen } from "./tasks-screen";
import { GoalsScreen } from "./goals-screen";
import { CrewsScreen } from "./crews-screen";
import { AutomationsScreen } from "./automations-screen";
import { NotesScreen } from "./notes-screen";
import { InboxScreen } from "./inbox-screen";
import { StewardsScreen } from "./stewards-screen";
import { ToolDirectory } from "./tool-directory";
import { isManagementSection, managementSections, type ManagementSection } from "./sections";
import { useProjectList } from "../workspace/use-project-directory";
import { goBack } from "@/ui/navigation";

export function ManagementHome() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { projectId: selectedProjectId, setProjectId, fallback } = useRequiredProjectScope();
  const projects = useProjectList();
  const [search, setSearch] = useState("");
  // The search icon trails the scope row; the open field takes the row below it.
  const toolSearch = useCollapsibleSearch(<SearchField label={copy("Araçlarda ara", "Search tools")} value={search} onChangeText={setSearch} />);
  const projectId = selectedProjectId && (!projects.directoryReady || !projects.data?.some((project) => project.id === selectedProjectId))
    ? undefined : selectedProjectId;
  return (
    <Screen title={copy("Araçlar", "Tools")} scopeControl={machine ? <ProjectScopePill allowAll={false} projectId={selectedProjectId} onChange={setProjectId} /> : undefined}
      actions={machine ? toolSearch.trigger : undefined} scroll={!!machine}>
      {!machine ? (
        <NoComputerGate description={copy("Görevler, ekipler, otomasyonlar ve geliştirme araçları bağlı bilgisayarda çalışır.", "Tasks, crews, automations and developer tools run on a connected computer.")} />
      ) : (
        <>
          {toolSearch.field}
          <ToolDirectory projectId={projectId} fallback={fallback} query={search} onClearSearch={() => setSearch("")} />
        </>
      )}
    </Screen>
  );
}
export function ManagementScreen({ section }: ManagementScreenProps) {
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const copy = useCopy();
  const labels = isManagementSection(section) ? managementSections[section] : undefined;
  const title = labels ? copy(labels[0], labels[1]) : copy("Bölüm bulunamadı", "Section not found");
  // An unknown section is unknown with or without a computer.
  if (!machine && labels)
    return (
      <Screen title={title} scroll={false}>
        <NoComputerGate />
      </Screen>
    );
  const screens: Partial<Record<ManagementSection, ComponentType>> = {
    tasks: TasksScreen,
    goals: GoalsScreen,
    crews: CrewsScreen,
    automations: AutomationsScreen,
    notes: NotesScreen,
    inbox: InboxScreen,
    stewards: StewardsScreen,
  };
  const Component = machine && isManagementSection(section) ? screens[section] : undefined;
  return Component ? (
    <Component key={`${connection.token}:${section}`} />
  ) : (
    <Screen title={title} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="search-empty" title={copy("Bölüm bulunamadı", "Section not found")}
          action={{ label: copy("Geri dön", "Go back"), onPress: () => goBack("/manage") }} />
      </View>
    </Screen>
  );
}
