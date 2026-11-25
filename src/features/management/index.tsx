import type { ManagementScreenProps } from "./shared/types";
import { router } from "expo-router";
import { useState, type ComponentType } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Empty, SearchField, Screen } from "@/ui/primitives";
import { NoComputerGate } from "@/ui/no-computer";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { Scope } from "./shared/scope";
import { InitialProjectFilter, useLocalProjectScope } from "./shared/local-project-scope";
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

export function ManagementHome() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { projectId: selectedProjectId, setProjectId } = useLocalProjectScope();
  const projects = useProjectList();
  const [search, setSearch] = useState("");
  const projectId = selectedProjectId && (!projects.directoryReady || !projects.data?.some((project) => project.id === selectedProjectId))
    ? undefined : selectedProjectId;
  return (
    <Screen title={copy("Araçlar", "Tools")} context={machine ? <Scope allowAll projectId={selectedProjectId} onChange={setProjectId} /> : undefined} scroll={!!machine}>
      {!machine ? (
        <NoComputerGate description={copy("Görevler, ekipler, otomasyonlar ve geliştirme araçları bağlı bilgisayarda çalışır.", "Tasks, crews, automations and developer tools run on a connected computer.")} />
      ) : (
        <>
          <SearchField
            label={copy("Araçlarda ara", "Search tools")}
            value={search}
            onChangeText={setSearch}
          />
          <ToolDirectory projectId={projectId} query={search} onClearSearch={() => setSearch("")} />
        </>
      )}
    </Screen>
  );
}
export function ManagementScreen({ section, initialProjectId }: ManagementScreenProps) {
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
    <InitialProjectFilter value={initialProjectId}>
      <Component key={`${connection.token}:${section}`} />
    </InitialProjectFilter>
  ) : (
    <Screen title={title} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="search-empty" title={copy("Bölüm bulunamadı", "Section not found")}
          action={{ label: copy("Geri dön", "Go back"), onPress: () => router.back() }} />
      </View>
    </Screen>
  );
}
