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
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { colors } from "@/ui/tokens";
import {
  ActionMenu,
  Body,
  Button,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
  SegmentedControl,
  Sheet,
} from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { RecordCard } from "@/ui/record-card";
import { Scope } from "./shared/scope";
import { identifier } from "./shared/format";
import { CrewEditor } from "./crews/crew-editor";
import { ProfileEditor } from "./crews/profile-editor";
import { StartCrewEditor } from "./crews/start-editor";
import { CrewRunCard } from "./crews/run-card";
import { newDefinition, newMember, validateCrewDirectory } from "./crews/model";
import { crewCatalogState, crewRoleOptions } from "./crews/presentation";

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
  const copy = useCopy();
  const locale = useLocale();
  const roleLabels = crewRoleOptions(copy);
  const roleLabel = (role: SavedCrewAgent["role"]) =>
    roleLabels.find((option) => option.value === role)?.label ?? role;
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
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
      interval: 5000,
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
      context={<Scope />}
      actions={
        supported && tab !== "runs" ? (
          <IconButton
            label={
              tab === "agents"
                ? copy("Yeni kütüphane üyesi", "New library member")
                : copy("Yeni ekip", "New crew")
            }
            disabled={!projectId || !directory || busy || !!editor}
            onPress={create}
          >
            <Plus size={22} color={colors.accent} />
          </IconButton>
        ) : undefined
      }
      header={
        <>
          {!supported ? (
            <Notice
              tone="info"
              message={copy(
                "Ekipleri kullanmak için bilgisayardaki bycoda uygulamasını güncelleyin.",
                "Update bycoda on this computer to use crews.",
              )}
            />
          ) : !projectId ? (
            <Notice
              tone="info"
              message={copy(
                "Ekipleri görüntülemek için bir proje seçin.",
                "Select a project to view crews.",
              )}
            />
          ) : (
            <>
              <SegmentedControl
                label={copy("Ekip görünümü", "Crew view")}
                value={tab}
                onChange={setTab}
                options={[
                  { value: "definitions", label: copy("Ekipler", "Crews") },
                  { value: "runs", label: copy("Çalışmalar", "Work") },
                  {
                    value: "agents",
                    label: copy("Üye kütüphanesi", "Member library"),
                  },
                ]}
              />
              <SearchField
                ref={searchInput}
                label={copy("Ara", "Search")}
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
                empty={!visible.length}
                emptyTitle={
                  search.trim() && rows.length
                    ? copy("Eşleşen sonuç yok", "No matching results")
                    : copy("Bu görünümde kayıt yok", "No entries in this view")
                }
                emptyAction={search.trim() && rows.length ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined}
              />
              {tab === "runs" && !executionSupported && (
                <Notice
                  tone="info"
                  message={copy(
                    "Bu hostta yeni ekip çalışması başlatılamaz. Bilgisayardaki bycoda uygulamasını güncelleyin.",
                    "This host cannot start new crew work. Update bycoda on the computer.",
                  )}
                />
              )}
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
          <RecordCard
            title={item.value.name}
            metadata={`${item.value.agents.length} ${copy("üye", "members")} · ${item.value.projectId ? copy("Bu proje", "This project") : copy("Bilgisayar geneli", "Host-wide")}`}
            footer={
              <Button
                tone="quiet"
                label={copy("İş başlat", "Start work")}
                disabled={!executionSupported || busy || !!editor}
                onPress={() => open({ kind: "start", value: item.value })}
              />
            }
            details={
              <Body>
                {item.value.agents
                  .map((agent) => `${agent.name} · ${roleLabel(agent.role)}`)
                  .join("\n")}
              </Body>
            }
            menu={
              <ActionMenu
                label={copy("Ekip işlemleri", "Crew actions")}
                busy={
                  remove.isPending &&
                  remove.variables?.definitionId === item.value.id
                }
                actions={[
                  {
                    key: "edit",
                    label: copy("Düzenle", "Edit"),
                    disabled: busy || !!editor,
                    onPress: () =>
                      open({ kind: "definition", value: item.value }),
                  },
                  {
                    key: "copy",
                    label: copy("Kopyasını oluştur", "Create a copy"),
                    disabled: busy || !!editor,
                    onPress: () =>
                      open({
                        kind: "definition",
                        value: {
                          ...structuredClone(item.value),
                          id: identifier(),
                          updatedAt: 0,
                        },
                      }),
                  },
                  {
                    key: "delete",
                    label: copy("Sil", "Delete"),
                    destructive: true,
                    disabled: !deleteSupported || busy || !!editor,
                    onPress: () =>
                      confirmAction(
                        copy("Ekibi sil", "Delete crew"),
                        copy(
                          "Kayıtlı ekip tanımı silinir. Host devam eden çalışma veya görevler kullanıyorsa işlemi engeller.",
                          "The saved crew definition will be deleted. The host blocks deletion while active work or tasks still use it.",
                        ),
                        copy("Sil", "Delete"),
                        () => {
                          if (
                            useMachines.getState().activeId !== machine?.id ||
                            useMachines.getState().selectedProjectId !==
                              projectId
                          )
                            return;
                          remove.mutate({
                            projectId,
                            definitionId: item.value.id,
                            expectedUpdatedAt: item.value.updatedAt,
                          });
                        },
                      ),
                  },
                ]}
              />
            }
          >
            {remove.variables?.definitionId === item.value.id ? (
              <MutationState mutation={remove} />
            ) : null}
          </RecordCard>
        ) : (
          <RecordCard
            title={item.value.name}
            metadata={`${roleLabel(item.value.role)} · ${item.value.projectId ? copy("Bu proje", "This project") : copy("Bilgisayar geneli", "Host-wide")}`}
            details={<Body>{item.value.instructions}</Body>}
            menu={
              <ActionMenu
                label={copy(
                  "Kütüphane üyesi işlemleri",
                  "Library member actions",
                )}
                busy={
                  removeAgent.isPending &&
                  removeAgent.variables?.agentId === item.value.id
                }
                actions={[
                  {
                    key: "edit",
                    label: copy("Düzenle", "Edit"),
                    disabled: busy || !!editor,
                    onPress: () => open({ kind: "profile", value: item.value }),
                  },
                  {
                    key: "delete",
                    label: copy("Sil", "Delete"),
                    destructive: true,
                    disabled: busy || !!editor,
                    onPress: () =>
                      confirmAction(
                        copy("Üyeyi kütüphaneden sil", "Delete library member"),
                        copy(
                          "Kütüphane profili silinir. Ekiplerdeki kopyaları korunur.",
                          "The library profile will be deleted. Copies in crews are kept.",
                        ),
                        copy("Sil", "Delete"),
                        () => {
                          if (
                            useMachines.getState().activeId === machine?.id &&
                            useMachines.getState().selectedProjectId ===
                              projectId
                          )
                            removeAgent.mutate({
                              projectId,
                              agentId: item.value.id,
                            });
                        },
                      ),
                  },
                ]}
              />
            }
          >
            {removeAgent.variables?.agentId === item.value.id ? (
              <MutationState mutation={removeAgent} />
            ) : null}
          </RecordCard>
        )
      }
    />
  );
}
