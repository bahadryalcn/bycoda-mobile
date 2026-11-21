import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import Plus from "lucide-react-native/icons/plus";
import type {
  CrewDefinition,
  CrewDirectory,
  CrewRunView,
  SavedCrewAgent,
} from "@/remote/contracts/crews";
import type { HostModelCatalog } from "@/domain/types";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { getQueryPresentation } from "@/ui/query-presentation";
import {
  IconButton,
  MutationState,
  StateView,
  QueryState,
  SearchField,
  SegmentedControl,
  Sheet,
} from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { identifier } from "./shared/format";
import { CrewEditor } from "./crews/crew-editor";
import { ProfileEditor } from "./crews/profile-editor";
import { StartCrewEditor } from "./crews/start-editor";
import { ActiveCrews } from "./crews/active-crews";
import { CrewRunCard } from "./crews/run-card";
import { CrewDefinitionCard } from "./crews/definition-card";
import { CrewProfileCard } from "./crews/profile-card";
import { newDefinition, newMember, validateCrewDirectory } from "./crews/model";
import { crewCatalogState, crewRoleOptions } from "./crews/presentation";
import { crewDirectoryPollInterval } from "./crews/runtime-model";
import { useMobileTheme } from "@/ui/theme";

type Tab = "definitions" | "runs" | "agents";
type Row =
  | { kind: "definition"; value: CrewDefinition }
  | { kind: "run"; value: CrewRunView }
  | { kind: "profile"; value: SavedCrewAgent };
type Editor = { projectId: string; directory: CrewDirectory } & (
  | { kind: "definition"; value: CrewDefinition }
  | { kind: "profile"; value: SavedCrewAgent }
  | { kind: "start"; value: CrewDefinition }
);

