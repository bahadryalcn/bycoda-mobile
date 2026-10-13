import { useEditorRecord } from "./shared/use-editor-record";
import { Input } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { useState } from "react";

import {
  Body,
  Button,
  Card,
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
import { useActiveMachine, useMachines } from "@/state/machines";
import type { HostTask } from "@/domain/types";
import { identifier } from "./shared/format";
import { initialAgent } from "./shared/agent";
import { Scope } from "./shared/scope";
import { taskMatchesFilter } from "./task-actions";

import { TaskEditor } from "./tasks/task-editor";
import { DeliveryEditor } from "./tasks/delivery-editor";
import { TaskCard } from "./tasks/task-card";
import type { TaskEditorFlow } from "./tasks/types";

export function TasksScreen() {
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const query = useHostQuery<HostTask[]>(
    ["tasks", projectId],
    "tasks.list",
    projectId ? { projectId } : {},
    { interval: 5000 },
  );
  const lifecycleSupported = !!machine?.capabilities?.includes("tasks.workspaces");
  const allTasks = useHostQuery<HostTask[]>(["tasks", null], "tasks.list", {}, { enabled: lifecycleSupported && !!projectId, interval: 5000 });
  const save = useHostMutation<HostTask>("tasks.save", ["tasks"]);
  const move = useHostMutation<HostTask>("tasks.move", ["tasks"]);
  const remove = useHostMutation("tasks.delete", ["tasks"]);
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
  const draft = useEditorRecord(editor?.kind === "new" ? editor.initial.id : editor?.id ?? null, fetchedDraft);
  const [filter, setFilter] = useState<string>("active");
  const start = () => {
    save.reset();
    if (projectId)
      setEditor({
        kind: "new",
        initial: {
          ...initialAgent(machine?.providers),
          id: identifier(),
          title: "",
          prompt: "",
          projectId,
          isolate: true,
          review: true,
          autoMerge: false,
          continueUntilDone: true,
          verifyCommand: "",
          status: "todo",
        },
      });
  };
  const busy = save.isPending || move.isPending || remove.isPending || recheck.isPending || manualStart.isPending || reorder.isPending;
  const visible = query.data?.filter((task) => taskMatchesFilter(task, filter) && (task.title + " " + task.prompt).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return (
    <ScreenList<HostTask> title={copy("Görevler", "Tasks")} query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      header={<>
      <Scope allowAll />
      <Input label={copy("Ara", "Search")} placeholder={copy("Ara", "Search")} value={search} onChangeText={setSearch} autoCorrect={false} />
      <Row>
        <Button
          label={copy("Yeni görev", "New task")}
          onPress={start}
          disabled={!projectId || !machine?.providers?.length || busy || !!editor}
        />
      </Row>
      <SelectField
        label={copy("Durum", "Status")}
        value={filter}
        options={[
          { value: "active", label: copy("Aktif", "Active") },
          { value: "todo", label: copy("Yapılacak", "To do") },
          { value: "queued", label: copy("Sırada", "Queued") },
          { value: "running", label: copy("Çalışıyor", "Running") },
          { value: "review", label: copy("İncelemede", "In review") },
          { value: "blocked", label: copy("Engellendi", "Blocked") },
          { value: "done", label: copy("Tamamlandı", "Done") },
          { value: "all", label: copy("Tümü", "All") },
        ]}
        onChange={setFilter}
      />
      {!projectId && (
        <Body muted>
          {copy("Görev eklemek için projesini seçin.", "Select a project to add a task.")}
        </Body>
      )}
      {!editor && <MutationState mutation={save} success={copy("Görev kaydedildi.", "Task saved.")} />}
      <MutationState mutation={move} />
      <MutationState mutation={remove} success={copy("Görev silindi.", "Task deleted.")} />
      <MutationState mutation={recheck} />
      <MutationState mutation={manualStart} />
      <MutationState mutation={reorder} />
      {lifecycleSupported && projectId && <QueryState query={allTasks} loading="none" />}
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
      <Sheet visible={!!deliveryTask} size="form" title={copy("Teslim hedefi", "Delivery target")} onClose={() => setDeliveryTask(null)}>
        {deliveryTask && <DeliveryEditor key={deliveryTask.id} task={deliveryTask} onClose={() => setDeliveryTask(null)} />}
      </Sheet>
      <QueryState
        query={query}
        empty={visible?.length === 0}
        emptyTitle={copy("Bu görünümde görev yok", "No tasks in this view")}
      />
      {search.trim() && visible?.length === 0 ? <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} /> : null}
      </>}
      renderItem={({ item: task }) => (
        <TaskCard
          task={task}
          busy={busy}
          editorOpen={!!draft || !!deliveryTask}
          move={move}
          remove={remove}
          recheck={recheck}
          start={manualStart}
          reorder={reorder}
          tasks={(projectId ? allTasks.data : query.data) ?? []}
          lifecycleReady={!projectId || !!allTasks.data}
          onDelivery={setDeliveryTask}
          onEdit={(task) => { save.reset(); setEditor({ kind: "edit", id: task.id, projectId: task.projectId }); }}
        />
      )}
    />

  );
}
