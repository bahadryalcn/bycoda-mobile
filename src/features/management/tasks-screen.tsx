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
import { getQueryPresentation } from "@/ui/query-presentation";
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
import { router, useLocalSearchParams } from "expo-router";
import { useProjectList } from "../workspace/use-project-directory";
import { GitDeliverySheet } from "../workspace/git-delivery";

const newTaskStatus = "todo";

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
  const [reviewTask, setReviewTask] = useState<HostTask | null>(null);
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
  const canCreateInScope = () => projects.directoryReady && (!projectId || projects.isProjectVisible(projectId));
  const start = () => {
    if (!canCreate || !canCreateInScope()) return;
    save.reset();
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
        status: newTaskStatus,
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
  const canCreate = canCreateInScope() && providers.length > 0 && !busy && !editor && !deliveryTask && !reviewTask;
  const presentation = getQueryPresentation(query);
  const hasScopedTasks = !!query.data?.length;
  const showCreateInHeader = hasScopedTasks &&
    (presentation === "ready" || presentation === "stale-error");
  const searchActive = !linkedTaskId && !!search.trim();
  const statusHidesTasks = !linkedTaskId && filter !== "all" &&
    (hasScopedTasks || !taskMatchesFilter({ status: newTaskStatus }, filter));
  const emptyAction = searchActive
    ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
    : statusHidesTasks
      ? { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => setFilter("all") }
      : query.data?.length === 0 && !linkedTaskId && canCreate
        ? { label: copy("Yeni görev", "New task"), onPress: start }
        : undefined;
  const visible = query.data?.filter(
    (task) =>
      linkedTaskId ? task.id === linkedTaskId : taskMatchesFilter(task, filter) &&
      matchesSearch(task.title + " " + task.prompt, search, locale),
  );
  const filterContext = <AppliedFilters filters={[filter !== "active" && `${copy("Durum", "Status")}: ${filterOptions.find(option => option.value === filter)?.label ?? filter}`]} />;
  return (
    <ScreenList<HostTask>
      title={linkedTaskId ? copy("Görev", "Task") : copy("Görevler", "Tasks")}
      query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      context={linkedTaskId ? undefined : <Scope allowAll projectId={selectedProjectId} onChange={setProjectId} />}
      actions={linkedTaskId ? (
        <Button label={copy("Tümü", "Show all")} tone="quiet" reserveTouchTarget disabled={busy || !!editor || !!deliveryTask || !!reviewTask}
          onPress={() => router.replace({ pathname: "/manage/[section]", params: { section: "tasks" } })} />
      ) : showCreateInHeader ? (
        <IconButton label={copy("Yeni görev", "New task")} disabled={!canCreate} onPress={start}>
          <Plus size={22} strokeWidth={2.2} color={colors.accent} />
        </IconButton>
      ) : undefined}
      header={
        <>
          {!linkedTaskId ? <>
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
          {machine ? <TaskBulkActions key={`${machine.id}:${projectId ?? "all"}`} tasks={presentation === "error" ? [] : visible ?? []} machineId={machine.id} disabled={busy && !bulkBusy || !!editor || !!deliveryTask || !!reviewTask}
            context={filterContext} onBusy={setBulkBusy} onComplete={async () => { await listQuery.refetch(); }} /> : filterContext}
          {!providers.length ? <>{providerQuery.isLoading || providerQuery.error ? <QueryState query={providerQuery} loading="inline" /> : <AgentProviderPrerequisite />}</> : null}
          </> : null}
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
              title={editor?.kind === "new" ? copy("Yeni görev", "New task") : copy("Görev ayrıntıları", "Task details")}
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
          {reviewTask?.branch ? <GitDeliverySheet
            scope={{ projectId: reviewTask.projectId }} branch={reviewTask.branch}
            task={reviewTask} onClose={() => setReviewTask(null)} /> : null}
          <QueryState
            query={query}
            empty={visible?.length === 0}
            emptyTitle={linkedTaskId ? copy("Görev artık bulunamadı.", "The task is no longer available.")
              : searchActive ? copy("Eşleşen sonuç yok", "No matching results") : copy("Bu görünümde görev yok", "No tasks in this view")}
            emptyDetail={linkedTaskId || searchActive || statusHidesTasks ? undefined
              : copy("Görevler bağlı bilgisayarında çalışır.", "Tasks run on your connected computer.")}
            emptyAction={emptyAction}
          />
        </>
      }
      renderItem={({ item: task }) => (
        <TaskCard
          task={task}
          projectName={projects.data?.find((project) => project.id === task.projectId)?.name}
          busy={busy}
          editorOpen={!!draft || !!deliveryTask || !!reviewTask}
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
          onReviewDelivery={setReviewTask}
          onEdit={(task) => {
            save.reset();
            setEditor({ kind: "edit", id: task.id, projectId: task.projectId });
          }}
        />
      )}
    />
  );
}
