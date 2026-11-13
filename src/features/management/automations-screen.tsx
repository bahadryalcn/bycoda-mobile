import { useEditorRecord } from "./shared/use-editor-record";
import { ScreenList } from "@/ui/screen-list";
import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import Plus from "lucide-react-native/icons/plus";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";

import {
  Body,
  Button,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
  SearchToolbar,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostAutomation } from "@/domain/types";
import { identifier } from "./shared/format";
import { initialAgent, useAgentProviders } from "./shared/agent";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";

import { AutomationEditor } from "./automations/automation-editor";
import { AutomationCard } from "./automations/automation-card";
import { savedAutomationId } from "./automations/automation-feedback";
import type { AutomationEditorFlow } from "./automations/types";
import { useMobileTheme } from "@/ui/theme";

export function AutomationsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  type StateFilter = "all" | "enabled" | "paused";
  const [filter, setFilter] = useState<StateFilter>("all");
  const [filterDraft, setFilterDraft] = useState<StateFilter | null>(null);
  const filterOptions: { value: StateFilter; label: string }[] = [
    { value: "all", label: copy("Tümü", "All") },
    { value: "enabled", label: copy("Etkin", "Enabled") },
    { value: "paused", label: copy("Duraklatılmış", "Paused") },
  ];
  const machine = useActiveMachine();
  const { projectId, setProjectId } = useLocalProjectScope();
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
  const scoped = query.data?.filter(item => !projectId || item.projectId === projectId);
  const visible = scoped?.filter(item => (filter === "all" || (filter === "enabled") === item.enabled) && matchesSearch(item.name + " " + item.prompt, search, locale));
  const canCreate = !!providers.length && !editor && !busy;
  const startNew = () => {
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
          scheduleKind: "daily",
          time: "09:00",
          minute: 0,
          dayOfWeek: 1,
          maxRunsPerDay: 0,
        },
      });
  };
  return (
    <ScreenList<HostAutomation>
      title={copy("Otomasyonlar", "Automations")}
      query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      context={<Scope allowAll projectId={projectId} onChange={setProjectId} />}
      actions={
        <IconButton
          label={copy("Yeni otomasyon", "New automation")}
          disabled={!canCreate}
          onPress={startNew}
        >
          <Plus size={22} strokeWidth={2.2} color={colors.accent} />
        </IconButton>
      }
      header={
        <>
          {!projectId ? (
            <Body muted>
              {copy(
                "Projesiz otomasyonlar Room içinde çalışır.",
                "Projectless automations run in Room.",
              )}
            </Body>
          ) : null}
          {!providers.length ? <>{providerQuery.isLoading || providerQuery.error ? <QueryState query={providerQuery} loading="inline" /> : <AgentProviderPrerequisite />}</> : null}
          <FilterSheet
            visible={filterDraft !== null}
            onClose={() => setFilterDraft(null)}
            onReset={() => setFilterDraft("all")}
            onApply={() => { if (filterDraft !== null) setFilter(filterDraft); setFilterDraft(null); }}
          >
            <SelectField
              label={copy("Duruma göre filtrele", "Filter by state")}
              value={filterDraft ?? filter}
              options={filterOptions}
              onChange={setFilterDraft}
            />
          </FilterSheet>
          <SearchToolbar
            search={<SearchField ref={searchInput} label={copy("Ad veya talimatta ara", "Search automation names and instructions")} value={search} onChangeText={setSearch} />}
            actions={<FilterButton count={filter !== "all" ? 1 : 0} onPress={() => setFilterDraft(filter)} />}
          />
          <AppliedFilters filters={[filter !== "all" && `${copy("Durum", "State")}: ${filterOptions.find((option) => option.value === filter)?.label}`]} />

          {!editor && !visible?.some(item => item.id === savedAutomationId(save.variables)) && (
            <MutationState
              mutation={save}
              success={copy("Otomasyon kaydedildi.", "Automation saved.")}
            />
          )}
          {!visible?.some(item => item.id === run.variables?.automationId) && <MutationState mutation={run} success={copy("Çalıştırma istendi.", "Run requested.")} />}
          {!visible?.some(item => item.id === remove.variables?.automationId) && <MutationState
            mutation={remove}
            success={copy("Otomasyon silindi.", "Automation deleted.")}
          />}
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
              title={copy("Otomasyon ayrıntıları", "Automation details")}
              onClose={() => {
                if (!busy) setEditor(null);
              }}
            >
              <AutomationEditor
                key={draft.id}
                initial={draft}
                save={save}
                busy={busy}
                onClose={() => setEditor(null)}
              />
            </Sheet>
          )}
          <QueryState
            query={query}
            empty={visible?.length === 0}
            emptyTitle={
              (search.trim() || filter !== "all") && scoped?.length
                ? copy("Eşleşen sonuç yok", "No matching results")
                : copy("Henüz otomasyon yok", "No automations yet")
            }
            emptyDetail={scoped?.length ? undefined : copy("Otomasyon, ajanı belirlediğiniz zamanda otomatik çalıştırır.", "An automation runs an agent on a schedule you choose.")}
            emptyAction={
              scoped?.length && (search.trim() || filter !== "all")
                ? search.trim()
                  ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
                  : { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => setFilter("all") }
                : canCreate
                  ? { label: copy("Yeni otomasyon", "New automation"), onPress: startNew }
                  : undefined
            }
          />
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
