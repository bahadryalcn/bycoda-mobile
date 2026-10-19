import type { ProjectScreenProps, ProjectWorktrees } from "./project-screen-types";
import { useCallback, useReducer, useRef, useState } from "react";
import { View } from "react-native";
import Grid2x2 from "lucide-react-native/icons/grid-2x2";
import GitBranch from "lucide-react-native/icons/git-branch";
import { router, Stack } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import {
  ActionMenu,
  Body,
  Button,
  Row,
  SearchField,
  Sheet,
  SegmentedControl,
  SelectField,
  Empty,
  Notice,
  MutationState,
  QueryState,
  Screen,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ProjectSessions } from "./sessions-panel";
import { ProjectFiles } from "./files-panel";
import { ProjectGit } from "./git-panel";
import type { DraftGuard } from "./file-editor-types";
import { projectViewReducer } from "./workspace-state";
import { useProjectList } from "./use-project-directory";
import { ToolDirectory } from "../management/tool-directory";
import { useMobileTheme } from "@/ui/theme";

export function ProjectScreen({
  id,
  initialCwd,
  initialSegment = "sessions",
  initialCreateSession = false,
}: ProjectScreenProps) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const project = projects.data?.find((value) => value.id === id);
  const [view, dispatch] = useReducer(projectViewReducer, {
    segment: initialSegment,
    cwd: initialCwd,
    pickingWorktree: false,
  });
  const { segment, cwd, file: fileToOpen } = view;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const createSessionInitially = useRef(initialCreateSession);
  const changeAction = useAsyncAction<void>();
  const changingWorkspace = changeAction.isPending;
  const beforeChange = useRef<DraftGuard>(null);
  const registerDraftGuard = useCallback((guard: DraftGuard) => {
    beforeChange.current = guard;
  }, []);
  const changeWorkspace = (change: () => void) => {
    void changeAction.run(async () => {
      await beforeChange.current?.();
      createSessionInitially.current = false;
      change();
    });
  };
  const worktrees = useHostQuery<ProjectWorktrees>(
    ["worktrees", id],
    "git.worktrees",
    { projectId: id },
    { enabled: segment !== "sessions" },
  );
  const worktreeOptions = [
    {
      value: "",
      label: copy("Ana proje klasörü", "Main project folder"),
      detail: project?.cwd,
    },
    ...(worktrees.data?.worktrees ?? [])
      .filter((tree) => !tree.missing && !tree.isMain)
      .map((tree) => ({
        value: tree.path,
        label: tree.branch || copy("Ayrı çalışma klasörü", "Worktree"),
        detail: tree.path,
      })),
  ];
  const canPickWorktree =
    segment !== "sessions" &&
    (!!cwd || (worktrees.data?.worktrees ?? []).some((tree) => !tree.missing && !tree.isMain));
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
              width: "100%",
              maxWidth: metrics.contentWidth,
              alignSelf: "center",
              paddingHorizontal: space.screen,
              paddingTop: space.xs,
              paddingBottom: space.md,
              gap: space.md,
            }}
          >
            {projects.error ? <QueryState query={projects} /> : null}
            <Row style={{ flexWrap: "nowrap" }}>
              <Body
                muted
                selectable={false}
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[uiStyles.caption, uiStyles.grow]}
              >
                {cwd ?? project.cwd}
              </Body>
              <ActionMenu
                label={copy("Proje seçenekleri", "Project options")}
                active={!!cwd}
                actions={[
                  {
                    key: "tools",
                    label: copy("Proje araçları", "Project tools"),
                    icon: <Grid2x2 size={17} color={colors.muted} />,
                    disabled: changingWorkspace,
                    onPress: () => setToolsOpen(true),
                  },
                  canPickWorktree
                    ? {
                        key: "worktree",
                        label: copy("Çalışma klasörü", "Working folder"),
                        detail: cwd ?? project.cwd,
                        icon: <GitBranch size={17} color={colors.muted} />,
                        disabled: changingWorkspace || worktrees.isPending,
                        onPress: () => setWorktreeOpen(true),
                      }
                    : false,
                ]}
              />
            </Row>
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
          </View>
          {segment === "sessions" ? (
            <ProjectSessions
              key={`${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              cwd={cwd}
              initialCreating={createSessionInitially.current}
            />
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
          <Sheet
            visible={worktreeOpen}
            size="compact"
            title={copy("Çalışma klasörü", "Working folder")}
            onClose={() => setWorktreeOpen(false)}
          >
            <SelectField
              label={copy("Çalışma klasörü", "Working folder")}
              value={cwd ?? ""}
              disabled={changingWorkspace || worktrees.isPending}
              options={worktreeOptions}
              onChange={(value) => {
                setWorktreeOpen(false);
                changeWorkspace(() =>
                  dispatch({ type: "worktree", ...(value ? { cwd: value } : {}) }),
                );
              }}
            />
            <MutationState mutation={changeAction} />
          </Sheet>
          <Sheet
            visible={toolsOpen}
            title={copy("Proje araçları", "Project tools")}
            onClose={() => setToolsOpen(false)}
          >
            <SearchField
              label={copy("Araçlarda ara", "Search tools")}
              value={toolSearch}
              onChangeText={setToolSearch}
            />
            <ToolDirectory
              projectId={id}
              query={toolSearch}
              onProjectView={(next) => {
                if (next === segment) setToolsOpen(false);
                else
                  changeWorkspace(() => {
                    setToolsOpen(false);
                    dispatch({ type: "segment", segment: next });
                  });
              }}
              onNavigate={(navigate) =>
                changeWorkspace(() => {
                  setToolsOpen(false);
                  navigate();
                })
              }
            />
            <MutationState mutation={changeAction} />
          </Sheet>
        </>
      )}
    </Screen>
  );
}
