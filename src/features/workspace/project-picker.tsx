import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { Body, FormActions, NavigationRow, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { usePrivateContentAccess } from "@/ui/private-access";
import { ScreenChromeProvider } from "@/ui/layout";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { matchesSearch, normalizeSearch } from "@/ui/search-matching";
import { useLocale } from "@/i18n";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { RecordAccessUnavailable } from "./unavailable-state";
import { useCopy } from "@/ui/copy";
import { useProjectList } from "./use-project-directory";
import { useProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import { projectPathLabel, sortDirectoryProjects } from "./project-directory";
import { space } from "@/ui/tokens";
import { ProjectIcon } from "@/ui/project-icon";
import { useMobileTheme } from "@/ui/theme";

type Props = { visible: boolean; onClose(): void; onSelect(project: HostProject): void };

/** Search and queued events belong to one explicit opening, not a hidden picker. */
export function ProjectPicker({ visible, ...props }: Props) {
  return visible ? <ProjectPickerOpening {...props} /> : null;
}

function ProjectPickerOpening({ onClose, onSelect }: Omit<Props, "visible">) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy(), locale = useLocale(), machine = useActiveMachine();
  const connection = useConnectionScope(), parent = usePrivateContentAccess();
  const [opening] = useState(() => ({ connection, review: reviewedMachine(machine), name: machine?.name }));
  const mounted = useRef(false), retired = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { preferences } = useProjectDirectoryPreferences(opening.review?.id);
  const projects = useProjectList();
  const scopeCurrent = () => opening.connection.isCurrent() && (opening.review
    ? isReviewedMachine(opening.review, useMachines.getState()) : !useMachines.getState().activeId);
  const available = connection === opening.connection && scopeCurrent() && parent.allowed && parent.check();
  const readable = available && projects.directoryReady;
  const port = useMemo(() => ({}), [available, readable]);
  const [search, setSearch] = useState("");
  const normalized = normalizeSearch(search, locale);
  const rows = useMemo(() => !readable ? [] : sortDirectoryProjects((projects.data ?? []).filter(project =>
    matchesSearch(`${project.name} ${project.cwd}`, search, locale)), preferences), [readable, projects.data, preferences, search, locale]);
  const view = useMemo(() => ({}), [port, rows, normalized, locale]);
  const feedback = useMemo(() => ({}), [port, projects.error, projects.readiness, projects.privacyUnavailable, projects.refetch]);
  const live = useRef({ port, view, feedback, parent, projects, rows, onClose, onSelect });
  live.current = { port, view, feedback, parent, projects, rows, onClose, onSelect };
  const current = () => mounted.current && !retired.current && live.current.port === port && scopeCurrent() &&
    live.current.parent.allowed && live.current.parent.check();
  const close = () => { if (!mounted.current || retired.current) return; retired.current = true; live.current.onClose(); };
  const changeSearch = (value: string) => { if (current() && live.current.projects.directoryReady) setSearch(value); };
  const clearSearch = () => { if (live.current.view === view) changeSearch(""); };
  const select = (item: HostProject) => {
    if (!current() || live.current.view !== view || !live.current.projects.directoryReady || !opening.review ||
      !live.current.rows.some(row => row === item) || !live.current.projects.isProjectVisible(item.id, item.cwd)) return;
    retired.current = true; live.current.onSelect(item);
  };
  const manageConnections = () => {
    if (!current() || live.current.feedback !== feedback) return;
    close(); router.push("/machines");
  };
  const pending = useRef<Promise<unknown> | null>(null);
  const retry = () => {
    if (!current() || live.current.feedback !== feedback || live.current.projects.isFetching || pending.current) return;
    const query = live.current.projects;
    const request = Promise.resolve().then(async () => {
      if (current() && live.current.feedback === feedback) await query.refetch({ cancelRefetch: false });
    });
    pending.current = request;
    void request.catch(() => {}).finally(() => { if (pending.current === request) pending.current = null; });
    return request;
  };
  const query = { ...projects, refetch: retry };
  const position = useFilteredListScrollMemory<HostProject>(normalized, readable, rows.length, { suspended: !readable });
  const feedbackProps = {
    query, readiness: projects.readiness, privacyUnavailable: projects.privacyUnavailable,
    empty: !rows.length && projects.directoryReady, loadingLabel: copy("Projeler yükleniyor…", "Loading projects…"),
    emptyTitle: normalized ? copy("Aramana uyan proje yok.", "No projects match your search.") : copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet."),
    emptyIllustration: normalized ? ("search-empty" as const) : ("no-projects" as const),
    emptyAction: normalized ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined,
    onManageConnections: manageConnections,
  };
  return <Sheet visible title={copy("Proje seçin", "Choose a project")} size="full" scroll={false} onClose={close}
    footer={<FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} />}>
    {!available ? <RecordAccessUnavailable /> : <>
      <View style={{ paddingHorizontal: space.screen, paddingVertical: space.sm }}>
        <SearchField label={copy("Projelerinde ara", "Search projects")} value={readable ? search : ""} editable={readable} onChangeText={changeSearch} />
      </View>
      <ScreenChromeProvider nativeTitle bottomSafeArea={false}><ScreenList {...position.listProps} grouped data={rows} keyExtractor={project => project.id} query={query}
        ListEmptyComponent={<ProjectDirectorySlot {...feedbackProps} />}
        header={<>
          {opening.name ? <Body muted style={uiStyles.caption}>{opening.name}</Body> : null}
        </>}
        renderItem={({ item }) => <NavigationRow variant="plain" label={item.name} detail={projectPathLabel(item.cwd, preferences.fullPaths)} detailEllipsizeMode="middle" detailLines={preferences.fullPaths ? 0 : 1}
          icon={<ProjectIcon appearance={item.appearance} />} onPress={() => select(item)} />}
      /></ScreenChromeProvider>
    </>}
  </Sheet>;
}
