import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { rememberOpenedProject, useProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import { useLocale } from "@/i18n";
import Mic from "lucide-react-native/icons/mic";
import { Body, Button, IconButton, NavigationRow, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { ScreenChromeProvider } from "@/ui/layout";
import { ProjectIcon } from "@/ui/project-icon";
import { matchesSearch } from "@/ui/search-matching";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { projectPathLabel } from "./project-directory";
import { latestProjectActivity } from "./project-summaries";
import { orderProjectsByRecency, projectRecency, RECENT_PROJECT_LIMIT } from "./recent-projects";
import { CommandError, relativeTime } from "./shared";
import { useCreateSession } from "./use-create-session";
import { useLatestCallback } from "./use-latest-callback";
import { useProjectActivity } from "./use-project-activity";

/**
 * Two taps from anywhere: pick one of the recent projects (or search all of them) and a session
 * starts at once with the default provider, model and permission.
 */
export function NewSessionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <NewSessionOpening onClose={onClose} /> : null;
}

type Picked = { project: HostProject; attempt: number };

function NewSessionOpening({ onClose }: { onClose: () => void }) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors, uiStyles } = useMobileTheme();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const { preferences } = useProjectDirectoryPreferences(machine?.id);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked>();
  const [locked, setLocked] = useState(false);
  const readable = activity.directoryReady && !activity.privacyPending;
  const query = search.trim();
  const times = { activity: latestProjectActivity(activity.directory), opened: preferences.recent };
  const ordered = !readable ? [] : orderProjectsByRecency(activity.projects.data ?? [], {
    ...times,
    isVisible: activity.projects.isProjectVisible,
  });
  const rows = query
    ? ordered.filter((project) => matchesSearch(`${project.name} ${project.cwd}`, query, locale))
    : ordered.slice(0, RECENT_PROJECT_LIMIT);

  const created = useLatestCallback((project: HostProject, sessionId: string) => {
    const machineId = machine?.id;
    if (!machineId || useMachines.getState().activeId !== machineId) return;
    useMachines.getState().selectProject(project.id);
    void rememberOpenedProject(machineId, project.id).catch(() => {});
    router.push({ pathname: "/session/[id]", params: { id: sessionId, projectId: project.id, machineId } });
    onClose();
  });
  const close = () => { if (!locked) onClose(); };
  const addProject = () => { onClose(); router.push("/"); };
  const feedback = {
    query: { ...activity.projects, refetch: activity.refetch },
    readiness: activity.readiness,
    privacyUnavailable: activity.privacyUnavailable,
    empty: readable && !rows.length,
    loadingLabel: copy("Projeler yükleniyor…", "Loading projects…"),
    emptyTitle: query
      ? copy("Aramana uyan proje yok.", "No projects match your search.")
      : copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet."),
    emptyDetail: query ? undefined : copy("Önce bir proje ekle, sonra oturum başlat.", "Add a project first, then start a session in it."),
    emptyIllustration: query ? ("search-empty" as const) : ("no-projects" as const),
    emptyAction: query
      ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => setSearch("") }
      : { label: copy("Proje ekle", "Add project"), onPress: addProject },
  };

  return (
    <Sheet visible title={copy("Yeni oturum", "New session")} size="form" scroll={false} dismissible={!locked} onClose={close}>
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
          <IconButton label={copy("Asistan", "Assistant")} disabled={locked} onPress={() => { onClose(); router.push("/assistant"); }}>
            <Mic size={20} color={colors.accent} />
          </IconButton>
        </View>
        {picked ? (
          <QuickStart
            key={`${picked.project.id}:${picked.attempt}`}
            project={picked.project}
            onLocked={setLocked}
            onCreated={(sessionId) => created(picked.project, sessionId)}
          />
        ) : null}
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
              header={!query && rows.length ? (
                <Body muted style={uiStyles.caption}>{copy("Son kullanılanlar", "Recent")}</Body>
              ) : undefined}
              renderItem={({ item }) => {
                const last = projectRecency(item.id, times);
                const busy = locked && picked?.project.id === item.id;
                return (
                  <NavigationRow
                    variant="plain"
                    intent="command"
                    label={item.name}
                    detail={projectPathLabel(item.cwd)}
                    detailEllipsizeMode="middle"
                    icon={<ProjectIcon appearance={item.appearance} />}
                    trailing={last ? <Body muted style={uiStyles.caption}>{relativeTime(last, copy)}</Body> : undefined}
                    busy={busy}
                    disabled={locked && !busy}
                    onPress={() => {
                      if (locked) return;
                      setPicked((current) => ({ project: item, attempt: (current?.attempt ?? 0) + 1 }));
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
function QuickStart({ project, onCreated, onLocked }: {
  project: HostProject;
  onCreated: (sessionId: string) => void;
  onLocked: (locked: boolean) => void;
}) {
  const copy = useCopy();
  const { catalog, command, locked, canStart, create } = useCreateSession(project.id);
  const [unavailable, setUnavailable] = useState(false);
  const started = useRef(false);
  const run = useLatestCallback(() => {
    setUnavailable(false);
    command.reset();
    if (!canStart) { setUnavailable(true); void catalog.refetch().catch(() => {}); return; }
    void create(onCreated);
  });
  // Wait for the Host's catalog so the default model is the one this computer offers.
  const ready = !catalog.isPending || catalog.fetchStatus === "idle";
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    run();
  }, [ready, run]);
  useEffect(() => { onLocked(locked || (!ready && !unavailable)); return () => onLocked(false); }, [locked, ready, unavailable, onLocked]);
  const failed = !!command.error && !locked;
  return (
    <View style={{ gap: space.sm }}>
      {unavailable ? (
        <Body>{copy("Bu bilgisayarda kullanılabilir bir ajan veya model yok.", "No agent or model is available on this computer.")}</Body>
      ) : null}
      <CommandError
        error={command.error}
        onDismiss={() => command.reset()}
        onRecovered={(receipt) => {
          command.reset();
          onCreated(receipt.sessionId);
        }}
      />
      {failed || unavailable ? (
        <Button label={copy("Yeniden dene", "Try again")} onPress={run} busy={command.isPending} />
      ) : null}
    </View>
  );
}
