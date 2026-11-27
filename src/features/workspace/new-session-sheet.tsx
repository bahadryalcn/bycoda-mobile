import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { HostProject } from "@/domain/types";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useSingleFlight } from "@/state/actions";
import { useModelCatalog } from "@/state/model-catalog";
import {
  rememberOpenedProject,
  useProjectDirectoryPreferences,
} from "@/state/project-directory-preferences";
import { useLocale } from "@/i18n";
import Plus from "lucide-react-native/icons/plus";
import {
  Body,
  Button,
  IconButton,
  NavigationRow,
  ScreenList,
  SearchField,
  SegmentedControl,
  Sheet,
} from "@/ui/primitives";
import { ScreenChromeProvider } from "@/ui/layout";
import { ProjectIcon } from "@/ui/project-icon";
import { matchesSearch } from "@/ui/search-matching";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { matchLaunchProject, useLaunchRequest, type LaunchRequest } from "../sharing/model/launch-request";
import { appendToDraft } from "./draft-append";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { projectPathLabel } from "./project-directory";
import { latestProjectActivity } from "./project-summaries";
import { useAppPreferences } from "../navigation-prefs/app-preferences";
import { lastUsedProject, orderProjectsByRecency, projectRecency, RECENT_PROJECT_LIMIT } from "./recent-projects";
import { CommandError, relativeTime } from "./shared";
import type { CreationDraft, RuntimeMode } from "./creation-selection";
import { PermissionField } from "./agent-option-icons";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { ModelPickerField } from "./model-picker-field";
import { selectedChoice } from "./provider-choices";
import { rememberedDraft, lastCreationChoices, useLastCreationChoice } from "./last-creation-choice";
import { useCreateSession } from "./use-create-session";
import { useLatestCallback } from "./use-latest-callback";
import { useProjectActivity } from "./use-project-activity";

/** Where a project screen opens the editor: that project (and its worktree folder) is fixed. */
export type NewSessionProject = { id: string; cwd?: string };

/**
 * The one new-session editor. Prepare a session in a visible project, then start it explicitly.
 * The dock and Sessions tab let the person pick a project; a project screen passes `project` so
 * the same model and permission controls open with that project preselected.
 */
export function NewSessionSheet({ visible, project, onClose }: { visible: boolean; project?: NewSessionProject; onClose: () => void }) {
  return visible ? <NewSessionOpening project={project} onClose={onClose} /> : null;
}

type Picked = { id: string; attempt: number };

function NewSessionOpening({ project, onClose }: { project?: NewSessionProject; onClose: () => void }) {
  const connection = useConnectionScope();
  const [firstConnection] = useState(connection.token);
  return <NewSessionConnection key={connection.token} connection={connection} onClose={onClose} fixed={project}
    allowAutomaticSelection={connection.token === firstConnection} />;
}

