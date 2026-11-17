import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import {
  rememberOpenedProject,
  useProjectDirectoryPreferences,
} from "@/state/project-directory-preferences";
import { useLocale } from "@/i18n";
import Mic from "lucide-react-native/icons/mic";
import {
  Body,
  Button,
  IconButton,
  NavigationRow,
  ScreenList,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { ScreenChromeProvider } from "@/ui/layout";
import { ProjectIcon } from "@/ui/project-icon";
import { matchesSearch } from "@/ui/search-matching";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { matchLaunchProject, useLaunchRequest } from "../sharing/model/launch-request";
import { appendToDraft } from "./draft-append";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { projectPathLabel } from "./project-directory";
import { latestProjectActivity } from "./project-summaries";
import { useAppPreferences } from "../navigation-prefs/app-preferences";
import { lastUsedProject, orderProjectsByRecency, projectRecency, RECENT_PROJECT_LIMIT } from "./recent-projects";
import { CommandError, relativeTime } from "./shared";
import { providerName } from "./provider-choices";
import { useCreateSession } from "./use-create-session";
import { useLatestCallback } from "./use-latest-callback";
import { useProjectActivity } from "./use-project-activity";

/** Prepare a session in a visible project, then start it explicitly. */
export function NewSessionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <NewSessionOpening onClose={onClose} /> : null;
}

type Picked = { project: HostProject; machineId: string; attempt: number };

