import { ScreenList } from "@/ui/screen-list";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import { useProjectList } from "../workspace/use-project-directory";
import { useReducer, useRef, useState, type ComponentRef } from "react";
import Plus from "lucide-react-native/icons/plus";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";

import {
  Button,
  IconButton,
  MutationState,
  Notice,
  Heading,
  QueryState,
  SearchField,
  SearchToolbar,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostGoal } from "@/domain/types";
import { useAgentProviders } from "./shared/agent";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";

import { goalFlowReducer } from "./goals/flow";
import { GoalEditor } from "./goals/goal-editor";
import { ReplanEditor } from "./goals/replan-editor";
import { GoalCard } from "./goals/goal-card";
import { GoalSettingsEditor } from "./goals/settings-editor";
import { useMobileTheme } from "@/ui/theme";

/** Poll often only while an agent is working on a goal; otherwise refresh slowly. */
export function goalsPollInterval(goals: readonly Pick<HostGoal, "status">[] | undefined): number {
  return goals?.some((goal) => goal.status === "running" || goal.status === "planning")
    ? 5000
    : 15_000;
}

type GoalFilter = "all" | "open" | "awaiting" | "finished";
const goalFilterMatches = (status: HostGoal["status"], filter: GoalFilter) =>
  filter === "all" ||
  (filter === "open" && ["planning", "running", "blocked"].includes(status)) ||
  (filter === "awaiting" && status === "awaiting-approval") ||
  (filter === "finished" && ["done", "cancelled"].includes(status));

