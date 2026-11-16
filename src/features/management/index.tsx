import type { ManagementScreenProps } from "./shared/types";
import { router } from "expo-router";
import { useState, type ComponentType } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Empty, SearchField, Screen } from "@/ui/primitives";
import { useActiveMachine } from "@/state/machines";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
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
  const projectId = projects.directoryReady && projects.data?.some((project) => project.id === selectedProjectId)
    ? selectedProjectId : null;
  return (
    <Screen title={copy("Araçlar", "Tools")} context={machine ? <Scope allowAll projectId={selectedProjectId} onChange={setProjectId} /> : undefined} scroll={!!machine}>
      {!machine ? (
        <View style={{ flex: 1 }}>
        <Empty
          compact={false}
          illustration="connect-computer"
          detail={copy("Araçlar bağlı bilgisayarındaki projelerle çalışır.", "Tools work with the projects on your connected computer.")}
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.navigate("/machines"),
          }}
        />
        </View>
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
export function ManagementScreen({ section }: ManagementScreenProps) {
  const machine = useActiveMachine();
  const copy = useCopy();
  const labels = isManagementSection(section) ? managementSections[section] : undefined;
  const title = labels ? copy(labels[0], labels[1]) : copy("Bölüm bulunamadı", "Section not found");
  if (!machine)
    return (
      <Screen title={title} scroll={false}>
        <View style={{ flex: 1 }}>
        <Empty
          compact={false}
          illustration="connect-computer"
          detail={copy("Bu bölüm bağlı bilgisayarındaki verileri gösterir.", "This section shows data from your connected computer.")}
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.navigate("/machines"),
          }}
        />
        </View>
      </Screen>
    );
  // Social is off on mobile for now: its route falls through to "section not found".
  const screens: Partial<Record<ManagementSection, ComponentType>> = {
    tasks: TasksScreen,
    goals: GoalsScreen,
    crews: CrewsScreen,
    automations: AutomationsScreen,
    notes: NotesScreen,
    inbox: InboxScreen,
    stewards: StewardsScreen,
  };
  const Component = isManagementSection(section) ? screens[section] : undefined;
  return Component ? (
    <Component key={`${machine.id}:${section}`} />
  ) : (
    <Screen title={title} scroll={false}>
      <View style={{ flex: 1 }}>
        <Empty compact={false} illustration="search-empty" title={copy("Bölüm bulunamadı", "Section not found")}
          action={{ label: copy("Geri dön", "Go back"), onPress: () => router.back() }} />
      </View>
    </Screen>
  );
}
