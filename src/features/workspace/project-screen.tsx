import { IssueSummary } from "@/ui/issue-summary";
import { WorkspaceFrame } from "@/ui/workspace-frame";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import type { ProjectScreenProps, ProjectWorktrees } from "./project-screen-types";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { rememberOpenedProject } from "@/state/project-directory-preferences";
import { ScrollView, View } from "react-native";
import Search from "lucide-react-native/icons/search";
import Plus from "lucide-react-native/icons/plus";
import { useScreenChrome } from "@/ui/layout";
import { BrandTitle } from "@/ui/brand";
import { MachineConnectionStatus } from "@/ui/machine-bar";
import type { ProjectSessionControls } from "./sessions-panel-types";
import Grid2x2 from "lucide-react-native/icons/grid-2x2";
import GitBranch from "lucide-react-native/icons/git-branch";
import { router, Stack } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import {
  ActionMenu,
  IconButton,
  ScreenHeading,
  Body,
  Button,
  Row,
  SearchField,
  Section,
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
import { ProjectIcon } from "@/ui/project-icon";
import { WorktreeCreate } from "./worktree-create";
import { SubmoduleView } from "./submodule-view";
import { PrivateContentAccessProvider, PrivateContentBoundary } from "@/ui/private-content";

export function ProjectScreen({
  id,
  initialCwd,
  initialSegment = "sessions",
  initialCreateSession = false,
}: ProjectScreenProps) {
  useMobileTheme();
  const copy = useCopy();
  const { nativeTitle } = useScreenChrome();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const visibleProject = projects.data?.find((value) => value.id === id);
  const retainedProject = useRef<{ machineId: string; id: string; value: NonNullable<typeof visibleProject> } | undefined>(undefined);
  if (machine && visibleProject) retainedProject.current = { machineId: machine.id, id, value: visibleProject };
  const rememberedProject = retainedProject.current;
  const project = visibleProject ?? (rememberedProject && rememberedProject.machineId === machine?.id && rememberedProject.id === id ? rememberedProject.value : undefined);
  useEffect(() => {
    if (machine?.id && project?.id) void rememberOpenedProject(machine.id, project.id);
  }, [machine?.id, project?.id]);
  const [view, dispatch] = useReducer(projectViewReducer, {
    segment: initialSegment,
    cwd: initialCwd,
    pickingWorktree: false,
  });
  const { segment, cwd, file: fileToOpen } = view;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [createWorktreeOpen, setCreateWorktreeOpen] = useState(false);
  const [submodulesOpen, setSubmodulesOpen] = useState(false);
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
      if (!projects.isProjectVisible(id)) throw new Error("The selected project is no longer available.");
      createSessionInitially.current = false;
      change();
    });
  };
  const worktrees = useHostQuery<ProjectWorktrees>(
    ["worktrees", id],
    "git.worktrees",
    { projectId: id },
    { enabled: !!visibleProject && (segment !== "sessions" || createWorktreeOpen || worktreeOpen), queryFn: async (client, signal) => {
      if (!projects.isProjectVisible(id)) throw new Error("The selected project is no longer available.");
      const value = await client.request<ProjectWorktrees>("git.worktrees", { projectId: id }, { signal });
      if (!projects.isProjectVisible(id)) throw new Error("The selected project is no longer available.");
      return value;
    } },
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
    (!!cwd || machine?.capabilities?.includes("git.worktreeCreate") || (worktrees.data?.worktrees ?? []).some((tree) => !tree.missing && !tree.isMain));
  const projectFeedback = (
    <>
      <ProjectDirectoryFeedback query={projects} readiness={projects.readiness}
        privacyUnavailable={projects.privacyUnavailable}
        loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")}
        empty={projects.directoryReady
          ? copy("Bu bilgisayarda proje bulunamadı.", "Project not found on this computer.")
          : undefined} />
      <Button
        label={copy("Projelere dön", "Back to projects")}
        tone="quiet"
        density="compact"
        onPress={() => router.replace("/")}
      />
    </>
  );
  const canUseProject = () => !!machine && useMachines.getState().activeId === machine.id && projects.isProjectVisible(id) && !changingWorkspace;
  const renderWorkspace = (content: ReactNode, sessionControls?: ProjectSessionControls) => {
    if (!project || !machine) return content;
    const headerActions = <PrivateContentAccessProvider value={{ allowed: !!visibleProject, check: canUseProject }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
      {sessionControls ? <>
        <IconButton label={copy("Oturum ara", "Search sessions")} expanded={sessionControls.searchOpen}
          tone="default" onPress={sessionControls.toggleSearch}>
          <Search size={20} color={sessionControls.hasSearch ? colors.accent : colors.muted} />
        </IconButton>
        <IconButton label={copy("Yeni oturum", "New session")} disabled={sessionControls.createDisabled}
          onPress={sessionControls.create}><Plus size={20} color={colors.accent} /></IconButton>
      </> : null}
      <ActionMenu
            label={copy("Proje seçenekleri", "Project options")}
            active={!!cwd || !!sessionControls?.archived}
            actions={[
            sessionControls ? { key: "archive", label: sessionControls.archived ? copy("Etkin oturumlar", "Active sessions") : copy("Arşiv", "Archive"),
              selected: sessionControls.archived, onPress: sessionControls.toggleArchived } : false,
            sessionControls ? { key: "refresh", label: copy("Yenile", "Refresh"), disabled: sessionControls.refreshing,
              onPress: sessionControls.refresh } : false,
              { key: "submodules", label: copy("Başlatılmış submodule’ler", "Initialized submodules"), disabled: changingWorkspace, onPress: () => { if (canUseProject()) setSubmodulesOpen(true); } },
              {
                key: "tools",
                label: copy("Proje araçları", "Project tools"),
                icon: <Grid2x2 size={17} color={colors.muted} />,
                disabled: changingWorkspace,
                onPress: () => { if (canUseProject()) setToolsOpen(true); },
              },
              canPickWorktree
                ? {
                    key: "worktree",
                    label: copy("Çalışma klasörü", "Working folder"),
                    detail: cwd ?? project.cwd,
                    icon: <GitBranch size={17} color={colors.muted} />,
                    disabled: changingWorkspace || worktrees.isPending,
                    onPress: () => { if (canUseProject()) setWorktreeOpen(true); },
                  }
                : false,
            ]}
          />
      </View>
    </PrivateContentAccessProvider>;
    return <>
      <Stack.Screen options={{ title: visibleProject?.name || copy("Proje", "Project"),
        headerTitle: () => <BrandTitle title={visibleProject?.name || copy("Proje", "Project")} />,
        headerRight: nativeTitle && !!visibleProject ? () => headerActions : undefined }} />
      <WorkspaceFrame toolbar={<>
        {!nativeTitle ? <ScreenHeading context={<BrandTitle title={project.name} />} actions={headerActions} /> : null}
        <Row style={{ flexWrap: "nowrap", gap: space.xs }}>
          <ProjectIcon appearance={project.appearance} size={16} />
          <Body muted numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.caption, uiStyles.grow]}>
            {[machine.name, cwd ?? project.cwd].join(" · ")}
          </Body>
        </Row>
        <MachineConnectionStatus />
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
      </>} feedback={(segment !== "sessions" && projects.error) || (!worktreeOpen && !toolsOpen && changeAction.error) || (segment !== "sessions" && !worktreeOpen && worktrees.error) ? <IssueSummary
        issues={[
          segment !== "sessions" && projects.error ? copy("Projeler", "Projects") : null,
          !worktreeOpen && !toolsOpen && changeAction.error ? copy("Proje görünümü", "Project view") : null,
          segment !== "sessions" && !worktreeOpen && worktrees.error ? copy("Çalışma klasörü", "Working folder") : null,
        ]}
        details={<>
          {segment !== "sessions" && projects.error ? <Section title={copy("Projeler", "Projects")}><QueryState query={projects} /></Section> : null}
          {!worktreeOpen && !toolsOpen && changeAction.error ? <Section title={copy("Proje görünümü", "Project view")}><MutationState mutation={changeAction} /></Section> : null}
          {segment !== "sessions" && !worktreeOpen && worktrees.error ? <Section title={copy("Çalışma klasörü", "Working folder")}><QueryState query={worktrees} loading="none" /></Section> : null}
        </>}
      /> : null}>
        {content}
      </WorkspaceFrame>
    </>;
  };
  return (
    <Screen scroll={!project}>
      {!visibleProject ? <Stack.Screen options={{ title: copy("Proje", "Project"), headerTitle: undefined, headerRight: undefined }} /> : null}
      {project && !visibleProject ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.screen,
          gap: space.md, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
          {projectFeedback}
        </ScrollView>
      ) : null}
      <PrivateContentBoundary visible={!project || !!visibleProject} isAllowed={() => !project || projects.isProjectVisible(id)}>
      {!machine ? (
        <Empty title={copy("Bilgisayara bağlan", "Connect to a computer")} />
      ) : !project ? (
        projectFeedback
      ) : (
        <>
          {segment === "sessions" ? (
            <ProjectSessions
              key={`sessions:${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              projectName={project.name}
              projectCwd={cwd ?? project.cwd}
              canReadProject={() => projects.isProjectVisible(id)}
              cwd={cwd}
              initialCreating={createSessionInitially.current}
              sessionLayout={project.sessionLayout}
              directoryQuery={projects}
              renderFrame={renderWorkspace}
            />
          ) : segment === "files" ? renderWorkspace(
            <ProjectFiles
              key={`files:${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              cwd={cwd}
              root={cwd ?? project?.cwd}
              initialPath={fileToOpen}
              onClearInitialPath={() => dispatch({ type: "close-file" })}
              onDraftGuard={registerDraftGuard}
            />
          ) : renderWorkspace(
            <ProjectGit
              key={`git:${machine.id}:${id}:${cwd ?? ""}`}
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
            <QueryState query={worktrees} loading="inline" />
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
            <Button tone="quiet" label={copy("Worktree oluştur", "Create worktree")} disabled={changingWorkspace || !machine.capabilities?.includes("git.worktreeCreate")}
              onPress={() => { setWorktreeOpen(false); setCreateWorktreeOpen(true); }} />
          </Sheet>
          <WorktreeCreate key={`worktree-create:${machine.id}:${id}:${cwd ?? ""}`} scope={{ machineId: machine.id, projectId: id, ...(cwd ? { cwd } : {}) }} visible={createWorktreeOpen} blocked={changingWorkspace}
            beforeChange={async () => { await beforeChange.current?.(); }}
            onSelect={(path) => { createSessionInitially.current = false; dispatch({ type: "worktree", cwd: path }); }} onClose={() => setCreateWorktreeOpen(false)} />
          {submodulesOpen ? <SubmoduleView key={`submodules:${machine.id}:${id}:${cwd ?? ""}`} machineId={machine.id} projectId={id} cwd={cwd ?? project.cwd} onClose={() => setSubmodulesOpen(false)} /> : null}
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
              onClearSearch={() => setToolSearch("")}
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
      </PrivateContentBoundary>
    </Screen>
  );
}