export function GoalsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [filter, setFilter] = useState<GoalFilter>("all");
  const [filterDraft, setFilterDraft] = useState<GoalFilter | null>(null);
  const filterOptions: { value: GoalFilter; label: string }[] = [
    { value: "all", label: copy("Tümü", "All") },
    { value: "open", label: copy("Devam eden", "In progress") },
    { value: "awaiting", label: copy("Onay bekleyen", "Awaiting approval") },
    { value: "finished", label: copy("Bitmiş", "Finished") },
  ];
  const machine = useActiveMachine();
  const { projectId, setProjectId } = useLocalProjectScope();
  const { providers, query: providerQuery } = useAgentProviders(projectId);
  const query = useHostQuery<HostGoal[]>(["goals"], "goals.list", {}, { interval: goalsPollInterval });
  const projects = useProjectList();
  const create = useHostMutation<HostGoal>("goals.create", ["goals"]);
  const approve = useHostMutation<HostGoal>("goals.approve", ["goals"]);
  const cancel = useHostMutation<HostGoal>("goals.cancel", ["goals"]);
  const remove = useHostMutation("goals.delete", ["goals"]);
  const replan = useHostMutation<HostGoal>("goals.replan", ["goals"]);
  const [flow, dispatch] = useReducer(goalFlowReducer, { kind: "closed" });
  const close = () => dispatch({ type: "close" });
  const busy =
    create.isPending ||
    approve.isPending ||
    cancel.isPending ||
    remove.isPending ||
    replan.isPending;
  const scoped = query.data?.filter((goal) => !projectId || goal.projectIds.includes(projectId));
  const visible = scoped?.filter((goal) => goalFilterMatches(goal.status, filter) && matchesSearch(goal.title + " " + goal.prompt, search, locale));
  const replanGoal =
    flow.kind === "replan" ? query.data?.find((goal) => goal.id === flow.goalId) : undefined;
  const projectReady = projects.directoryReady && (!projectId || projects.isProjectVisible(projectId));
  const canCreate = projectReady && !!providers.length && flow.kind === "closed" && !busy;
  const startNew = () => { if (!canCreate) return; create.reset(); dispatch({ type: "new", projectId: projectId ?? "" }); };
  return (
    <ScreenList<HostGoal> title={copy("Epicler", "Epics")} query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      context={<Scope allowAll projectId={projectId} onChange={setProjectId} />}
      actions={
        <IconButton
          label={copy("Yeni epic", "New epic")}
          disabled={!canCreate}
          onPress={startNew}
        >
          <Plus size={22} strokeWidth={2.2} color={colors.accent} />
        </IconButton>
      }
      header={<>

      {!providers.length && <>{providerQuery.isLoading || providerQuery.error ? <QueryState query={providerQuery} loading="inline" /> : <AgentProviderPrerequisite />}</>}
      <FilterSheet
        visible={filterDraft !== null}
        onClose={() => setFilterDraft(null)}
        onReset={() => setFilterDraft("all")}
        onApply={() => { if (filterDraft !== null) setFilter(filterDraft); setFilterDraft(null); }}
      >
        <SelectField
          label={copy("Duruma göre filtrele", "Filter by status")}
          value={filterDraft ?? filter}
          options={filterOptions}
          onChange={setFilterDraft}
        />
      </FilterSheet>
      <SearchToolbar
        search={<SearchField ref={searchInput} label={copy("Başlık veya epicte ara", "Search epic titles and outcomes")} value={search} onChangeText={setSearch} />}
        actions={<FilterButton count={filter !== "all" ? 1 : 0} onPress={() => setFilterDraft(filter)} />}
      />
      <AppliedFilters filters={[filter !== "all" && `${copy("Durum", "Status")}: ${filterOptions.find((option) => option.value === filter)?.label}`]} />
      {flow.kind === "closed" && <MutationState
        mutation={create}
        success={copy("Epic planlaması istendi.", "Epic planning requested.")}
      />}
      {!visible?.some(goal => goal.id === approve.variables?.goalId) && <MutationState mutation={approve} />}
      {!visible?.some(goal => goal.id === cancel.variables?.goalId) && <MutationState mutation={cancel} />}
      {!visible?.some(goal => goal.id === remove.variables?.goalId) && <MutationState mutation={remove} />}
      {flow.kind === "closed" && <MutationState mutation={replan} />}
      {flow.kind === "new" && (
        <Sheet
          visible
          size="form"
          title={copy("Yeni epic", "New epic")}
          onClose={() => {
            if (!busy) close();
          }}
        >
          <GoalEditor
            key={flow.projectId}
            projectId={flow.projectId}
            projects={projects.data ?? []}
            providers={providers}
            create={create}
            busy={busy}
            onClose={close}
          />
        </Sheet>
      )}
      {flow.kind === "settings" && <Sheet visible size="form" title={copy("Epic ayarları", "Epic settings")} onClose={close}>
        <GoalSettingsEditor key={flow.goal.id} initial={flow.goal} onClose={close} />
      </Sheet>}
      {replanGoal && (
        <Sheet
          visible
          size="form"
          title={copy("Planı değiştir", "Revise plan")}
          onClose={() => {
            if (!busy) close();
          }}
        >
          <Heading>{replanGoal.title}</Heading>
          <ReplanEditor
            key={replanGoal.id}
            goalId={replanGoal.id}
            replan={replan}
            busy={busy}
            onClose={close}
          />
        </Sheet>
      )}
      {flow.kind === "replan" && query.isSuccess && !replanGoal && (
        <Notice
          tone="warning"
          message={copy("Epic artık bulunamadı.", "The epic is no longer available.")}
        >
          <Button label={copy("Kapat", "Close")} onPress={close} />
        </Notice>
      )}
      <QueryState
        query={query}
        empty={visible?.length === 0}
        emptyTitle={(search.trim() || filter !== "all") && scoped?.length ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz epic yok", "No epics yet")}
        emptyDetail={scoped?.length ? undefined : copy("Epic, bilgisayardaki ajanın projelerinizde görevlere böleceği bir sonuçtur.", "A epic is an outcome the agent on your computer breaks into tasks across your projects.")}
        emptyAction={
          scoped?.length && (search.trim() || filter !== "all")
            ? search.trim()
              ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
              : { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => setFilter("all") }
            : canCreate
              ? { label: copy("Yeni epic", "New epic"), onPress: startNew }
              : undefined
        }
      />
      </>}
      renderItem={({ item: goal }) => (
        <GoalCard
          goal={goal}
          projects={projects.data ?? []}
          busy={busy}
          editorOpen={flow.kind !== "closed"}
          approve={approve}
          cancel={cancel}
          remove={remove}
          onReplan={(goalId) => { replan.reset(); dispatch({ type: "replan", goalId }); }}
          onSettings={(goal) => dispatch({ type: "settings", goal })}
        />
      )}
    />

  );
}
