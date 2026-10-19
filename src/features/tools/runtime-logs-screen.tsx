import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { FilterButton, FilterSheet } from "@/ui/filter-sheet";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostQuery } from "@/state/queries";
import type { HostProject } from "@/domain/types";
import {
  Badge, Body, CodePanel, CodeText, Empty, IconButton, NavigationGroup, NavigationRow, Notice,
  QueryState, Row, ScreenList, SearchField, SelectField, Sheet, ToggleField,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useMobileTheme } from "@/ui/theme";
import { stamp } from "../management/shared/format";
import type { RuntimeLogEntry, RuntimeLogLevel, RuntimeLogSnapshot, RuntimeLogSource } from "./types";

export function RuntimeLogsScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [level, setLevel] = useState<"" | RuntimeLogLevel>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterDraft, setFilterDraft] = useState<{ source: string; level: "" | RuntimeLogLevel; autoRefresh: boolean } | null>(null);
  const [selected, setSelected] = useState<RuntimeLogEntry>();
  // Avoid making a host request for every keystroke while preserving the visible draft.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim().slice(0, 512)), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const sources = useHostQuery<RuntimeLogSource[]>(
    ["runtime-log-sources", project.id], "runtimeLogs.sources", { projectId: project.id },
    { interval: autoRefresh ? 15_000 : undefined },
  );
  const logs = useHostQuery<RuntimeLogSnapshot>(
    ["runtime-logs", project.id], "runtimeLogs.read",
    {
      projectId: project.id, limit: 200,
      ...(source ? { sourceId: source } : {}),
      ...(level ? { levels: [level] } : {}),
      ...(query ? { search: query } : {}),
    },
    { interval: autoRefresh ? 5_000 : undefined },
  );
  // Validate host scope before displaying data, including cached or stale responses.
  const entries = (logs.data?.entries ?? []).filter((entry) => entry.projectId === project.id).reverse();
  const projectSources = (sources.data ?? []).filter((entry) => entry.projectId === project.id);
  return (
    <ScreenList<RuntimeLogEntry>
      title={copy("Çalışma günlükleri", "Runtime logs")}
      subtitle={project.name}
      data={entries}
      keyExtractor={(entry) => entry.id}
      query={logs}
      actions={
        <>
          <FilterButton count={Number(!!source) + Number(!!level) + Number(!autoRefresh)}
            onPress={() => setFilterDraft({ source, level, autoRefresh })} />
          <IconButton label={copy("Yenile", "Refresh")} disabled={logs.isFetching} onPress={() => { void logs.refetch(); void sources.refetch(); }}>
            <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
          </IconButton>
        </>
      }
      header={
        <>
          <Stack.Screen options={{ title: copy("Çalışma günlükleri", "Runtime logs") }} />
          {filterDraft ? <FilterSheet visible onClose={() => setFilterDraft(null)}
            onReset={() => setFilterDraft({ source: "", level: "", autoRefresh: true })}
            onApply={() => {
              setSource(filterDraft.source); setLevel(filterDraft.level); setAutoRefresh(filterDraft.autoRefresh); setFilterDraft(null);
            }}>
            <QueryState query={sources} loading="inline" />
            <SelectField label={copy("Kaynak", "Source")} searchable value={filterDraft.source}
              options={[{ value: "", label: copy("Tüm kaynaklar", "All sources") },
                ...projectSources.map((entry) => ({ value: entry.id, label: entry.label, detail: entry.url }))]}
              onChange={(source) => setFilterDraft({ ...filterDraft, source })} />
            <SelectField label={copy("Seviye", "Level")} value={filterDraft.level}
              options={[
                { value: "", label: copy("Tüm seviyeler", "All levels") },
                { value: "error", label: copy("Hata", "Error") },
                { value: "warn", label: copy("Uyarı", "Warning") },
                { value: "info", label: copy("Bilgi", "Info") },
                { value: "debug", label: "Debug" },
              ]}
              onChange={(level) => setFilterDraft({ ...filterDraft, level })} />
            <NavigationGroup><ToggleField label={copy("Otomatik yenile", "Auto refresh")} value={filterDraft.autoRefresh}
              onChange={(autoRefresh) => setFilterDraft({ ...filterDraft, autoRefresh })} /></NavigationGroup>
          </FilterSheet> : null}
          <SearchField label={copy("Günlüklerde ara", "Search logs")} value={search} onChangeText={setSearch} />
          <QueryState query={logs} empty={!entries.length} emptyTitle={copy("Henüz günlük yok.", "No logs yet.")} />
          {projectSources.filter((entry) => !entry.available).map((entry) => (
            <Notice key={entry.id} tone="warning" message={[entry.label, entry.reason].filter(Boolean).join(" · ")} />
          ))}
          {logs.data && entries.length >= 200 ? (
            <Notice message={copy("Son 200 kayıt gösteriliyor. Aramayla daraltabilirsin.", "Showing the latest 200 entries. Use search to narrow the results.")} />
          ) : null}
          <Sheet visible={!!selected} title={copy("Günlük ayrıntıları", "Log details")} size="full" onClose={() => setSelected(undefined)}>
            {selected ? (
              <>
                <Row>
                  <Body muted style={uiStyles.caption}>{stamp(selected.timestamp)}</Body>
                  <Badge label={selected.level} tone={selected.level === "error" ? "danger" : selected.level === "warn" ? "warning" : "default"} />
                </Row>
                <CodePanel horizontal={false}><CodeText>{selected.message}</CodeText></CodePanel>
                {selected.stack ? <CodePanel horizontal={false}><CodeText>{selected.stack}</CodeText></CodePanel> : null}
                {selected.details !== undefined ? <CodePanel horizontal={false}><CodeText>{JSON.stringify(selected.details, null, 2).slice(0, 16_000)}</CodeText></CodePanel> : null}
                {selected.location ? <Body mono muted>{`${selected.location.file}:${selected.location.line ?? ""}:${selected.location.column ?? ""}`}</Body> : null}
              </>
            ) : <Empty title={copy("Henüz günlük yok.", "No logs yet.")} />}
          </Sheet>
        </>
      }
      renderItem={({ item: entry }) => (
        <NavigationRow
          label={entry.message}
          detail={[stamp(entry.timestamp), projectSources.find((item) => item.id === entry.sourceId)?.label ?? entry.source].join(" · ")}
          trailing={<Badge label={entry.level} tone={entry.level === "error" ? "danger" : entry.level === "warn" ? "warning" : "default"} />}
          onPress={() => setSelected(entry)}
        />
      )}
    />
  );
}
