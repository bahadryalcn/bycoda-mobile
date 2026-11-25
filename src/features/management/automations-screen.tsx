import { ManagementToolbar } from "./shared/collection-toolbar";
import { useEditorRecord } from "./shared/use-editor-record";
import { ManagementList } from "./shared/management-list";
import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import Plus from "lucide-react-native/icons/plus";

import {
  Body,
  Button,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useHostMutation, useHostQuery } from "@/state/queries";
import type { HostAutomation } from "@/domain/types";
import { useProjectList } from "../workspace/use-project-directory";
import { identifier } from "./shared/format";
import { initialAgent, useAgentProviders } from "./shared/agent";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";

import { AutomationEditor } from "./automations/automation-editor";
import { AutomationCard } from "./automations/automation-card";
import { savedAutomation, savedAutomationId } from "./automations/automation-feedback";
import type { AutomationEditorFlow } from "./automations/types";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";

export function AutomationsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => {
    setSearch("");
    searchInput.current?.focus();
  };
  type StateFilter = "all" | "enabled" | "paused";
  const [filter, setFilter] = useState<StateFilter>("all");
  const filterOptions: { value: StateFilter; label: string }[] = [
    { value: "all", label: copy("Tümü", "All") },
    { value: "enabled", label: copy("Etkin", "Enabled") },
    { value: "paused", label: copy("Duraklatılmış", "Paused") },
  ];
  const { projectId, setProjectId } = useLocalProjectScope();
  const projects = useProjectList();
  const { providers, query: providerQuery } = useAgentProviders(projectId);
  const query = useHostQuery<HostAutomation[]>(
    ["automations"],
    "automations.list",
    {},
    { interval: 10000 },
  );
  const save = useHostMutation<HostAutomation>("automations.save", ["automations"]);
  const run = useHostMutation("automations.runNow", ["automations"]);
  const remove = useHostMutation("automations.delete", ["automations"]);
  const [editor, setEditor] = useState<AutomationEditorFlow>(null);
  const fetchedDraft =
    editor?.kind === "new"
      ? editor.initial
      : editor?.kind === "edit"
        ? query.data?.find((item) => item.id === editor.id)
        : undefined;
  const draft = useEditorRecord(
    editor?.kind === "new" ? editor.initial.id : (editor?.id ?? null),
    fetchedDraft,
  );
  const [historyId, setHistoryId] = useState<string | null>(null);
  const busy = save.isPending || run.isPending || remove.isPending;
  const scoped = query.data?.filter((item) => !projectId || item.projectId === projectId);
  const presentation = getQueryPresentation(query);
  const showCreateInHeader =
    !!scoped?.length && (presentation === "ready" || presentation === "stale-error");
  const visible = scoped?.filter(
    (item) =>
      (filter === "all" || (filter === "enabled") === item.enabled) &&
      matchesSearch(item.name + " " + item.prompt, search, locale),
  );
  const projectReady =
    !projectId || (projects.directoryReady && projects.isProjectVisible(projectId));
  const canCreate = projectReady && providers.length > 0 && !editor && !busy;
  const startNew = () => {
    if (!canCreate) return;
    save.reset();
    setEditor({
      kind: "new",
      initial: {
        ...initialAgent(providers),
        id: identifier(),
        name: "",
        prompt: "",
        projectId: projectId ?? "",
        enabled: true,
        scheduleKind: "weekdays",
        time: "09:00",
        minute: 0,
        dayOfWeek: 1,
        maxRunsPerDay: 0,
      },
    });
  };
  const listState = (
    <QueryState
      size="region"
      query={query}
      empty={visible?.length === 0}
      emptyTitle={
        (search.trim() || filter !== "all") && scoped?.length
          ? copy("Eşleşen sonuç yok", "No matching results")
          : copy("Henüz otomasyon yok", "No automations yet")
      }
      emptyDetail={
        (search.trim() || filter !== "all") && scoped?.length
          ? undefined
          : copy(
              "Otomasyonlar bir istemi zamanlanmış olarak bilgisayarında çalıştırır.",
              "Automations run a prompt on your computer on a schedule.",
            )
      }
      emptyAction={
        scoped?.length && (search.trim() || filter !== "all")
          ? search.trim()
            ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
            : {
                label: copy("Filtreleri temizle", "Clear filters"),
                onPress: () => setFilter("all"),
              }
          : scoped?.length === 0 && canCreate
            ? { label: copy("Yeni otomasyon", "New automation"), onPress: startNew }
            : undefined
      }
    />
  );
  return (
    <ManagementList<HostAutomation>
      title={copy("Otomasyonlar", "Automations")}
      query={query}
      ListEmptyComponent={listState}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      actions={
        showCreateInHeader ? (
          <IconButton
            label={copy("Yeni otomasyon", "New automation")}
            disabled={!canCreate}
            onPress={startNew}
          >
            <Plus size={iconSize.action} strokeWidth={2} color={colors.accent} />
          </IconButton>
        ) : undefined
      }
      header={
        <>
          {!providers.length ? (
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
                label={copy("Otomasyonlarda ara", "Search automations")}
                value={search}
                onChangeText={setSearch}
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

          {!editor && !visible?.some((item) => item.id === savedAutomationId(save.variables)) && (
            <MutationState
              mutation={save}
              success={copy("Otomasyon kaydedildi.", "Automation saved.")}
            />
          )}
          {!visible?.some((item) => item.id === run.variables?.automationId) && (
            <MutationState mutation={run} success={copy("Çalıştırma istendi.", "Run requested.")} />
          )}
          {!visible?.some((item) => item.id === remove.variables?.automationId) && (
            <MutationState
              mutation={remove}
              success={copy("Otomasyon silindi.", "Automation deleted.")}
            />
          )}
          {editor?.kind === "edit" && query.isSuccess && !draft && (
            <Notice
              tone="warning"
              message={copy(
                "Otomasyon artık bulunamadı.",
                "The automation is no longer available.",
              )}
            >
              <Button label={copy("Kapat", "Close")} onPress={() => setEditor(null)} />
            </Notice>
          )}
          {draft && (
            <Sheet
              visible
              size="form"
              title={
                editor?.kind === "new"
                  ? copy("Yeni otomasyon", "New automation")
                  : copy("Otomasyonu düzenle", "Edit automation")
              }
              onClose={() => {
                if (!busy) setEditor(null);
              }}
            >
              <AutomationEditor
                key={draft.id}
                initial={draft}
                save={save}
                busy={busy}
                readSaved={async (id) => {
                  const result = await query.refetch({ cancelRefetch: true });
                  if (!result.isSuccess) throw result.error ?? new Error("Automation read failed");
                  return savedAutomation(result.data, id);
                }}
                onClose={() => setEditor(null)}
              />
            </Sheet>
          )}
          {visible?.length ? listState : null}
        </>
      }
      renderItem={({ item: item }) => (
        <AutomationCard
          item={item}
          busy={busy}
          editorOpen={!!editor}
          historyId={historyId}
          onHistory={setHistoryId}
          onEdit={(id) => {
            save.reset();
            setEditor({ kind: "edit", id });
          }}
          save={save}
          run={run}
          remove={remove}
        />
      )}
    />
  );
}
