import { useState } from "react";
import { router } from "expo-router";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { NavigationRow, Notice, QueryState, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useProjectList } from "./use-project-directory";
import { useProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import { projectPathLabel, sortDirectoryProjects } from "./project-directory";
import { GroupedListRow } from "./shared";
import { space } from "@/ui/tokens";
import { ProjectIcon } from "@/ui/project-icon";

/** Search a growing project directory and continue the original navigation in one tap. */
export function ProjectPicker({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (project: HostProject) => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences } = useProjectDirectoryPreferences(machine?.id);
  const projects = useProjectList();
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLocaleLowerCase();
  const visibleProjects = !projects.directoryReady ? [] : sortDirectoryProjects((projects.data ?? []).filter((project) =>
    `${project.name} ${project.cwd}`.toLocaleLowerCase().includes(normalized)), preferences);
  return (
    <Sheet visible={visible} title={copy("Proje seçin", "Choose a project")} size="form" scroll={false} onClose={onClose}>
      <ScreenList grouped data={visibleProjects} keyExtractor={(project) => project.id} query={projects}
        header={<>
          <SearchField label={copy("Projelerinde ara", "Search projects")} value={search} onChangeText={setSearch} />
          <QueryState query={projects} empty={!visibleProjects.length && projects.directoryReady}
            loadingLabel={copy("Projeler yükleniyor…", "Loading projects…")}
            emptyTitle={copy("Aramana uyan proje yok.", "No projects match your search.")} />
          {projects.privacyUnavailable ? <Notice tone="info" message={copy(
            "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
            "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
          )} /> : null}
          {projects.readiness === "waiting" ? <Notice
            message={copy("Bağlantı bekleniyor.", "Waiting for a connection.")}
            action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: () => { onClose(); router.push("/machines"); } }}
          /> : null}
        </>}
        renderItem={({ item, index }) => <GroupedListRow first={index === 0} last={index === visibleProjects.length - 1} inset={space.lg}>
          <NavigationRow variant="plain" label={item.name} detail={projectPathLabel(item.cwd, preferences.fullPaths)} detailEllipsizeMode="middle" detailLines={preferences.fullPaths ? 0 : 1}
          icon={<ProjectIcon appearance={item.appearance} />} onPress={() => {
            if (!machine || useMachines.getState().activeId !== machine.id || !projects.isProjectVisible(item.id)) return;
            onSelect(item);
          }} />
        </GroupedListRow>}
      />
    </Sheet>
  );
}