export function CrewsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const roleLabels = crewRoleOptions(copy);
  const roleLabel = (role: SavedCrewAgent["role"]) =>
    roleLabels.find((option) => option.value === role)?.label ?? role;
  const machine = useActiveMachine();
  const { projectId, setProjectId, current: localScope, revision } = useLocalProjectScope();
  const supported = machine?.capabilities?.includes("crews.v1") === true;
  const executionSupported =
    machine?.capabilities?.includes("crews.tasks.v1") === true;
  const deleteSupported =
    machine?.capabilities?.includes("crews.delete.v1") === true;
  const [tab, setTab] = useState<Tab>("definitions");
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [editor, setEditor] = useState<Editor | null>(null);
  const query = useHostQuery<CrewDirectory>(
    ["crews", projectId],
    "crews.list",
    { projectId },
    {
      enabled: supported && !!projectId,
      interval: (data) => crewDirectoryPollInterval(data, tab === "runs" && !editor),
      queryFn: async (client, signal) =>
        validateCrewDirectory(
          await client.request("crews.list", { projectId }, { signal }),
          projectId ?? undefined,
        ),
    },
  );
  const catalog = useHostQuery<HostModelCatalog>(
    ["models", editor?.projectId ?? projectId],
    "models.list",
    { projectId: editor?.projectId ?? projectId },
    { enabled: supported && !!(editor?.projectId ?? projectId) },
  );
  const remove = useHostMutation("crews.delete", ["crews", projectId]);
  const catalogRead = {
    state: crewCatalogState(catalog.data, catalog.error),
    retry: () => {
      void catalog.refetch();
    },
  };
  const removeAgent = useHostMutation("crews.agent.delete", [
    "crews",
    projectId,
  ]);
  const busy = remove.isPending || removeAgent.isPending;
  const directory = query.data;
  const rows: Row[] = !directory
    ? []
    : tab === "definitions"
      ? directory.definitions.map((value) => ({ kind: "definition", value }))
      : tab === "runs"
        ? directory.runs.map((value) => ({ kind: "run", value }))
        : directory.agents.map((value) => ({ kind: "profile", value }));
  const visible = rows.filter((row) =>
    matchesSearch(
      row.kind === "run"
        ? `${row.value.title ?? ""} ${row.value.definition.name}`
        : row.value.name,
      search,
      locale,
    ),
  );
  const open = (entry: Omit<Editor, "projectId" | "directory">) => {
    if (!projectId || !directory || editor || busy) return;
    setEditor({ ...entry, projectId, directory } as Editor);
  };
  const createLabel =
    tab === "agents"
      ? copy("Yeni kütüphane üyesi", "New library member")
      : copy("Yeni ekip", "New crew");
  const canCreate = !!projectId && !!directory && !busy && !editor;
  const presentation = getQueryPresentation(query);
  const showCreateInHeader = supported && tab !== "runs" && rows.length > 0 &&
    (presentation === "ready" || presentation === "stale-error");
  const create = () => {
    if (!projectId || !directory) return;
    if (tab === "agents")
      open({
        kind: "profile",
        value: {
          ...newMember(identifier(), "specialist", ""),
          projectId,
          updatedAt: 0,
        },
      });
    else
      open({
        kind: "definition",
        value: newDefinition(identifier(), projectId),
      });
  };
  return (
    <ScreenList<Row>
      title={copy("Ekipler", "Crews")}
      query={supported && projectId ? query : undefined}
      data={visible}
      keyExtractor={(row) =>
        `${machine?.id}:${projectId}:${row.kind}:${row.value.id}`
      }
      context={<Scope projectId={projectId} onChange={setProjectId} />}
      actions={
        showCreateInHeader ? (
          <IconButton
            label={createLabel}
            disabled={!canCreate}
            onPress={create}
          >
            <Plus size={22} color={colors.accent} />
          </IconButton>
        ) : undefined
      }
      header={
        <>
          {!supported ? (
            <StateView
              illustration="permission"
              title={copy("Güncelleme gerekiyor", "Update needed")}
              description={copy(
                "Ekipleri kullanmak için bilgisayardaki bycoda uygulamasını güncelleyin.",
                "Update bycoda on this computer to use crews.",
              )}
            />
          ) : !projectId ? (
            <StateView
              illustration="no-projects"
              title={copy("Proje seçin", "Choose a project")}
              description={copy(
                "Ekipleri görüntülemek için bir proje seçin.",
                "Select a project to view crews.",
              )}
            />
          ) : (
            <>
              <SegmentedControl hideLabel
                label={copy("Ekip görünümü", "Crew view")}
                value={tab}
                onChange={(next) => {
                  setTab(next);
                  // Only the Work list polls; entering it shows current data instead of waiting for a tick.
                  if (next === "runs") void query.refetch();
                }}
                options={[
                  { value: "definitions", label: copy("Ekipler", "Crews") },
                  { value: "runs", label: copy("Çalışmalar", "Work") },
                  {
                    value: "agents",
                    label: copy("Üye kütüphanesi", "Member library"),
                  },
                ]}
              />
              {tab === "runs" ? <ActiveCrews /> : null}
              <SearchField
                ref={searchInput}
                label={tab === "definitions" ? copy("Ekip adında ara", "Search crew names") : tab === "runs" ? copy("Çalışma başlığında ara", "Search work titles") : copy("Üye adında ara", "Search member names")}
                value={search}
                onChangeText={setSearch}
              />
              {!visible.some(
                (row) =>
                  row.kind === "definition" &&
                  row.value.id === remove.variables?.definitionId,
              ) ? (
                <MutationState mutation={remove} />
              ) : null}
              {!visible.some(
                (row) =>
                  row.kind === "profile" &&
                  row.value.id === removeAgent.variables?.agentId,
              ) ? (
                <MutationState mutation={removeAgent} />
              ) : null}
              <QueryState
                query={query}
                empty={!!directory && !visible.length}
                emptyTitle={
                  search.trim() && rows.length
                    ? copy("Eşleşen sonuç yok", "No matching results")
                    : tab === "definitions" ? copy("Henüz ekip yok", "No crews yet")
                      : tab === "runs" ? copy("Henüz ekip çalışması yok", "No crew work yet")
                        : copy("Kütüphanede üye yok", "No library members yet")
                }
                emptyDetail={search.trim() && rows.length ? undefined
                  : tab === "definitions" ? copy("Ekip; koordinatör, uzman ve inceleyenlerden oluşur ve işi birlikte yürütür.", "A crew pairs a coordinator, specialists and a reviewer to carry out work together.")
                    : tab === "runs" ? copy("Bir ekipten iş başlattığınızda çalışma burada görünür.", "Work appears here once you start it from a crew.")
                      : copy("Kayıtlı üyeleri birden çok ekipte yeniden kullanın.", "Save members once and reuse them across crews.")}
                emptyAction={
                  search.trim() && rows.length
                    ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
                    : !rows.length && tab !== "runs" && canCreate
                      ? { label: createLabel, onPress: create }
                      : undefined
                }
              />
            </>
          )}
          {editor && (
            <Sheet
              visible
              size="form"
              title={
                editor.kind === "start"
                  ? copy("Ekip çalışmasını başlat", "Start crew work")
                  : editor.kind === "profile"
                    ? copy("Kütüphane üyesi", "Library member")
                    : copy("Ekip ayarları", "Crew settings")
              }
              onClose={() => setEditor(null)}
            >
              {editor.kind === "definition" ? (
                <CrewEditor
                  key={editor.value.id}
                  initial={editor.value}
                  projectId={editor.projectId}
                  directory={editor.directory}
                  catalog={catalog.data}
                  catalogRead={catalogRead}
                  onClose={() => setEditor(null)}
                />
              ) : editor.kind === "profile" ? (
                <ProfileEditor
                  key={editor.value.id}
                  initial={editor.value}
                  projectId={editor.projectId}
                  catalog={catalog.data}
                  catalogRead={catalogRead}
                  onClose={() => setEditor(null)}
                />
              ) : (
                <StartCrewEditor
                  key={editor.value.id}
                  definition={editor.value}
                  projectId={editor.projectId}
                  onClose={() => setEditor(null)}
                />
              )}
            </Sheet>
          )}
        </>
      }
      renderItem={({ item }) =>
        item.kind === "run" ? (
          <CrewRunCard run={item.value} />
        ) : item.kind === "definition" ? (
          <CrewDefinitionCard
            value={item.value}
            roleLabel={roleLabel}
            busy={busy}
            editorOpen={!!editor}
            executionSupported={executionSupported}
            deleteSupported={deleteSupported}
            machineId={machine?.id}
            projectId={projectId}
            isScopeCurrent={() => localScope.current.machineId === machine?.id && localScope.current.projectId === projectId && localScope.current.revision === revision}
            remove={remove}
            library={directory?.agents}
            onStart={(value) => open({ kind: "start", value })}
            onEdit={(value) => open({ kind: "definition", value })}
          />
        ) : (
          <CrewProfileCard
            value={item.value}
            roleLabel={roleLabel}
            busy={busy}
            editorOpen={!!editor}
            machineId={machine?.id}
            projectId={projectId}
            isScopeCurrent={() => localScope.current.machineId === machine?.id && localScope.current.projectId === projectId && localScope.current.revision === revision}
            remove={removeAgent}
            onEdit={(value) => open({ kind: "profile", value })}
          />
        )
      }
    />
  );
}
