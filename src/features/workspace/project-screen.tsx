import { WorkspaceFrame } from "@/ui/workspace-frame";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import type { ProjectScreenProps, ProjectWorktrees } from "./project-screen-types";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { rememberOpenedProject } from "@/state/project-directory-preferences";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { ScrollView, Text, View } from "react-native";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import Archive from "lucide-react-native/icons/archive";
import Info from "lucide-react-native/icons/info";
import FolderTree from "lucide-react-native/icons/folder-tree";
import Plus from "lucide-react-native/icons/plus";
import { useScreenChrome } from "@/ui/layout";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { MachineConnectionStatus } from "@/ui/machine-bar";
import type { ProjectSessionControls } from "./sessions-panel-types";
import Grid2x2 from "lucide-react-native/icons/grid-2x2";
import GitBranch from "lucide-react-native/icons/git-branch";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import { router, Stack, type Href } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import {
  IconButton,
  HeaderBackButton,
  stackBackOptions,
  ScreenHeading,
  Button,
  SearchField,
  Sheet,
  SelectField,
  MutationState,
  Notice,
  PressableCard,
  QueryState,
  Screen,
} from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ProjectSessions } from "./sessions-panel";
import { ProjectFiles } from "./files-panel";
import { ProjectGit } from "./git-panel";
import type { DraftGuard } from "./file-editor-types";
import { DraftWriteError } from "./draft-store";
import { projectViewReducer } from "./workspace-state";
import { useProjectList } from "./use-project-directory";
import { ToolDirectory } from "../management/tool-directory";
import { useMobileTheme } from "@/ui/theme";
import { ProjectIcon } from "@/ui/project-icon";
import { ProjectSegments } from "./project-segments";
import { ProjectMenuSheet, type ProjectMenuSection } from "./project-menu-sheet";
import { ProjectSubpageScope, useProjectSubpageHost } from "./subpage-chrome";
import { ProjectDetailsSheet } from "./project-details-sheet";
import { NoComputerState } from "@/ui/no-computer";
import { WorktreeCreate } from "./worktree-create";
import { SubmoduleView } from "./submodule-view";
import { PrivateContentAccessProvider, PrivateContentBoundary } from "@/ui/private-content";

function ProjectTitle({ name, appearance, onPress }: { name: string; appearance?: Parameters<typeof ProjectIcon>[0]["appearance"]; onPress: () => void }) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  return <PressableCard label={`${name}. ${copy("Proje ayrıntıları", "Project details")}`} onPress={onPress}
    style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0, flexShrink: 1, minHeight: 0, paddingVertical: 0, paddingHorizontal: 0, marginHorizontal: 0 }}>
    <ProjectIcon appearance={appearance} size={20} />
    <Text accessibilityRole="header" numberOfLines={1} style={[uiStyles.title, { flexShrink: 1 }]}>{name}</Text>
  </PressableCard>;
}

type ProjectPanel = "menu" | "details" | "tools" | "worktree" | "create-worktree" | "submodules";

export function ProjectScreen(props: ProjectScreenProps) {
  const connection = useConnectionScope();
  const firstConnection = useRef<string | undefined>(undefined);
  if (connection.review && firstConnection.current === undefined) firstConnection.current = connection.token;
  const initialConnection = firstConnection.current === connection.token;
  return <ProjectWorkspace key={JSON.stringify([connection.token, props.id])} {...props} connection={connection}
    initialCwd={initialConnection ? props.initialCwd : undefined}
    initialCreateSession={initialConnection && props.initialCreateSession} />;
}

