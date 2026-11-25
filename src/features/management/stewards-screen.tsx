import { ManagementToolbar } from "./shared/collection-toolbar";
import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import Pencil from "lucide-react-native/icons/pencil";
import type { HostSteward, HostStewardInput } from "@/remote/types";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { getQueryPresentation } from "@/ui/query-presentation";
import {
  Body,
  IconButton,
  MutationState,
  StateView,
  QueryState,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { ManagementList } from "./shared/management-list";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";
import { initialAgent, useAgentProviders } from "./shared/agent";
import { identifier } from "./shared/format";
import { StewardCard } from "./stewards/steward-card";
import { savedStewardId } from "./stewards/steward-feedback";
import { StewardEditor } from "./stewards/steward-editor";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";

export function StewardsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const { projectId, setProjectId } = useLocalProjectScope();
  const { providers, query: providerQuery } = useAgentProviders(projectId);
  const supported = machine?.capabilities?.includes("stewards") === true;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const filterOptions = [
    { value: "all", label: copy("Tümü", "All") },
    { value: "enabled", label: copy("Etkin", "Enabled") },
    { value: "paused", label: copy("Duraklatılmış", "Paused") },
  ];
  const clearSearch = () => {
    setSearch("");
    searchInput.current?.focus();
  };
  const [editor, setEditor] = useState<HostStewardInput | null>(null);
  const query = useHostQuery<HostSteward[]>(
    ["stewards"],
    "stewards.list",
    {},
    { enabled: supported, interval: 10000 },
  );
  const save = useHostMutation("stewards.save", ["stewards"]);
  const run = useHostMutation("stewards.runNow", ["stewards"]);
  const remove = useHostMutation("stewards.delete", ["stewards"]);
  const busy = save.isPending || run.isPending || remove.isPending;
  const scoped = (query.data ?? []).filter((item) => !projectId || item.projectId === projectId);
  const rows = scoped.filter(
    (item) =>
      (filter === "all" || item.enabled === (filter === "enabled")) &&
      matchesSearch(`${item.focus} ${item.model} ${item.projectId}`, search, locale),
  );
  const existingSteward = projectId
    ? query.data?.find((item) => item.projectId === projectId)
    : undefined;
  const presentation = getQueryPresentation(query);
  const canCreate =
    supported &&
    presentation === "ready" &&
    query.data !== undefined &&
    !!projectId &&
    !!providers.length &&
    !busy &&
    !editor &&
    !existingSteward;
  const showEditInHeader =
    supported && existingSteward && (presentation === "ready" || presentation === "stale-error");
  const create = () => {
    if (!canCreate || !projectId) return;
    const { maxRunMinutes: _minutes, ...agent } = initialAgent(providers);
    setEditor({
      ...agent,
      id: identifier(),
      projectId,
      enabled: true,
      focus: "",
      maxProposals: 5,
      maxOpen: 10,
      autoStart: false,
      autoMerge: false,
      scheduleKind: "daily",
      minute: 0,
      time: "09:00",
      dayOfWeek: 1,
    });
  };
  const listState = (
    <QueryState
      size="region"
      query={query}
      empty={!!query.data && !rows.length}
      emptyTitle={
        (search.trim() || filter !== "all") && scoped.length
          ? copy("Eşleşen sonuç yok", "No matching results")
          : copy("Henüz proje sorumlusu yok", "No project stewards yet")
      }
      emptyDetail={
        scoped.length
          ? undefined
          : copy(
              "Proje sorumlusu projeyi düzenli inceler ve yeni görevler önerir.",
              "A project steward reviews the project on a schedule and proposes new tasks.",
            )
      }
      emptyAction={
        (search.trim() || filter !== "all") && scoped.length
          ? search.trim()
            ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
            : {
                label: copy("Filtreleri temizle", "Clear filters"),
                onPress: () => setFilter("all"),
              }
          : !scoped.length && canCreate
            ? { label: copy("Yeni proje sorumlusu", "New project steward"), onPress: create }
            : undefined
      }
    />
  );
  return (
    <ManagementList<HostSteward>
      title={copy("Proje sorumluları", "Project stewards")}
      query={supported ? query : undefined}
      ListEmptyComponent={supported ? listState : undefined}
      data={rows}
      keyExtractor={(item) => item.id}
      actions={
        showEditInHeader ? (
          <IconButton
            label={copy("Proje sorumlusunu düzenle", "Edit project steward")}
            onPress={() => setEditor(existingSteward)}
            disabled={busy || !!editor}
          >
            <Pencil size={iconSize.action} strokeWidth={2} color={colors.accent} />
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
                "Bu bilgisayar proje sorumlularını desteklemiyor.",
                "This computer does not support project stewards.",
              )}
            />
          ) : (
            <>
              {!projectId ? (
                <Body muted>
                  {copy(
                    "Proje sorumlusu oluşturmak için bir proje seç.",
                    "Choose a project to create a steward.",
                  )}
                </Body>
              ) : !existingSteward && !providers.length ? (
                <>
                  {providerQuery.isLoading || providerQuery.error ? (
                    <QueryState query={providerQuery} loading="inline" />
                  ) : (
                    <AgentProviderPrerequisite />
                  )}
                </>
              ) : null}
              <ManagementToolbar
                project={<Scope allowAll projectId={projectId} onChange={setProjectId} />}
                search={
                  <SearchField
                    placeholder={copy("Ara", "Search")}
                    ref={searchInput}
                    value={search}
                    onChangeText={setSearch}
                    label={copy("Odak veya modelde ara", "Search steward focus and model")}
                  />
                }
                status={{
                  label: copy("Durum", "Status"),
                  value: filter,
                  unfilteredValue: "all",
                  options: filterOptions,
                  onChange: setFilter,
                }}
              />
              {!rows.some((item) => item.id === savedStewardId(save.variables)) ? (
                <MutationState
                  mutation={save}
                  success={copy("Proje sorumlusu kaydedildi.", "Project steward saved.")}
                />
              ) : null}
              {!rows.some((item) => item.id === run.variables?.stewardId) ? (
                <MutationState
                  mutation={run}
                  success={copy("Çalıştırma istendi.", "Run requested.")}
                />
              ) : null}
              {!rows.some((item) => item.id === remove.variables?.stewardId) ? (
                <MutationState mutation={remove} />
              ) : null}
              {rows?.length ? listState : null}
            </>
          )}
          {editor ? (
            <Sheet
              visible
              size="form"
              title={
                !("updatedAt" in editor)
                  ? copy("Yeni proje sorumlusu", "New project steward")
                  : copy("Proje sorumlusu", "Project steward")
              }
              onClose={() => setEditor(null)}
            >
              <StewardEditor
                key={editor.id}
                initial={editor}
                save={save}
                onClose={() => setEditor(null)}
              />
            </Sheet>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <StewardCard
          item={item}
          save={save}
          run={run}
          remove={remove}
          busy={busy}
          editorOpen={!!editor}
          onEdit={setEditor}
        />
      )}
    />
  );
}
