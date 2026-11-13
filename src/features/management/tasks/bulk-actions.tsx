import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActionMenu,
  Body,
  Button,
  Disclosure,
  ErrorNotice,
  Loading,
  MultiSelectField,
  Notice,
  Row,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useHostMutation } from "@/state/queries";
import type { HostTask } from "@/domain/types";
import { taskBulkReason } from "./bulk-feedback";
import {
  runTaskBulkAction,
  type TaskBulkAction,
  type TaskBulkResult,
} from "../../../../../src/features/tasks/model/taskBulkActions";

export function TaskBulkActions({
  tasks,
  machineId,
  onBusy,
  onComplete,
  disabled,
  context,
}: {
  tasks: readonly HostTask[];
  machineId: string;
  onBusy: (busy: boolean) => void;
  onComplete: () => Promise<unknown>;
  disabled: boolean;
  context?: ReactNode;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const opening = useRef<object | null>(null);
  const port = opening.current;
  useEffect(
    () => () => {
      opening.current = null;
    },
    [],
  );
  const show = () => {
    opening.current = {};
    setOpen(true);
  };
  const close = () => {
    opening.current = null;
    setOpen(false);
  };
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>();
  const [actionError, setActionError] = useState<unknown>();
  const [refreshing, setRefreshing] = useState(false);
  const lock = useRef(false);
  const [results, setResults] = useState<TaskBulkResult[]>([]);
  const [action, setAction] = useState<TaskBulkAction>("delete");
  const remove = useHostMutation("tasks.delete");
  const start = useHostMutation("tasks.start");
  const move = useHostMutation("tasks.move");
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (seenTasks !== tasks) {
    // Prune during render (not derived each time) so a task that leaves and
    // later returns is not silently re-selected for a destructive bulk action.
    setSeenTasks(tasks);
    const ids = new Set(tasks.map((task) => task.id));
    if (!selected.every((id) => ids.has(id))) setSelected(selected.filter((id) => ids.has(id)));
  }
  const labels = {
    delete: copy("Sil", "Delete"),
    start: copy("Başlat", "Start"),
    stop: copy("Durdur", "Stop"),
    retry: copy("Tekrar dene", "Retry"),
  };
  const refreshResults = async () => {
    try {
      await onComplete();
      setRefreshError(undefined);
    } catch (error) {
      setRefreshError(error);
    }
  };
  const run = async (operation: TaskBulkAction, retry: boolean) => {
    if (lock.current || disabled) return;
    const ids = new Set(
      retry ? results.filter((row) => row.status === "failed").map((row) => row.task.id) : selected,
    );
    const batch = tasks
      .filter((task) => ids.has(task.id))
      .map((task) => ({ ...task, machineId, machineName: machineId, cwd: "" }));
    if (!batch.length) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setAction(operation);
    setResults([]);
    setActionError(undefined);
    setRefreshError(undefined);
    try {
      await runTaskBulkAction(
        batch,
        operation,
        async (task, next) => {
          if (next === "delete")
            await remove.mutateAsync({ taskId: task.id, expectedUpdatedAt: task.updatedAt });
          else if (next === "start") await start.mutateAsync({ taskId: task.id });
          else
            await move.mutateAsync({ taskId: task.id, to: next === "stop" ? "blocked" : "queued" });
        },
        (result) => setResults((current) => [...current, result]),
      );
      await refreshResults();
    } catch (error) {
      setActionError(error);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const request = (operation: TaskBulkAction, retry = false) => {
    if (busy || refreshing || disabled || (!retry && (!port || opening.current !== port))) return;
    const approve = () => {
      if (!retry && opening.current !== port) return;
      void run(operation, retry).catch(setActionError);
    };
    if (operation === "delete" || operation === "stop")
      confirmAction(
        labels[operation],
        copy(
          "Yalnız seçilen görevler işlenecek. Aktif görevler ve birleştirilmemiş kod silinmez.",
          "Only selected tasks are affected. Active tasks and unmerged code are protected from deletion.",
        ),
        labels[operation],
        approve,
        copy("İptal", "Cancel"),
      );
    else approve();
  };
  const feedback = (
    <>
      <ErrorNotice error={actionError} />
      {refreshError ? (
        <Notice
          tone="warning"
          message={copy(
            "Görev sonuçları korundu, ancak liste yenilenemedi.",
            "Task results are kept, but the list could not be refreshed.",
          )}
          retryLabel={copy("Yenile", "Refresh")}
          retrying={refreshing}
          onRetry={() => {
            if (lock.current || disabled) return;
            lock.current = true;
            setRefreshing(true);
            void refreshResults().finally(() => {
              lock.current = false;
              setRefreshing(false);
            });
          }}
        />
      ) : null}
      {busy ? <Loading label={labels[action]} /> : null}
      {results.length ? (
        <Body accessibilityLiveRegion="polite">
          {copy("Başarılı", "Succeeded")}:{" "}
          {results.filter((row) => row.status === "succeeded").length}. {copy("Atlanan", "Skipped")}
          : {results.filter((row) => row.status === "skipped").length}.{" "}
          {copy("Başarısız", "Failed")}: {results.filter((row) => row.status === "failed").length}.
        </Body>
      ) : null}
      {results.some((row) => row.status !== "succeeded") ? (
        <Disclosure label={copy("İşlem ayrıntıları", "Operation details")}>
          {results
            .filter((row) => row.status !== "succeeded")
            .map((row) => (
              <Body key={row.task.id}>
                {row.task.title}: {taskBulkReason(row, copy)}
              </Body>
            ))}
        </Disclosure>
      ) : null}
      {results.some((row) => row.status === "failed") ? (
        <Button
          label={copy("Başarısızları tekrar dene", "Retry failed tasks")}
          disabled={busy || refreshing || disabled}
          onPress={() => request(action, true)}
        />
      ) : null}
    </>
  );
  return (
    <>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        {context}
        <Button
          label={
            copy("Toplu işlemler", "Bulk actions") +
            (selected.length ? ` · ${selected.length}` : "")
          }
          accessibilityLabel={copy("Toplu işlemler", "Bulk actions")}
          tone="secondary"
          disabled={disabled || refreshing}
          onPress={show}
        />
      </Row>
      {!open ? feedback : null}
      <Sheet
        visible={open}
        title={copy("Toplu işlemler", "Bulk actions")}
        size="full"
        onClose={close}
        footer={<Button label={copy("Kapat", "Close")} tone="quiet" onPress={close} />}
      >
        <MultiSelectField
          label={copy("Görevleri seç", "Select tasks")}
          values={selected}
          options={tasks.map((task) => ({ value: task.id, label: task.title }))}
          onChange={setSelected}
          disabled={busy || refreshing || disabled}
          searchable
        />
        <Row>
          <Button
            label={copy("Sonuçların tümünü seç", "Select all results")}
            tone="quiet"
            disabled={busy || refreshing || disabled || !tasks.length}
            onPress={() => setSelected(tasks.map((task) => task.id))}
          />
          <Button
            label={copy("Seçimi temizle", "Clear selection")}
            tone="quiet"
            disabled={busy || refreshing || disabled || !selected.length}
            onPress={() => setSelected([])}
          />
        </Row>
        <Row>
          <Button
            label={labels.start}
            tone="primary"
            style={{ flex: 1 }}
            disabled={busy || refreshing || disabled || !selected.length}
            onPress={() => request("start")}
          />
          <ActionMenu
            label={copy("Diğer işlemler", "More actions")}
            actions={(["stop", "retry", "delete"] as const).map((operation) => ({
              key: operation,
              label: labels[operation],
              destructive: operation === "delete",
              disabled: busy || refreshing || disabled || !selected.length,
              onPress: () => request(operation),
            }))}
          />
        </Row>
        {open ? feedback : null}
      </Sheet>
    </>
  );
}
