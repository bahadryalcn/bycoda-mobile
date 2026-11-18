import { WorkspaceFrame } from "@/ui/workspace-frame";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import type { ProjectScreenProps, ProjectWorktrees } from "./project-screen-types";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { rememberOpenedProject } from "@/state/project-directory-preferences";
import { ScrollView, Text, View } from "react-native";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import Archive from "lucide-react-native/icons/archive";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Info from "lucide-react-native/icons/info";
import FolderTree from "lucide-react-native/icons/folder-tree";
import Search from "lucide-react-native/icons/search";
import Plus from "lucide-react-native/icons/plus";
import { useScreenChrome } from "@/ui/layout";
import { MachineConnectionStatus } from "@/ui/machine-bar";
import type { ProjectSessionControls } from "./sessions-panel-types";
import Grid2x2 from "lucide-react-native/icons/grid-2x2";
import GitBranch from "lucide-react-native/icons/git-branch";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import { router, Stack, type Href } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import {
  IconButton,
  ScreenHeading,
  Button,
  SearchField,
  Sheet,
  SelectField,
  StateView,
  MutationState,
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
import { projectViewReducer } from "./workspace-state";
import { useProjectList } from "./use-project-directory";
import { ToolDirectory } from "../management/tool-directory";
import { useMobileTheme } from "@/ui/theme";
import { ProjectIcon } from "@/ui/project-icon";
import { ProjectSegments } from "./project-segments";
import { ProjectPreferencesTab } from "./project-preferences-tab";
import MessagesSquare from "lucide-react-native/icons/messages-square";
import Folder from "lucide-react-native/icons/folder";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { ProjectMenuSheet, type ProjectMenuSection } from "./project-menu-sheet";
import { ProjectDetailsSheet } from "./project-details-sheet";
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

export function ProjectScreen({
  id,
  initialCwd,
  initialSegment = "sessions",
  initialCreateSession = false,
}: ProjectScreenProps) {
  const { colors, uiStyles } = useMobileTheme();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const canUseProject = () => !!machine && useMachines.getState().activeId === machine.id && projects.isProjectVisible(id) && !changingWorkspace;
  const menuSections = (sessionControls?: ProjectSessionControls): ProjectMenuSection[] => project ? [
    { key: "view", title: copy("Liste", "List"), items: [
      sessionControls ? { key: "archive", label: sessionControls.archived ? copy("Etkin oturumlar", "Active sessions") : copy("Arşiv", "Archive"),
        icon: <Archive size={18} color={colors.muted} />, selected: sessionControls.archived, onPress: sessionControls.toggleArchived } : false,
      sessionControls ? { key: "refresh", label: copy("Yenile", "Refresh"), icon: <RefreshCw size={18} color={colors.muted} />,
        disabled: sessionControls.refreshing, onPress: sessionControls.refresh } : false,
    ] },
    { key: "project", title: copy("Proje", "Project"), items: [
      { key: "details", label: copy("Proje ayrıntıları", "Project details"),
        icon: <Info size={18} color={colors.muted} />, onPress: () => setDetailsOpen(true) },
      { key: "tools", label: copy("Proje araçları", "Project tools"), icon: <Grid2x2 size={18} color={colors.muted} />,
        disabled: changingWorkspace, onPress: () => { if (canUseProject()) setToolsOpen(true); } },
      { key: "submodules", label: copy("Başlatılmış submodule’ler", "Initialized submodules"), icon: <GitBranch size={18} color={colors.muted} />,
        disabled: changingWorkspace, onPress: () => { if (canUseProject()) setSubmodulesOpen(true); } },
    ] },
    { key: "folder", title: copy("Çalışma klasörü", "Working folder"), items: [
      canPickWorktree ? { key: "worktree", label: cwd ? copy("Ayrı çalışma klasörü", "Worktree") : copy("Ana proje klasörü", "Main project folder"),
        detail: cwd ?? project.cwd, icon: <FolderTree size={18} color={colors.muted} />,
        disabled: changingWorkspace || worktrees.isPending, onPress: () => { if (canUseProject()) setWorktreeOpen(true); } } : false,
    ] },
  ] : [];
  const renderWorkspace = (content: ReactNode, sessionControls?: ProjectSessionControls) => {
    if (!project || !machine) return content;
    const headerActions = <PrivateContentAccessProvider value={{ allowed: !!visibleProject, check: canUseProject }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <IconButton label={copy("Pull request’ler", "Pull requests")} onPress={() => { if (canUseProject()) router.push(`/pull-requests?projectId=${encodeURIComponent(id)}&machineId=${encodeURIComponent(machine.id)}` as Href); }}>
        <GitPullRequest color={colors.muted} />
      </IconButton>
      {sessionControls ? (
        <IconButton label={copy("Oturum ara", "Search sessions")} expanded={sessionControls.searchOpen}
          tone="default" onPress={sessionControls.toggleSearch}>
          <Search size={18} color={sessionControls.hasSearch ? colors.accent : colors.muted} />
        </IconButton>
      ) : null}
      <IconButton label={copy("Proje seçenekleri", "Project options")} expanded={menuOpen}
        onPress={() => { if (canUseProject()) setMenuOpen(true); }}>
        <MoreHorizontal size={20} color={cwd || sessionControls?.archived ? colors.accent : colors.muted} />
      </IconButton>
      {sessionControls ? (
        <IconButton label={copy("Yeni oturum", "New session")} tone="default"
          disabled={sessionControls.createDisabled} onPress={sessionControls.create}>
          <Plus size={20} strokeWidth={2} color={colors.accent} />
        </IconButton>
      ) : null}
      </View>
    </PrivateContentAccessProvider>;
    return <>
      <Stack.Screen options={{ title: visibleProject?.name || copy("Proje", "Project"),
        headerTitle: () => <ProjectTitle name={visibleProject?.name || copy("Proje", "Project")} appearance={visibleProject?.appearance} onPress={() => { if (canUseProject()) setDetailsOpen(true); }} />,
        headerRight: nativeTitle && !!visibleProject ? () => headerActions : undefined }} />
      <WorkspaceFrame toolbar={<>
        {!nativeTitle ? <ScreenHeading context={<ProjectTitle name={project.name} appearance={project.appearance} onPress={() => { if (canUseProject()) setDetailsOpen(true); }} />} actions={headerActions} /> : null}
        <MachineConnectionStatus />
        <ProjectSegments
          label={copy("Proje görünümü", "Project view")}
          value={segment}
          disabled={changingWorkspace}
          options={[
            { value: "sessions", label: copy("Oturumlar", "Sessions"), icon: MessagesSquare },
            { value: "files", label: copy("Dosyalar", "Files"), icon: Folder },
            { value: "git", label: copy("Değişiklikler", "Changes"), icon: GitBranch },
            { value: "preferences", label: copy("Ayarlar", "Settings"), icon: SlidersHorizontal },
          ]}
          onChange={(value) => {
            if (segment !== value)
              changeWorkspace(() => dispatch({ type: "segment", segment: value }));
          }}
        />
      </>} feedback={!worktreeOpen && !toolsOpen && changeAction.error ? <MutationState mutation={changeAction} /> : null}>
        {content}
      </WorkspaceFrame>
      <ProjectMenuSheet visible={menuOpen} sections={menuSections(sessionControls)} onClose={() => setMenuOpen(false)} />
    </>;
  };
  return (
    <Screen scroll={false}>
      {!visibleProject ? <Stack.Screen options={{ title: copy("Proje", "Project"), headerTitle: undefined, headerRight: undefined }} /> : null}
      {project && !visibleProject ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.screen, flexGrow: 1,
          gap: space.md, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
          {projectFeedback}
        </ScrollView>
      ) : null}
      <PrivateContentBoundary visible={!project || !!visibleProject} isAllowed={() => !project || projects.isProjectVisible(id)}>
      {!machine ? (
        <StateView
          illustration="connect-computer"
          title={copy("Bilgisayara bağlan", "Connect to a computer")}
          description={copy("Projeyi açmak için bir bilgisayar bağla.", "Connect a computer to open this project.")}
          action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.push("/machines") }}
        />
      ) : !project ? (
        <View style={{ flex: 1, padding: space.screen, gap: space.md,
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
            />
          ) : segment === "preferences" ? renderWorkspace(
            <ProjectPreferencesTab sections={menuSections().filter((section) => section.key !== "view")} />
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

          <ProjectDetailsSheet visible={detailsOpen} project={{ ...project, cwd: cwd ?? project.cwd }} machineName={machine.name}
            onClose={() => setDetailsOpen(false)} />
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