function ProjectWorkspace({
  id,
  initialCwd,
  initialSegment = "sessions",
  initialCreateSession = false,
  connection,
}: ProjectScreenProps & { connection: ConnectionScope }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const { nativeTitle } = useScreenChrome();
  const subpageHost = useProjectSubpageHost();
  const { subpage } = subpageHost;
  // Horizontal gutters only: the Screen frame below pads the dock and home indicator for its own children.
  const gutter = useScreenContentInsets();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const visibleProject = projects.data?.find((value) => value.id === id);
  const retainedProject = useRef(visibleProject);
  if (machine && visibleProject) retainedProject.current = visibleProject;
  const project = visibleProject ?? retainedProject.current;
  useEffect(() => {
    if (machine?.id && project?.id) void rememberOpenedProject(machine.id, project.id);
  }, [machine?.id, project?.id]);
  const [view, dispatch] = useReducer(projectViewReducer, {
    segment: initialSegment,
    cwd: initialCwd,
    pickingWorktree: false,
  });
  const { cwd, file: fileToOpen } = view;
  // The retired Settings tab now lives in Project options; a stale link lands on Sessions.
  const segment = view.segment === "preferences" ? "sessions" : view.segment;
  const panelKey = JSON.stringify([connection.token, id, cwd]);
  const committedPanelKey = useRef<string | undefined>(undefined);
  // Retire callbacks from the previous working folder before its panels can run again.
  useLayoutEffect(() => {
    committedPanelKey.current = panelKey;
    return () => { committedPanelKey.current = undefined; };
  }, [panelKey]);
  const projectIsCurrent = () => committedPanelKey.current === panelKey && connection.isCurrent() && projects.isProjectVisible(id);
  const [panel, setPanel] = useState<{ key: string; name: ProjectPanel }>();
  const activePanel = panel?.key === panelKey && visibleProject ? panel.name : undefined;
  const toolsOpen = activePanel === "tools";
  const menuOpen = activePanel === "menu";
  const worktreeOpen = activePanel === "worktree";
  const createWorktreeOpen = activePanel === "create-worktree";
  const hideDraftWriteWarning = worktreeOpen || createWorktreeOpen;
  const [toolSearch, setToolSearch] = useState("");
  const createSessionInitially = useRef(initialCreateSession);
  const changeAction = useAsyncAction<void>();
  const [requestedWorktree, setRequestedWorktree] = useState<string | null>(null);
  const changingWorkspace = changeAction.isPending;
  const beforeChange = useRef<DraftGuard>(null);
  const registerDraftGuard = useCallback((guard: DraftGuard) => {
    beforeChange.current = guard;
  }, []);
  const changeWorkspace = (change: () => void, worktree: string | null = null) => {
    setRequestedWorktree(worktree);
    void changeAction.run(async () => {
      const assertProject = () => {
        if (!projectIsCurrent())
          throw new Error("The selected project is no longer available.");
      };
      assertProject();
      await beforeChange.current?.();
      assertProject();
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
        label: tree.branch || copy("Çalışma ağacı", "Worktree"),
        detail: tree.path,
      })),
  ];
  const canPickWorktree =
    segment !== "sessions" &&
    (!!cwd || machine?.capabilities?.includes("git.worktreeCreate") || (worktrees.data?.worktrees ?? []).some((tree) => !tree.missing && !tree.isMain));
  const projectFeedback = (
    <>
      <ProjectDirectoryFeedback query={projects.error ? { ...projects, data: undefined } : projects} readiness={projects.readiness}
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
  const canUseProject = () => !!machine && projectIsCurrent() && !changingWorkspace;
  const openPanel = (name: ProjectPanel) => {
    if (!canUseProject()) return;
    if (name === "tools") setToolSearch("");
    if (name === "worktree") {
      setRequestedWorktree(null);
      changeAction.reset();
    }
    setPanel({ key: panelKey, name });
  };
  const closePanel = (name: ProjectPanel) => {
    setPanel((current) => current?.key === panelKey && current.name === name ? undefined : current);
  };
  const selectWorktree = (value: string) => {
    if (!worktreeOpen || !canUseProject() || !worktreeOptions.some((option) => option.value === value)) return;
    changeWorkspace(() => {
      dispatch({ type: "worktree", ...(value ? { cwd: value } : {}) });
      closePanel("worktree");
    }, value);
  };
  const menuSections = (sessionControls?: ProjectSessionControls): ProjectMenuSection[] => project ? [
    { key: "view", title: copy("Liste", "List"), items: [
      sessionControls ? { key: "archive", label: sessionControls.archived ? copy("Etkin oturumlar", "Active sessions") : copy("Arşiv", "Archive"),
        icon: <Archive size={18} color={colors.muted} />, selected: sessionControls.archived, onPress: sessionControls.toggleArchived } : false,
    ] },
    { key: "project", title: copy("Proje", "Project"), items: [
      machine ? { key: "pull-requests", label: copy("Pull request’ler", "Pull requests"), icon: <GitPullRequest size={18} color={colors.muted} />,
        onPress: () => { if (canUseProject()) router.push(`/pull-requests?projectId=${encodeURIComponent(id)}&machineId=${encodeURIComponent(machine.id)}` as Href); } } : false,
      { key: "details", label: copy("Proje ayrıntıları", "Project details"),
        icon: <Info size={18} color={colors.muted} />, onPress: () => openPanel("details") },
      { key: "tools", label: copy("Proje araçları", "Project tools"), icon: <Grid2x2 size={18} color={colors.muted} />,
        disabled: changingWorkspace, onPress: () => openPanel("tools") },
      { key: "submodules", label: copy("Başlatılmış submodule’ler", "Initialized submodules"), icon: <GitBranch size={18} color={colors.muted} />,
        disabled: changingWorkspace, onPress: () => openPanel("submodules") },
    ] },
    { key: "folder", title: copy("Çalışma klasörü", "Working folder"), items: [
      canPickWorktree ? { key: "worktree", label: cwd ? copy("Çalışma ağacı", "Worktree") : copy("Ana proje klasörü", "Main project folder"),
        detail: cwd ?? project.cwd, icon: <FolderTree size={18} color={colors.muted} />,
        disabled: changingWorkspace || worktrees.isPending, onPress: () => openPanel("worktree") } : false,
    ] },
  ] : [];
  const renderWorkspace = (content: ReactNode, sessionControls?: ProjectSessionControls) => {
    if (!project || !machine) return content;
    const headerActions = <PrivateContentAccessProvider value={{ allowed: !!visibleProject, check: canUseProject }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <IconButton label={copy("Proje seçenekleri", "Project options")} expanded={menuOpen}
        onPress={() => openPanel("menu")}>
        <MoreHorizontal size={20} color={cwd || sessionControls?.archived ? colors.accent : colors.muted} />
      </IconButton>
      {sessionControls?.showCreateInHeader ? (
        <IconButton label={copy("Yeni oturum", "New session")} tone="default"
          disabled={sessionControls.createDisabled} onPress={sessionControls.create}>
          <Plus size={20} strokeWidth={2} color={colors.accent} />
        </IconButton>
      ) : null}
      </View>
    </PrivateContentAccessProvider>;
    return <>
      <Stack.Screen options={{ title: subpage?.title ?? (visibleProject?.name || copy("Proje", "Project")),
        // An open sub-page (history, a diff, a file, a folder level) lends this one header its title and back.
        headerTitle: subpage ? undefined : () => <ProjectTitle name={visibleProject?.name || copy("Proje", "Project")} appearance={visibleProject?.appearance} onPress={() => openPanel("details")} />,
        headerRight: nativeTitle && !!visibleProject && !subpage ? () => headerActions : undefined,
        ...stackBackOptions(<HeaderBackButton onPress={subpage ? subpage.back : () => router.back()} />) }} />
      <WorkspaceFrame toolbar={<>
        {!nativeTitle ? <ScreenHeading context={<ProjectTitle name={project.name} appearance={project.appearance} onPress={() => openPanel("details")} />} actions={headerActions} /> : null}
        <MachineConnectionStatus />
        {!subpage ? (
          <ProjectSegments
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
        ) : null}
      </>} feedback={requestedWorktree === null && !worktreeOpen && !toolsOpen && changeAction.error ? <MutationState mutation={changeAction} /> : null}>
        {content}
      </WorkspaceFrame>
      <ProjectMenuSheet visible={menuOpen} sections={menuSections(sessionControls)} onClose={() => closePanel("menu")} />
    </>;
  };
  return (
    <ProjectSubpageScope registry={subpageHost.registry}>
    <Screen scroll={false}>
      {!visibleProject ? <Stack.Screen options={{ title: copy("Proje", "Project"), headerTitle: undefined, headerRight: undefined }} /> : null}
      {project && !visibleProject ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.screen, paddingLeft: gutter.left, paddingRight: gutter.right, flexGrow: 1,
          gap: space.md, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
          {projectFeedback}
        </ScrollView>
      ) : null}
      <PrivateContentBoundary visible={!project || !!visibleProject} isAllowed={() => !project || projects.isProjectVisible(id)}>
      {!machine ? (
        <NoComputerState description={copy("Projeyi açmak için bilgisayarını bağla.", "Connect a computer to open this project.")} />
      ) : !project ? (
        <View style={{ flex: 1, paddingVertical: space.screen, paddingLeft: gutter.left, paddingRight: gutter.right, gap: space.md,
          width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
          {projectFeedback}
        </View>
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
              hideDraftWriteWarning={hideDraftWriteWarning}
            />
          ) : renderWorkspace(
            <ProjectGit
              key={`git:${machine.id}:${id}:${cwd ?? ""}`}
              projectId={id}
              cwd={cwd}
              root={cwd ?? project?.cwd}
              onDraftGuard={registerDraftGuard}
              hideDraftWriteWarning={hideDraftWriteWarning}
              onOpenFile={(path) => {
                dispatch({ type: "open-file", path });
              }}
            />
          )}

          <ProjectDetailsSheet visible={activePanel === "details"} project={{ ...project, cwd: cwd ?? project.cwd }} machineName={machine.name}
            onClose={() => closePanel("details")} />
          <Sheet
            visible={worktreeOpen}
            size="compact"
            dismissible={!changingWorkspace}
            title={copy("Çalışma klasörü", "Working folder")}
            onClose={() => closePanel("worktree")}
          >
            <QueryState query={worktrees} loading="inline" />
            <SelectField
              label={copy("Çalışma klasörü", "Working folder")}
              value={cwd ?? ""}
              disabled={changingWorkspace || worktrees.isPending}
              options={worktreeOptions}
              onChange={selectWorktree}
            />
            {changeAction.error instanceof DraftWriteError && requestedWorktree !== null
              ? <Notice tone="warning"
                  message={copy("Taslak kaydedilemedi. Düzenlemelerin açık.", "Couldn’t save the draft. Your edits are still open.")}
                  onRetry={() => selectWorktree(requestedWorktree)} />
              : <MutationState mutation={changeAction} pending={copy("Taslak kaydediliyor…", "Saving draft…")} />}
            <Button tone="quiet" label={copy("Çalışma ağacı oluştur", "Create worktree")} disabled={changingWorkspace || !machine.capabilities?.includes("git.worktreeCreate")}
              onPress={() => openPanel("create-worktree")} />
          </Sheet>
          <WorktreeCreate key={`worktree-create:${panelKey}`} scope={{ machineId: machine.id, projectId: id, ...(cwd ? { cwd } : {}) }} visible={createWorktreeOpen} blocked={changingWorkspace}
            beforeChange={async () => { await beforeChange.current?.(); }}
            onSelect={(path) => { if (canUseProject()) { createSessionInitially.current = false; dispatch({ type: "worktree", cwd: path }); } }} onClose={() => closePanel("create-worktree")} />
          {activePanel === "submodules" ? <SubmoduleView key={`submodules:${panelKey}`} machineId={machine.id} projectId={id} cwd={cwd ?? project.cwd} onClose={() => closePanel("submodules")} /> : null}
          <Sheet
            visible={toolsOpen}
            title={copy("Proje araçları", "Project tools")}
            onClose={() => closePanel("tools")}
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
                if (next === segment) closePanel("tools");
                else
                  changeWorkspace(() => {
                    closePanel("tools");
                    dispatch({ type: "segment", segment: next });
                  });
              }}
              onNavigate={(navigate) =>
                changeWorkspace(() => {
                  closePanel("tools");
                  navigate();
                })
              }
            />
            {requestedWorktree === null ? <MutationState mutation={changeAction} /> : null}
          </Sheet>
        </>
      )}
      </PrivateContentBoundary>
    </Screen>
    </ProjectSubpageScope>
  );
}
