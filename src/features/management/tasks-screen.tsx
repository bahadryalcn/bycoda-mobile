import { useEditorRecord } from "./shared/use-editor-record";
import { ScreenList } from "@/ui/screen-list";
import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import Plus from "lucide-react-native/icons/plus";

import {
  Body,
  Button,
  Card,
  IconButton,
  SearchField,
  SearchToolbar,
  SelectField,
  Sheet,
  MutationState,
  Notice,
  QueryState,
  Row,
  Screen,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostTask } from "@/domain/types";
import { identifier } from "./shared/format";
import { initialAgent, useAgentProviders } from "./shared/agent";
import { Scope } from "./shared/scope";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";
import { taskMatchesFilter } from "./task-actions";

import { TaskEditor } from "./tasks/task-editor";
import { DeliveryEditor } from "./tasks/delivery-editor";
import { TaskCard } from "./tasks/task-card";
import { TaskDeclineFeedback } from "./tasks/task-feedback";
import { TaskBulkActions } from "./tasks/bulk-actions";
import type { TaskEditorFlow } from "./tasks/types";
import { useMobileTheme } from "@/ui/theme";
import { useLocalSearchParams } from "expo-router";
import { useProjectList } from "../workspace/use-project-directory";

export function TasksScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [bulkBusy, setBulkBusy] = useState(false);
  const machine = useActiveMachine();
  const projects = useProjectList();
  const linked = useLocalSearchParams<{ taskId?: string; projectId?: string; machineId?: string }>();
  const { projectId: selectedProjectId, setProjectId } = useLocalProjectScope();
  const linkedTaskId = linked.machineId === machine?.id ? linked.taskId : undefined;
  const projectId = linkedTaskId && linked.projectId ? linked.projectId : selectedProjectId;
  const { providers, query: providerQuery } = useAgentProviders(projectId);
  const lifecycleSupported = !!machine?.capabilities?.includes("tasks.workspaces");
  // Lifecycle context needs every project's tasks, so a scoped lifecycle host polls the
  // global list once and filters the project client side (the Host filters by exact
  // projectId and sorts identically); other hosts poll the scoped list directly.
  const scoped = lifecycleSupported && !!projectId;
  const listQuery = useHostQuery<HostTask[]>(
    ["tasks", scoped ? null : projectId],
    "tasks.list",
    projectId && !scoped ? { projectId } : {},
    { interval: 5000 },
  );
  const query = scoped
    ? { ...listQuery, data: listQuery.data?.filter((task) => task.projectId === projectId) }
    : listQuery;
  const lifecycleTasks = scoped || !projectId ? listQuery.data : undefined;
  const save = useHostMutation<HostTask>("tasks.save", ["tasks"]);
  const move = useHostMutation<HostTask>("tasks.move", ["tasks"]);
  const remove = useHostMutation("tasks.delete", ["tasks"]);
  const decline = useHostMutation("stewards.decline", ["tasks"]);
  const finish = useHostMutation<HostTask>("tasks.finishWithFindings", ["tasks"]);
  const recheck = useHostMutation("tasks.review.recheck", ["tasks"]);
  const manualStart = useHostMutation<HostTask>("tasks.start", ["tasks"]);
  const reorder = useHostMutation("tasks.reorder", ["tasks"]);
  const [editor, setEditor] = useState<TaskEditorFlow>(null);
  const [deliveryTask, setDeliveryTask] = useState<HostTask | null>(null);
  const editProjectId = editor?.kind === "edit" ? editor.projectId : null;
  const editQuery = useHostQuery<HostTask[]>(
    ["tasks", editProjectId],
    "tasks.list",
    editProjectId ? { projectId: editProjectId } : {},
    { enabled: editor?.kind === "edit" },
  );
  const fetchedDraft =
    editor?.kind === "new"
      ? editor.initial
      : editor?.kind === "edit"
        ? editQuery.data?.find((task) => task.id === editor.id)
        : undefined;
  const draft = useEditorRecord(
    editor?.kind === "new" ? editor.initial.id : (editor?.id ?? null),
    fetchedDraft,
  );
  const [filter, setFilter] = useState<string>("active");
  const [filterDraft, setFilterDraft] = useState<string | null>(null);
  const start = () => {
    save.reset();
    if (providers.length)
      setEditor({
        kind: "new",
        initial: {
          ...initialAgent(providers),
          inheritMaxRunMinutes: true,
          id: identifier(),
          title: "",
          prompt: "",
          projectId: projectId ?? "",
          isolate: true,
          review: true,
          autoMerge: false,
          continueUntilDone: true,
          verifyCommand: "",
          status: "todo",
        },
      });
  };
  const filterOptions = [
    { value: "active", label: copy("Aktif", "Active") },
    { value: "todo", label: copy("Yapılacak", "To do") },
    { value: "queued", label: copy("Sırada", "Queued") },
    { value: "running", label: copy("Çalışıyor", "Running") },
    { value: "review", label: copy("İncelemede", "In review") },
    { value: "blocked", label: copy("Engellendi", "Blocked") },
    { value: "done", label: copy("Tamamlandı", "Done") },
    { value: "all", label: copy("Tümü", "All") },
  ];
  const busy =
    bulkBusy ||
    save.isPending ||
    move.isPending ||
    remove.isPending ||
    decline.isPending ||
    recheck.isPending ||
    finish.isPending ||
    manualStart.isPending ||
    reorder.isPending;
  const visible = query.data?.filter(
    (task) =>
      linkedTaskId ? task.id === linkedTaskId : taskMatchesFilter(task, filter) &&
      matchesSearch(task.title + " " + task.prompt, search, locale),
  );
  const filterContext = <AppliedFilters filters={[filter !== "active" && `${copy("Durum", "Status")}: ${filterOptions.find(option => option.value === filter)?.label ?? filter}`]} />;
  return (
    <ScreenList<HostTask>
      title={copy("Görevler", "Tasks")}
      query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      context={<Scope allowAll projectId={selectedProjectId} onChange={setProjectId} />}
      actions={
        <>
          <IconButton
            label={copy("Yeni görev", "New task")}
            disabled={!providers.length || busy || !!editor}
            onPress={start}
          >
            <Plus size={22} strokeWidth={2.2} color={colors.accent} />
          </IconButton>
        </>
      }
      header={
        <>
          <FilterSheet
            visible={filterDraft !== null}
            onClose={() => setFilterDraft(null)}
            onReset={() => setFilterDraft("active")}
            onApply={() => {
              if (filterDraft !== null) setFilter(filterDraft);
              setFilterDraft(null);
            }}
          >
            <SelectField
              label={copy("Duruma göre filtrele", "Filter by status")}
              value={filterDraft ?? filter}
              options={filterOptions}
              onChange={setFilterDraft}
            />
          </FilterSheet>
          <SearchToolbar search={<SearchField ref={searchInput} label={copy("Görevlerde ara", "Search tasks")} value={search} onChangeText={setSearch} />}
            actions={<FilterButton count={filter !== "active" ? 1 : 0} onPress={() => setFilterDraft(filter)} />} />
          {machine ? <TaskBulkActions key={`${machine.id}:${projectId ?? "all"}`} tasks={visible ?? []} machineId={machine.id} disabled={busy && !bulkBusy || !!editor || !!deliveryTask}
            context={filterContext} onBusy={setBulkBusy} onComplete={async () => { await listQuery.refetch(); }} /> : filterContext}
          {!providers.length ? <>{providerQuery.isLoading || providerQuery.error ? <QueryState query={providerQuery} loading="inline" /> : <AgentProviderPrerequisite />}</> : null}
          {!editor && (
            <MutationState mutation={save} success={copy("Görev kaydedildi.", "Task saved.")} />
          )}
          {!visible?.some((task) => task.id === move.variables?.taskId) ? <MutationState mutation={move} /> : null}
          {!visible?.some((task) => task.id === remove.variables?.taskId) ? <MutationState mutation={remove} success={copy("Görev silindi.", "Task deleted.")} /> : null}
          {!visible?.some((task) => task.id === recheck.variables?.taskId) ? <MutationState mutation={recheck} /> : null}
          {!visible?.some((task) => task.id === decline.variables?.taskId) ? <TaskDeclineFeedback mutation={decline} /> : null}
          {!visible?.some((task) => task.id === manualStart.variables?.taskId) ? <MutationState mutation={manualStart} /> : null}
          <MutationState mutation={reorder} />
          {editor?.kind === "edit" && !draft && (
            <Card>
              <QueryState query={editQuery} empty={editQuery.data?.length === 0} />
              <Button
                label={copy("Düzenlemeyi kapat", "Close editor")}
                onPress={() => setEditor(null)}
              />
              {editQuery.isSuccess && (
                <Notice
                  tone="warning"
                  message={copy("Görev artık bulunamadı.", "The task is no longer available.")}
                />
              )}
            </Card>
          )}
          {draft && (
            <Sheet
              visible
              size="form"
              title={copy("Görev ayrıntıları", "Task details")}
              onClose={() => {
                if (!busy) setEditor(null);
              }}
            >
              <TaskEditor
                key={draft.id}
                initial={draft}
                save={save}
                busy={busy}
                onClose={() => setEditor(null)}
              />
            </Sheet>
          )}
          <Sheet
            visible={!!deliveryTask}
            size="form"
            title={copy("Teslim hedefi", "Delivery target")}
            onClose={() => setDeliveryTask(null)}
          >
            {deliveryTask && (
              <DeliveryEditor
                key={deliveryTask.id}
                task={deliveryTask}
                onClose={() => setDeliveryTask(null)}
              />
            )}
          </Sheet>
          <QueryState
            query={query}
            empty={visible?.length === 0}
            emptyTitle={search.trim() && query.data?.length ? copy("Eşleşen sonuç yok", "No matching results") : copy("Bu görünümde görev yok", "No tasks in this view")}
            emptyDetail={search.trim() && query.data?.length ? undefined
              : copy("Görevler sırayla bir agent tarafından çalıştırılır; durumları burada görünür.", "Tasks run one after another by an agent; their status shows here.")}
            emptyAction={query.data?.length ? search.trim()
              ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
              : filter !== "all" ? { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => setFilter("all") } : undefined
              : providers.length && !busy && !editor
                ? { label: copy("Yeni görev", "New task"), onPress: start } : undefined}
          />
        </>
      }
      renderItem={({ item: task }) => (
        <TaskCard
          task={task}
          projectName={projects.data?.find((project) => project.id === task.projectId)?.name}
          busy={busy}
          editorOpen={!!draft || !!deliveryTask}
          move={move}
          remove={remove}
          decline={decline}
          recheck={recheck}
          finish={finish}
          start={manualStart}
          reorder={reorder}
          tasks={lifecycleTasks ?? []}
          lifecycleReady={!projectId || !!lifecycleTasks}
          onDelivery={setDeliveryTask}
          onEdit={(task) => {
            save.reset();
            setEditor({ kind: "edit", id: task.id, projectId: task.projectId });
          }}
        />
      )}
    />
  );
}
