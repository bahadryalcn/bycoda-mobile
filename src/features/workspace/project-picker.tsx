import { useState } from "react";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { NavigationRow, Notice, QueryState, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useProjectList } from "./use-project-directory";

/** Search a growing project directory and continue the original navigation in one tap. */
export function ProjectPicker({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (project: HostProject) => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLocaleLowerCase();
  const visibleProjects = projects.privacyPending ? [] : (projects.data ?? []).filter((project) =>
    `${project.name} ${project.cwd}`.toLocaleLowerCase().includes(normalized));
  return (
    <Sheet visible={visible} title={copy("Proje seçin", "Choose a project")} size="form" scroll={false} onClose={onClose}>
      <ScreenList data={visibleProjects} keyExtractor={(project) => project.id} query={projects}
        header={<>
          <SearchField label={copy("Projelerinde ara", "Search projects")} value={search} onChangeText={setSearch} />
          <QueryState query={projects} empty={!visibleProjects.length && !projects.privacyPending}
            emptyTitle={copy("Aramana uyan proje yok.", "No projects match your search.")} />
          {projects.privacyPending ? <Notice tone="info" message={copy(
            "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
            "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
          )} /> : null}
        </>}
        renderItem={({ item }) => <NavigationRow label={item.name} detail={item.cwd} detailEllipsizeMode="middle"
          onPress={() => {
            if (!machine || useMachines.getState().activeId !== machine.id || projects.privacyPending) return;
            onSelect(item);
          }} />}
      />
    </Sheet>
  );
}
