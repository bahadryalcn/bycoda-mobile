import type { ProjectScreenProps, ProjectWorktrees } from "./project-screen-types";
import { useCallback, useReducer, useRef } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import {
  Body,
  Button,
  SegmentedControl,
  SelectField,
  Empty,
  Notice,
  MutationState,
  QueryState,
  Screen,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ProjectSessions } from "./sessions-panel";
import { ProjectFiles } from "./files-panel";
import { ProjectGit } from "./git-panel";
import type { DraftGuard } from "./file-editor-types";
import { projectViewReducer } from "./workspace-state";
import { useProjectList } from "./use-project-directory";

export function ProjectScreen({ id, initialCwd }: ProjectScreenProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const project = projects.data?.find((value) => value.id === id);
  const [view, dispatch] = useReducer(projectViewReducer, {
    segment: "sessions",
    cwd: initialCwd,
    pickingWorktree: false,
  });
  const { segment, cwd, file: fileToOpen } = view;
  const changeAction = useAsyncAction<void>();
  const changingWorkspace = changeAction.isPending;
  const beforeChange = useRef<DraftGuard>(null);
  const registerDraftGuard = useCallback((guard: DraftGuard) => {
    beforeChange.current = guard;
  }, []);
  const changeWorkspace = (change: () => void) => {
    void changeAction.run(async () => {
      await beforeChange.current?.();
      change();
    });
  };
  const worktrees = useHostQuery<ProjectWorktrees>(
    ["worktrees", id],
    "git.worktrees",
    { projectId: id },
    { enabled: segment !== "sessions" },
  );
  return (
    <Screen scroll={!project}>
      <Stack.Screen options={{ title: project?.name || copy("Proje", "Project") }} />
      {!machine ? (
        <Empty title={copy("Bilgisayara bağlan", "Connect to a computer")} />
      ) : !project ? (
        <>
          {projects.privacyPending ? (
            <Notice
              tone="info"
              message={copy(
                "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
                "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
              )}
            />
          ) : null}
          <QueryState
            query={projects}
            empty={
              !projects.isPending && !projects.error && !projects.privacyPending
                ? copy("Bu bilgisayarda proje bulunamadı.", "Project not found on this computer.")
                : undefined
            }
          />
          <Button
            label={copy("Projelere dön", "Back to projects")}
            onPress={() => router.replace("/")}
          />
        </>
      ) : (
        <>
          <View
            style={{
              paddingHorizontal: space.screen,
              paddingTop: space.sm,
              paddingBottom: space.sm,
              gap: space.sm,
            }}
          >
            {projects.error ? <QueryState query={projects} /> : null}
            <Body
              muted
              selectable={false}
              numberOfLines={1}
              ellipsizeMode="middle"
              style={uiStyles.caption}
            >
              {project.cwd}
            </Body>
            <SegmentedControl
              label={copy("Proje görünümü", "Project view")}
              value={segment}
              disabled={changingWorkspace}
              options={[
                { value: "sessions", label: copy("Oturumlar", "Sessions") },
                { value: "files", label: copy("Dosyalar", "Files") },
                { value: "git", label: copy("Değişiklikler", "Changes") },
              ]}
              onChange={(value) => {
                if (segment !== value)
                  changeWorkspace(() => dispatch({ type: "segment", segment: value }));
              }}
            />
            <MutationState mutation={changeAction} />
            {segment !== "sessions" && worktrees.error ? (
              <QueryState query={worktrees} loading="none" />
            ) : null}
            {segment !== "sessions" &&
            (cwd ||
              (worktrees.data?.worktrees ?? []).some((tree) => !tree.missing && !tree.isMain)) ? (
              <>
                <SelectField
                  label={copy("Çalışma klasörü", "Working folder")}
                  compact
                  hideLabel
                  value={cwd ?? ""}
                  disabled={changingWorkspace || worktrees.isPending}
                  options={[
                    {
                      value: "",
                      label: copy("Ana proje klasörü", "Main project folder"),
                      detail: project.cwd,
                    },
                    ...(worktrees.data?.worktrees ?? [])
                      .filter((tree) => !tree.missing && !tree.isMain)
                      .map((tree) => ({
                        value: tree.path,
                        label: tree.branch || copy("Ayrı çalışma klasörü", "Worktree"),
                        detail: tree.path,
                      })),
                  ]}
                  onChange={(value) =>
                    changeWorkspace(() =>
                      dispatch({ type: "worktree", ...(value ? { cwd: value } : {}) }),
                    )
                  }
                />
              </>
            ) : null}
          </View>
          {segment === "sessions" ? (
            <ProjectSessions key={`${machine.id}:${id}:${cwd ?? ""}`} projectId={id} cwd={cwd} />
          ) : segment === "files" ? (
            <ProjectFiles
              key={`${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              cwd={cwd}
              root={cwd ?? project?.cwd}
              initialPath={fileToOpen}
              onClearInitialPath={() => dispatch({ type: "close-file" })}
              onDraftGuard={registerDraftGuard}
            />
          ) : (
            <ProjectGit
              key={`${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              cwd={cwd}
              root={cwd ?? project?.cwd}
              onDraftGuard={registerDraftGuard}
              onOpenFile={(path) => {
                dispatch({ type: "open-file", path });
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