function NewSessionOpening({ onClose }: { onClose: () => void }) {
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
    appPrefs.newSessionUsesLastProject && readable && machine
      ? lastUsedProject(ordered, times)
      : undefined;
  // A prompt link or share may name the project; it is only preselected, never started.
  const launch = useLaunchRequest((state) => state.request);
  const linked = readable && machine ? matchLaunchProject(ordered, launch?.project) : undefined;
  const current: Picked | undefined =
    picked ??
    (linked && machine
      ? { project: linked, machineId: machine.id, attempt: 0 }
      : last && machine
        ? { project: last, machineId: machine.id, attempt: 0 }
        : undefined);
  const selected =
    current &&
    current.machineId === machine?.id &&
    ordered.some((project) => project.id === current.project.id)
      ? current
      : undefined;

  const created = useLatestCallback((project: HostProject, sessionId: string) => {
    const machineId = machine?.id;
    if (!machineId || useMachines.getState().activeId !== machineId) return;
    useMachines.getState().selectProject(project.id);
    void rememberOpenedProject(machineId, project.id).catch(() => {});
    // Shared or linked content goes into the new session's composer draft (appended, so an
    // existing draft is kept) and is never sent.
    const shared = useLaunchRequest.getState().take();
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
  });
  // Leaving without starting a session drops the queued content; starting one consumes it.
  const leave = () => {
    useLaunchRequest.getState().clear();
    onClose();
  };
  const close = () => {
    if (!locked) leave();
  };
  const addProject = () => {
    leave();
    router.push("/");
  };
  const feedback = {
    query: { ...activity.projects, refetch: activity.refetch },
    readiness: activity.readiness,
    privacyUnavailable: activity.privacyUnavailable,
    empty: readable && !rows.length,
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

  return (
    <Sheet
      visible
      title={copy("Yeni oturum", "New session")}
      size="form"
      scroll={false}
      dismissible={!locked}
      onClose={close}
    >
      <View style={{ gap: space.sm, flex: 1, paddingHorizontal: space.screen }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField
              label={copy("Proje ara", "Search projects")}
              value={readable ? search : ""}
              editable={readable && !locked}
              onChangeText={setSearch}
            />
          </View>
          <IconButton
            label={copy("Asistan", "Assistant")}
            disabled={locked}
            onPress={() => {
              leave();
              router.push("/assistant");
            }}
          >
            <Mic size={20} color={colors.accent} />
          </IconButton>
        </View>
        {launch ? (
          <Body muted style={uiStyles.caption}>
            {launch.files.length
              ? copy(
                  "Paylaşılan içerik taslağa eklenecek ({p0} dosya).",
                  "Shared content will be added to the draft ({p0} files).",
                  { p0: launch.files.length },
                )
              : copy("Metin taslağa eklenecek.", "The text will be added to the draft.")}
          </Body>
        ) : null}
        {selected ? (
          <QuickStart
            key={`${selected.project.id}:${selected.attempt}`}
            project={selected.project}
            onLocked={setLocked}
            onCreated={(sessionId) => created(selected.project, sessionId)}
          />
        ) : null}
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button
            label={
              showAll ? copy("Son kullanılanlar", "Recent") : copy("Tüm projeler", "All projects")
            }
            tone="quiet"
            disabled={!readable || locked}
            onPress={() => setShowAll(!showAll)}
          />
          <Button
            label={copy("Proje ekle", "Add project")}
            tone="quiet"
            disabled={locked}
            onPress={addProject}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
            <ScreenList
              grouped
              data={rows}
              keyExtractor={(project) => project.id}
              query={feedback.query}
              style={{ backgroundColor: "transparent" }}
              contentContainerStyle={{ paddingStart: 0, paddingEnd: 0 }}
              ListEmptyComponent={<ProjectDirectorySlot {...feedback} />}
              header={
                !query && rows.length ? (
                  <Body muted style={uiStyles.caption}>
                    {showAll
                      ? copy("Tüm projeler", "All projects")
                      : copy("Son kullanılanlar", "Recent")}
                  </Body>
                ) : undefined
              }
              renderItem={({ item }) => {
                const last = projectRecency(item.id, times);
                const busy = locked && selected?.project.id === item.id;
                return (
                  <NavigationRow
                    variant="plain"
                    intent="select"
                    label={item.name}
                    detail={projectPathLabel(item.cwd)}
                    detailEllipsizeMode="middle"
                    icon={<ProjectIcon appearance={item.appearance} />}
                    trailing={
                      last ? (
                        <Body muted style={uiStyles.caption}>
                          {relativeTime(last, copy)}
                        </Body>
                      ) : undefined
                    }
                    busy={busy}
                    disabled={locked && !busy}
                    onPress={() => {
                      if (locked) return;
                      setPicked((current) => ({
                        project: item,
                        machineId: machine!.id,
                        attempt: (current?.attempt ?? 0) + 1,
                      }));
                    }}
                  />
                );
              }}
            />
          </ScreenChromeProvider>
        </View>
      </View>
    </Sheet>
  );
}

/** Starts the session in the picked project with defaults; owns its error and recovery UI. */
function QuickStart({
  project,
  onCreated,
  onLocked,
}: {
  project: HostProject;
  onCreated: (sessionId: string) => void;
  onLocked: (locked: boolean) => void;
}) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const { catalog, command, locked, canStart, create, selection, choices } = useCreateSession(
    project.id,
  );
  const [unavailable, setUnavailable] = useState(false);
  const run = useLatestCallback(() => {
    setUnavailable(false);
    command.reset();
    if (!canStart) {
      setUnavailable(true);
      void catalog.refetch().catch(() => {});
      return;
    }
    void create(onCreated);
  });
  const ready = !catalog.isPending || catalog.fetchStatus === "idle";
  // Keep dismissal and project changes blocked while a command is pending or uncertain.
  useEffect(() => {
    onLocked(locked);
    return () => onLocked(false);
  }, [locked, onLocked]);
  const account = choices.find(
    (choice) =>
      choice.provider === selection.selectedProvider &&
      choice.accountId === selection.selectedAccountId,
  );
  return (
    <View style={{ gap: space.sm }}>
      <Body>{project.name}</Body>
      <Body muted style={uiStyles.caption}>
        {ready && selection.selectedProvider
          ? `${providerName(selection.selectedProvider)} · ${account?.label ?? copy("Varsayılan hesap", "Default account")} · ${selection.selectedModel || "—"} · ${copy("Onay iste", "Ask for approval")}`
          : ready
            ? copy("Kullanılabilir ajan veya model yok.", "No agent or model available.")
            : copy("Model yükleniyor…", "Loading model…")}
      </Body>
      {unavailable ? (
        <Body>
          {copy(
            "Bu bilgisayarda kullanılabilir bir ajan veya model yok.",
            "No agent or model is available on this computer.",
          )}
        </Body>
      ) : null}
      <CommandError
        error={command.error}
        onDismiss={() => command.reset()}
        onRecovered={(receipt) => {
          command.reset();
          onCreated(receipt.sessionId);
        }}
      />
      <Button
        label={copy("Oturumu başlat", "Start session")}
        tone="primary"
        onPress={run}
        disabled={!ready || locked}
        busy={command.isPending}
      />
    </View>
  );
}