function NewSessionConnection({ connection, allowAutomaticSelection, fixed, onClose }: {
  connection: ConnectionScope; allowAutomaticSelection: boolean; fixed?: NewSessionProject; onClose: () => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors, uiStyles } = useMobileTheme();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const { preferences } = useProjectDirectoryPreferences(machine?.id);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Picked>();
  const [locked, setLocked] = useState(false);
  const mounted = useRef(false);
  const finished = useRef(false);
  // Retire retained Sheet and Start handlers when this picker leaves the screen.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = () => mounted.current && !finished.current && connection.isCurrent();
  const readable = activity.directoryReady && !activity.privacyPending;
  const query = search.trim();
  const times = { activity: latestProjectActivity(activity.directory), opened: preferences.recent };
  const ordered = !readable
    ? []
    : orderProjectsByRecency(activity.projects.data ?? [], {
        ...times,
        isVisible: activity.projects.isProjectVisible,
      });
  const rows = query
    ? ordered.filter((project) => matchesSearch(`${project.name} ${project.cwd}`, query, locale))
    : showAll
      ? ordered
      : ordered.slice(0, RECENT_PROJECT_LIMIT);
  // With "new sessions use the last project", the newest project is ready until another is picked.
  const { preferences: appPrefs } = useAppPreferences();
  const last =
    allowAutomaticSelection && appPrefs.newSessionUsesLastProject && readable && machine
      ? lastUsedProject(ordered, times)
      : undefined;
  // A prompt link or share may name the project; it is only preselected, never started.
  const launch = useLaunchRequest((state) => state.request);
  const linked = allowAutomaticSelection && readable && machine ? matchLaunchProject(ordered, launch?.project) : undefined;
  const fixedProject = fixed && readable
    ? (activity.projects.data ?? []).find((item) => item.id === fixed.id && activity.projects.isProjectVisible(item.id, item.cwd))
    : undefined;
  const project = fixed ? fixedProject : picked ? ordered.find((item) => item.id === picked.id) : linked ?? last;
  const selected = project ? { project, attempt: picked?.attempt ?? 0 } : undefined;

  const created = (project: HostProject, sessionId: string, reviewedLaunch: LaunchRequest | null) => {
    const machineId = machine?.id;
    if (!machineId || !isCurrent() || !activity.projects.isProjectVisible(project.id, project.cwd)) return;
    finished.current = true;
    useMachines.getState().selectProject(project.id);
    void rememberOpenedProject(machineId, project.id).catch(() => {});
    // Shared or linked content goes into the new session's composer draft (appended, so an
    // existing draft is kept) and is never sent.
    const pending = useLaunchRequest.getState();
    const shared = pending.request === reviewedLaunch ? pending.take() : null;
    if (shared) {
      const target = { machineId, sessionId };
      if (shared.text) appendToDraft(target, { text: shared.text });
      for (const file of shared.files) appendToDraft(target, { file });
    }
    router.navigate({
      pathname: "/session/[id]",
      params: { id: sessionId, projectId: project.id, machineId },
    });
    onClose();
  };
  // Leaving discards the shown request. A newer share remains available for its own launch.
  const leave = () => {
    if (!isCurrent()) return false;
    finished.current = true;
    const pending = useLaunchRequest.getState();
    if (pending.request === launch) pending.clear();
    onClose();
    return true;
  };
  const close = () => {
    if (!locked) leave();
  };
  // "Add project" opens the folder browser here and returns with the new project selected.
  const [adding, setAdding] = useState(false);
  const openProject = useHostMutation<HostProject>("projects.open", ["projects"]);
  const addProject = () => {
    if (!isCurrent() || locked) return;
    openProject.reset();
    setAdding(true);
  };
  const openFolder = (cwd: string) => {
    if (!isCurrent() || openProject.isPending) return;
    void openProject.mutateAsync({ cwd }).then((opened) => {
      if (!isCurrent()) return;
      setAdding(false);
      setSearch("");
      setPicked((current) => ({ id: opened.id, attempt: (current?.attempt ?? 0) + 1 }));
    }, () => {
      // The mutation owns failure feedback inside the folder browser.
    });
  };
  const browser = adding ? (
    <ProjectFolderBrowser onClose={() => setAdding(false)} mutation={openProject} onOpen={openFolder} />
  ) : null;
  const feedback = {
    query: { ...activity.projects, refetch: activity.refetch },
    readiness: activity.readiness,
    privacyUnavailable: activity.privacyUnavailable,
    empty: readable && !rows.length,
    noResults: { compact: true, searching: !!query, title: copy("Aramana uyan proje yok.", "No projects match your search."), onClearSearch: () => setSearch("") },
    loadingLabel: copy("Projeler yükleniyor…", "Loading projects…"),
    emptyTitle: query
      ? copy("Aramana uyan proje yok.", "No projects match your search.")
      : copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet."),
    emptyDetail: query
      ? undefined
      : copy(
          "Önce bir proje ekle, sonra oturum başlat.",
          "Add a project first, then start a session in it.",
        ),
    emptyIllustration: query ? ("search-empty" as const) : ("no-projects" as const),
    emptyAction: query
      ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => setSearch("") }
      : { label: copy("Proje ekle", "Add project"), onPress: addProject },
  };

  if (fixed) {
    return (
      <Sheet
        visible
        title={copy("Yeni oturum", "New session")}
        size="compact"
        dismissible={!locked}
        onClose={close}
      >
        {fixedProject ? (
          <QuickStart
            project={fixedProject}
            cwd={fixed.cwd}
            showProjectName
            onLocked={setLocked}
            isCurrent={isCurrent}
            onCreated={(sessionId) => created(fixedProject, sessionId, launch)}
          />
        ) : (
          <ProjectDirectorySlot
            query={feedback.query}
            readiness={feedback.readiness}
            privacyUnavailable={feedback.privacyUnavailable}
            loadingLabel={feedback.loadingLabel}
            empty={readable}
            emptyTitle={copy("Bu proje bu bilgisayarda bulunamadı.", "This project was not found on this computer.")}
          />
        )}
      </Sheet>
    );
  }

  return (
    <>
    <Sheet
      visible
      title={copy("Yeni oturum", "New session")}
      size="compact"
      scroll={false}
      dismissible={!locked}
      onClose={close}
      footer={selected ? (
        <QuickStart
          key={`${selected.project.id}:${selected.attempt}`}
          project={selected.project}
          showProjectName={!rows.some((row) => row.id === selected.project.id)}
          onLocked={setLocked}
          isCurrent={isCurrent}
          onCreated={(sessionId) => created(selected.project, sessionId, launch)}
        />
      ) : undefined}
    >
      <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
        <ScreenList
          grouped
          data={rows}
          keyExtractor={(project) => project.id}
          query={feedback.query}
          style={{ flex: 0, flexShrink: 1, backgroundColor: "transparent" }}
          contentContainerStyle={{ flexGrow: 0, paddingStart: space.screen, paddingEnd: space.screen }}
          ListEmptyComponent={<ProjectDirectorySlot {...feedback} />}
          ListHeaderComponent={
            <View style={{ gap: space.sm, paddingTop: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <SearchField
                    label={copy("Proje ara", "Search projects")}
                    value={readable ? search : ""}
                    editable={readable && !locked}
                    onChangeText={setSearch}
                  />
                </View>
                {rows.length > 0 || query ? (
                  <IconButton
                    label={copy("Proje ekle", "Add project")}
                    disabled={locked}
                    onPress={addProject}
                  >
                    <Plus size={20} color={colors.accent} />
                  </IconButton>
                ) : null}
              </View>
              {launch ? (
                <Body muted style={uiStyles.caption}>
                  {launch.files.length === 1
                    ? copy(
                        "Paylaşılan içerik taslağa eklenecek (1 dosya).",
                        "Shared content will be added to the draft (1 file).",
                      )
                    : launch.files.length
                      ? copy(
                          "Paylaşılan içerik taslağa eklenecek ({p0} dosya).",
                          "Shared content will be added to the draft ({p0} files).",
                          { p0: launch.files.length },
                        )
                      : copy("Metin taslağa eklenecek.", "The text will be added to the draft.")}
                </Body>
              ) : null}
              {!allowAutomaticSelection && !selected && readable ? (
                <Body muted style={uiStyles.caption}>
                  {copy("Bilgisayar bağlantısı değişti.", "Computer connection changed.")}
                </Body>
              ) : null}
              <SegmentedControl
                label={copy("Projeler", "Projects")}
                hideLabel
                value={showAll ? "all" : "recent"}
                options={[
                  { value: "recent", label: copy("Son kullanılanlar", "Recent") },
                  { value: "all", label: copy("Tüm projeler", "All projects") },
                ]}
                disabled={!readable || locked}
                onChange={(next) => setShowAll(next === "all")}
              />
            </View>
          }
          renderItem={({ item }) => {
            const last = projectRecency(item.id, times);
            const isSelected = selected?.project.id === item.id;
            const busy = locked && isSelected;
            return (
              <NavigationRow
                variant="plain"
                intent="select"
                label={item.name}
                detail={projectPathLabel(item.cwd)}
                detailSelectable={false}
                selected={isSelected}
                icon={<ProjectIcon appearance={item.appearance} />}
                trailing={
                  last && !isSelected ? (
                    <Body muted style={uiStyles.caption}>
                      {relativeTime(last, copy)}
                    </Body>
                  ) : undefined
                }
                busy={busy}
                disabled={locked && !busy}
                onPress={() => {
                  if (locked || isSelected || !isCurrent() || !activity.projects.isProjectVisible(item.id, item.cwd)) return;
                  setPicked((current) => ({
                    id: item.id,
                    attempt: (current?.attempt ?? 0) + 1,
                  }));
                }}
              />
            );
          }}
        />
      </ScreenChromeProvider>
    </Sheet>
    {browser}
    </>
  );
}

/** Owns the chosen project's launch settings and command recovery. */
function QuickStart({
  project,
  cwd,
  showProjectName,
  onCreated,
  onLocked,
  isCurrent,
}: {
  project: HostProject;
  /** Worktree folder chosen on the project screen; the main project folder when omitted. */
  cwd?: string;
  showProjectName: boolean;
  onCreated: (sessionId: string) => void;
  onLocked: (locked: boolean) => void;
  isCurrent: () => boolean;
}) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const machine = useActiveMachine();
  const [picked, setPicked] = useState<CreationDraft>();
  // Until the owner picks, start from the last model used on this computer if it is still offered.
  const remembered = rememberedDraft(useLastCreationChoice(machine?.id), useModelCatalog(project.id).data);
  const draft = picked ?? remembered ?? { model: "" };
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("supervised");
  const { catalog, command, locked, canStart, create, selection, choices } = useCreateSession(
    project.id,
    { draft, cwd },
  );
  const submit = useSingleFlight<boolean>();
  const receiptTarget = useRef<typeof onCreated | null>(null);
  const mounted = useRef(false);
  // A recovered receipt can outlive the project selection that started it.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const active = () => mounted.current && isCurrent();
  const run = useLatestCallback(() => {
    if (!active() || locked || submit.isPending()) return;
    command.reset();
    if (!canStart) {
      void catalog.refetch().catch(() => {});
      return;
    }
    const remember = machine && selectedProvider && selectedModel
      ? { machineId: machine.id, choice: { provider: selectedProvider, accountId: selectedAccountId, model: selectedModel } }
      : undefined;
    const complete: typeof onCreated = (id) => {
      if (!active()) return;
      if (remember) void lastCreationChoices.getState().remember(remember.machineId, remember.choice);
      onCreated(id);
    };
    receiptTarget.current = complete;
    void submit.run(() => active() ? create(complete, { settings, runtimeMode }) : Promise.resolve(false)).catch(() => false);
  });
  // A paused (offline) first load is not "loading": it needs a reason and Retry.
  const ready = !catalog.isPending || catalog.fetchStatus !== "fetching";
  // Keep dismissal and project changes blocked while a command is pending or uncertain.
  useEffect(() => {
    onLocked(locked);
    return () => onLocked(false);
  }, [locked, onLocked]);
  const { selectedProvider, selectedAccountId, selectedModel, models } = selection;
  const recoveryTarget = receiptTarget.current;
  return (
    <View style={{ gap: space.sm }}>
      {showProjectName ? <Body>{project.name}</Body> : null}
      {cwd && cwd !== project.cwd ? (
        <Body mono muted selectable style={uiStyles.caption}>{`${copy("Çalışma klasörü:", "Working folder:")} ${cwd}`}</Body>
      ) : null}
      {ready && (selectedProvider || choices.length > 0) ? (
        <ModelPickerField
          hideLabel
          catalog={catalog.data}
          choices={choices}
          choice={selectedChoice(choices, selectedProvider, selectedAccountId)}
          models={models}
          model={selectedModel}
          settings={settings}
          sparseSettings
          disabled={locked}
          onChooseProvider={(next) => {
            if (!active() || locked || submit.isPending()) return;
            const changedProvider = next.provider !== selectedProvider;
            setPicked({ provider: next.provider, accountId: next.accountId, model: changedProvider ? "" : draft.model });
            if (changedProvider) setSettings((previous) => carryCrossDelegation(previous, {}));
          }}
          onChooseModel={(next, model, nextSettings) => {
            if (!active() || locked || submit.isPending()) return;
            setPicked({ provider: next.provider, accountId: next.accountId, model });
            setSettings(nextSettings);
          }}
          onChange={(model, nextSettings) => {
            if (!active() || locked || submit.isPending()) return;
            setPicked({ ...draft, model });
            setSettings(nextSettings);
          }}
        />
      ) : (
        <Body muted>
          {!ready
            ? copy("Model yükleniyor…", "Loading model…")
            : catalog.isPending
              ? copy("Model listesi için bağlantı bekleniyor.", "Waiting for a connection to load models.")
              : catalog.error
                ? copy("Model listesi yüklenemedi.", "Models could not be loaded.")
                : copy("Kullanılabilir ajan veya model yok.", "No agent or model available.")}
        </Body>
      )}
      <PermissionField value={runtimeMode} disabled={locked} onChange={setRuntimeMode} />
      <CommandError
        error={command.error}
        onDismiss={() => {
          if (!active() || receiptTarget.current !== recoveryTarget) return;
          receiptTarget.current = null;
          command.reset();
        }}
        onRecovered={(receipt) => {
          if (!active() || !recoveryTarget || receiptTarget.current !== recoveryTarget) return;
          receiptTarget.current = null;
          command.reset();
          recoveryTarget(receipt.sessionId);
        }}
      />
      <Button
        label={ready && !canStart && !locked
          ? copy("Yeniden dene", "Retry")
          : copy("Oturumu başlat", "Start session")}
        tone="primary"
        fullWidth
        reserveTouchTarget
        onPress={run}
        disabled={!ready || locked}
        busy={command.isPending}
      />
    </View>
  );
}
