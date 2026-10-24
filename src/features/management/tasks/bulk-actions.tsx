import { useEffect, useRef, useState } from "react";
import { Body, Button, Disclosure, MultiSelectField, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useHostMutation } from "@/state/queries";
import type { HostTask } from "@/domain/types";
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
}: {
  tasks: readonly HostTask[];
  machineId: string;
  onBusy: (busy: boolean) => void;
  onComplete: () => Promise<unknown>;
  disabled: boolean;
}) {
  const copy = useCopy();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [results, setResults] = useState<TaskBulkResult[]>([]);
  const [action, setAction] = useState<TaskBulkAction>("delete");
  const remove = useHostMutation("tasks.delete");
  const start = useHostMutation("tasks.start");
  const move = useHostMutation("tasks.move");
  useEffect(() => {
    const ids = new Set(tasks.map((task) => task.id));
    setSelected((current) =>
      current.every((id) => ids.has(id)) ? current : current.filter((id) => ids.has(id)),
    );
  }, [tasks]);
  const labels = {
    delete: copy("Sil", "Delete"),
    start: copy("Başlat", "Start"),
    stop: copy("Durdur", "Stop"),
    retry: copy("Tekrar dene", "Retry"),
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
      await onComplete();
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const request = (operation: TaskBulkAction, retry = false) => {
    if (busy || disabled) return;
    if (operation === "delete" || operation === "stop")
      confirmAction(
        labels[operation],
        copy(
          "Yalnız seçilen görevler işlenecek. Aktif görevler ve birleştirilmemiş kod silinmez.",
          "Only selected tasks are affected. Active tasks and unmerged code are protected from deletion.",
        ),
        labels[operation],
        () => {
          void run(operation, retry);
        },
        copy("İptal", "Cancel"),
      );
    else void run(operation, retry);
  };
  return (
    <Disclosure label={copy("Toplu işlemler", "Bulk actions")}>
      <MultiSelectField
        label={copy("Görevleri seç", "Select tasks")}
        values={selected}
        options={tasks.map((task) => ({ value: task.id, label: task.title }))}
        onChange={setSelected}
        disabled={busy || disabled}
        searchable
      />
      <Row>
        <Button
          label={copy("Sonuçların tümünü seç", "Select all results")}
          tone="quiet"
          disabled={busy || disabled || !tasks.length}
          onPress={() => setSelected(tasks.map((task) => task.id))}
        />
        <Button
          label={copy("Seçimi temizle", "Clear selection")}
          tone="quiet"
          disabled={busy || disabled || !selected.length}
          onPress={() => setSelected([])}
        />
      </Row>
      <Body>
        {copy("Seçilen", "Selected")}: {selected.length}
      </Body>
      <Row>
        {(["start", "stop", "retry", "delete"] as const).map((operation) => (
          <Button
            key={operation}
            label={labels[operation]}
            tone={operation === "delete" ? "danger" : "quiet"}
            disabled={busy || disabled || !selected.length}
            onPress={() => request(operation)}
          />
        ))}
      </Row>
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
                {row.task.title}: {row.reason}
              </Body>
            ))}
        </Disclosure>
      ) : null}
      {results.some((row) => row.status === "failed") ? (
        <Button
          label={copy("Başarısızları tekrar dene", "Retry failed tasks")}
          disabled={busy || disabled}
          onPress={() => request(action, true)}
        />
      ) : null}
    </Disclosure>
  );
}
