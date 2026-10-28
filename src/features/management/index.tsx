import type { ManagementScreenProps } from "./shared/types";
import { router } from "expo-router";
import { useState, type ComponentType } from "react";
import { useCopy } from "@/ui/copy";
import { Empty, SearchField, Screen } from "@/ui/primitives";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Scope } from "./shared/scope";
import { TasksScreen } from "./tasks-screen";
import { GoalsScreen } from "./goals-screen";
import { CrewsScreen } from "./crews-screen";
import { AutomationsScreen } from "./automations-screen";
import { NotesScreen } from "./notes-screen";
import { InboxScreen } from "./inbox-screen";
import { SocialScreen } from "./social-screen";
import { StewardsScreen } from "./stewards-screen";
import { ToolDirectory } from "./tool-directory";
import { isManagementSection, managementSections, type ManagementSection } from "./sections";
import { useProjectList } from "../workspace/use-project-directory";

export function ManagementHome() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const selectedProjectId = useMachines((state) => state.selectedProjectId);
  const projects = useProjectList();
  const [search, setSearch] = useState("");
  const projectId = projects.directoryReady && projects.data?.some((project) => project.id === selectedProjectId)
    ? selectedProjectId : null;
  return (
    <Screen title={copy("Araçlar", "Tools")}>
      {!machine ? (
        <Empty
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      ) : (
        <>
          <Scope allowAll />
          <SearchField
            label={copy("Araçlarda ara", "Search tools")}
            value={search}
            onChangeText={setSearch}
          />
          <ToolDirectory projectId={projectId} query={search} />
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
      <Screen title={title}>
        <Empty
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      </Screen>
    );
  const screens: Record<ManagementSection, ComponentType> = {
    tasks: TasksScreen,
    goals: GoalsScreen,
    crews: CrewsScreen,
    automations: AutomationsScreen,
    notes: NotesScreen,
    inbox: InboxScreen,
    social: SocialScreen,
    stewards: StewardsScreen,
  };
  const Component = isManagementSection(section) ? screens[section] : undefined;
  return Component ? (
    <Component key={`${machine.id}:${section}`} />
  ) : (
    <Screen title={title}>
      <Empty title={copy("Bölüm bulunamadı", "Section not found")} />
    </Screen>
  );
}
