import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Stack } from "expo-router";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { HostProject } from "@/domain/types";
import { ActionMenu, Badge, Body, CodePanel, CodeText, Empty, ErrorText, IconButton, NavigationGroup, Notice, QueryState, Row, ScreenList, SearchField, SearchToolbar, SelectField, Sheet, ToggleField } from "@/ui/primitives";
import { MessageCode } from "@/ui/message-code";
import { useCopy } from "@/ui/copy";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useMobileTheme } from "@/ui/theme";
import { IssueSummary } from "@/ui/issue-summary";
import { stamp } from "../management/shared/format";
import type {
  RuntimeLogEntry,
  RuntimeLogLevel,
  RuntimeLogSnapshot,
  RuntimeLogSource,
} from "./types";
import { RuntimeMonitors } from "./runtime-monitors";
import { RuntimeLogRow } from "./runtime-log-row";
import {
  LOG_ENTRY_LIMIT,
  LOG_SEARCH_LIMIT,
  advanceLogPoll,
  initialLogPollState,
  logDetails,
  logLevelTone,
  logLocation,
  logPollInterval,
  logSearch,
  visibleLogEntries,
} from "./runtime-log-presentation";

export function RuntimeLogsScreen({ project }: { project: HostProject }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const searchField = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => {
    setSearch(""); setQuery(""); searchField.current?.focus();
  };
  const [source, setSource] = useState("");
  const [level, setLevel] = useState<"" | RuntimeLogLevel>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterDraft, setFilterDraft] = useState<{
    source: string;
    level: "" | RuntimeLogLevel;
    autoRefresh: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<{ entry: RuntimeLogEntry; reviewed: ReviewedMachine | undefined }>();
  const [showMonitors, setShowMonitors] = useState(false);
  const searchInput = logSearch(search);
  const selectedEntry = selected?.entry.projectId === project.id && isReviewedMachine(selected.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] }) ? selected.entry : undefined;
  const details = selectedEntry?.details !== undefined ? logDetails(selectedEntry.details) : undefined;
  useEffect(() => {
    setSelected(undefined); setFilterDraft(null); setSource("");
  }, [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  // Avoid making a host request for every keystroke while preserving the visible draft.
  useEffect(() => {
    if (searchInput.tooLong) return;
    const timer = setTimeout(() => setQuery(searchInput.query), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const sources = useHostQuery<RuntimeLogSource[]>(
    ["runtime-log-sources", project.id],
    "runtimeLogs.sources",
    { projectId: project.id },
    { interval: autoRefresh ? 15_000 : undefined },
  );
  const [poll, setPoll] = useState(initialLogPollState);
  const logs = useHostQuery<RuntimeLogSnapshot>(
    ["runtime-logs", project.id],
    "runtimeLogs.read",
    {
      projectId: project.id,
      limit: LOG_ENTRY_LIMIT,
      ...(source ? { sourceId: source } : {}),
      ...(level ? { levels: [level] } : {}),
      ...(query ? { search: query } : {}),
    },
    { interval: autoRefresh ? logPollInterval(poll) : undefined, enabled: !searchInput.tooLong },
  );
  // Slow the poll once consecutive reads bring nothing new; any change, filter or key switch resets it.
  useEffect(() => {
    setPoll((current) => advanceLogPoll(current, logs.data));
  }, [logs.dataUpdatedAt, logs.data === undefined]);
  const refresh = usePullRefresh(() => Promise.all([...(searchInput.tooLong ? [] : [logs.refetch()]), sources.refetch()]));
  // Validate host scope before displaying data, including cached or stale responses.
  // Keyed on the response so keystrokes and unchanged polls keep the same array and rows.
  const logEntries = logs.data?.entries;
  const entries = useMemo(
    () => (searchInput.tooLong ? visibleLogEntries(undefined, project.id) : visibleLogEntries(logEntries, project.id)),
    [logEntries, project.id, searchInput.tooLong],
  );
  const sourceData = sources.data;
  const projectSources = useMemo(
    () => (sourceData ?? []).filter((entry) => entry.projectId === project.id),
    [sourceData, project.id],
  );
  const sourceLabels = useMemo(() => new Map(projectSources.map((entry) => [entry.id, entry.label])), [projectSources]);
  const levelOptions = [
    { value: "", label: copy("Tüm seviyeler", "All levels") },
    { value: "error", label: copy("Hata", "Error") },
    { value: "warn", label: copy("Uyarı", "Warning") },
    { value: "info", label: copy("Bilgi", "Info") },
    { value: "debug", label: "Debug" },
  ] as const;
  const levelLabels = new Map<string, string>(levelOptions.map((option) => [option.value, option.label]));
  const machineRef = useRef(machine);
  // Keep the latest machine readable by the stable row callback without recreating it per render.
  useEffect(() => {
    machineRef.current = machine;
  });
  const selectEntry = useCallback((entry: RuntimeLogEntry) => {
    setSelected({ entry, reviewed: reviewedMachine(machineRef.current) });
  }, []);
  const unavailableSources = projectSources.filter((entry) => !entry.available);
  const sourceIssues = <IssueSummary issues={unavailableSources.map(entry => [entry.label, entry.reason].filter(Boolean).join(" · "))}
    retrying={sources.isFetching} onRetry={() => { if (!sources.isFetching) void sources.refetch(); }} />;
  return (
    <>
      <ScreenList<RuntimeLogEntry>
        title={copy("Çalışma günlükleri", "Runtime logs")}
        subtitle={project.name}
        data={entries}
        keyExtractor={(entry) => entry.id}
        query={logs}
        refreshState={refresh}
        actions={
          <>
            <IconButton busy={refresh.refreshing}
              label={copy("Yenile", "Refresh")}
              disabled={logs.isFetching || sources.isFetching || searchInput.tooLong}
              onPress={() => { void refresh.onRefresh(); }}
            >
              <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
            </IconButton>
            <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
              { key: "monitors", label: copy("Günlük izleyicileri", "Log monitors"), onPress: () => setShowMonitors(true) },
            ]} />
          </>
        }
        header={
          <>
            <Stack.Screen options={{ title: copy("Çalışma günlükleri", "Runtime logs") }} />
            <SearchToolbar search={<SearchField
              ref={searchField}
              label={copy("Günlüklerde ara", "Search logs")}
              value={search}
              maxLength={LOG_SEARCH_LIMIT}
              onChangeText={setSearch}
            />} actions={<FilterButton
              count={Number(!!source) + Number(!!level) + Number(!autoRefresh)}
              onPress={() => setFilterDraft({ source, level, autoRefresh })}
            />} />
            <AppliedFilters filters={[
              source && `${copy("Kaynak", "Source")}: ${sourceLabels.get(source) ?? source}`,
              level && `${copy("Seviye", "Level")}: ${levelLabels.get(level) ?? level}`,
              !autoRefresh && `${copy("Otomatik yenile", "Auto refresh")}: ${copy("Kapalı", "Off")}`,
            ]} />
            {searchInput.tooLong ? <ErrorText error={copy(
              "Aramayı 512 karakter veya daha az olacak şekilde kısaltın.",
              "Shorten the search to 512 characters or fewer.",
            )} /> : null}
            {!searchInput.tooLong ? (
              <QueryState
                query={logs}
                empty={!entries.length && sources.isSuccess && !sources.error && !unavailableSources.length}
                emptyTitle={source || level || query ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz günlük yok.", "No logs yet.")}
                emptyAction={source || level ? {
                  label: copy("Filtreleri temizle", "Clear filters"),
                  onPress: () => { setSource(""); setLevel(""); clearSearch(); },
                } : query ? {
                  label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch,
                } : undefined}
              />
            ) : null}
            {!filterDraft ? <QueryState query={sources} loading="none" /> : null}
            {!filterDraft ? sourceIssues : null}

          </>
        }
        renderItem={({ item: entry }) => (
          <RuntimeLogRow
            entry={entry}
            sourceLabel={sourceLabels.get(entry.sourceId) ?? entry.source}
            levelLabel={levelLabels.get(entry.level) ?? entry.level}
            onSelect={selectEntry}
          />
        )}
      />
      {showMonitors ? (
        <RuntimeMonitors projectId={project.id} projectName={project.name} onClose={() => setShowMonitors(false)} />
      ) : null}
      {filterDraft ? (
        <FilterSheet
          visible
          onClose={() => setFilterDraft(null)}
          onReset={() => setFilterDraft({ source: "", level: "", autoRefresh: true })}
          onApply={() => {
            setSource(filterDraft.source);
            setLevel(filterDraft.level);
            setAutoRefresh(filterDraft.autoRefresh);
            setFilterDraft(null);
          }}
        >
          <QueryState query={sources} loading="inline" />
          {sourceIssues}
          <SelectField
            label={copy("Kaynak", "Source")}
            searchable
            value={filterDraft.source}
            options={[
              { value: "", label: copy("Tüm kaynaklar", "All sources") },
              ...projectSources.map((entry) => ({
                value: entry.id,
                label: entry.label,
                detail: entry.url,
              })),
            ]}
            onChange={(source) => setFilterDraft({ ...filterDraft, source })}
          />
          <SelectField
            label={copy("Seviye", "Level")}
            value={filterDraft.level}
            options={levelOptions}
            onChange={(level) => setFilterDraft({ ...filterDraft, level })}
          />
          <NavigationGroup>
            <ToggleField
              label={copy("Otomatik yenile", "Auto refresh")}
              value={filterDraft.autoRefresh}
              onChange={(autoRefresh) => setFilterDraft({ ...filterDraft, autoRefresh })}
            />
          </NavigationGroup>
        </FilterSheet>
      ) : null}
      <Sheet
        visible={!!selectedEntry}
        title={copy("Günlük ayrıntıları", "Log details")}
        size="full"
        onClose={() => setSelected(undefined)}
      >
        {selectedEntry ? (
          <>
            <Row>
              <Body muted style={uiStyles.caption}>
                {stamp(selectedEntry.timestamp)}
              </Body>
              <Badge
                label={levelLabels.get(selectedEntry.level) ?? selectedEntry.level}
                tone={logLevelTone(selectedEntry.level)}
              />
            </Row>
            <CodePanel horizontal={false}>
              <CodeText>{selectedEntry.message}</CodeText>
            </CodePanel>
            {selectedEntry.stack ? <MessageCode code={selectedEntry.stack} output allowPreview={false} readerTitle={copy("Çağrı yığını", "Stack trace")} /> : null}
            {details ? (
              <CodePanel horizontal={false}>
                <CodeText>{details.text}</CodeText>
              </CodePanel>
            ) : null}
            {details?.truncated ? (
              <Notice
                message={copy(
                  "Ayrıntıların ilk 16.000 karakteri gösteriliyor.",
                  "Showing the first 16,000 characters of details.",
                )}
              />
            ) : null}
            {selectedEntry.location ? (
              <Body
                mono
                muted
              >{logLocation(selectedEntry.location)}</Body>
            ) : null}
          </>
        ) : (
          <Empty compact={false} illustration="inbox-empty" title={copy("Henüz günlük yok.", "No logs yet.")} />
        )}
      </Sheet>
    </>
  );
}
