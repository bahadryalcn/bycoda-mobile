import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Body,
  Button,
  Disclosure,
  ErrorNotice,
  Loading,
  Notice,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useHostMutation } from "@/state/queries";
import type { HostTask } from "@/domain/types";
import { taskBulkReason } from "./bulk-feedback";
import {
  runTaskBulkAction,
  type TaskBulkAction,
  type TaskBulkResult,
} from "../../../../../src/features/tasks/model/taskBulkActions";

/** Row-level selection state a task list passes to its cards while selection mode is on. */
export type TaskBulkSelection = {
  active: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
};

/**
 * Bulk task actions as an in-list selection mode: "Select" in the list header turns rows into
 * checkable rows, and a bottom action bar offers Start, Retry, Stop and Delete for the selected
 * count. Run, retry and result reporting are unchanged; destructive actions are confirmed.
 *
 * Returns the header entry (the "Select" command for the page heading's actions, beside search,
 * filter and create), the run feedback, the row selection and the bar; the list owns where each
 * is placed. A single command never gets a row of its own.
 */
export function useTaskBulkActions({
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
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const [selecting, setSelecting] = useState(false);
  // A selection session: approvals requested in one session never run in a later one.
  const opening = useRef<object | null>(null);
  const port = opening.current;
  useEffect(
    () => () => {
      opening.current = null;
    },
    [],
  );
  const enter = () => {
    opening.current = {};
    setSelecting(true);
  };
  const exit = () => {
    opening.current = null;
    setSelecting(false);
  };
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>();
  const [actionError, setActionError] = useState<unknown>();
  const [refreshing, setRefreshing] = useState(false);
  const lock = useRef(false);
  const [results, setResults] = useState<TaskBulkResult[]>([]);
  const currentScope = useRef({ tasks, disabled });
  currentScope.current = { tasks, disabled };
  const [action, setAction] = useState<TaskBulkAction>("delete");
  const remove = useHostMutation("tasks.delete");
  const start = useHostMutation("tasks.start");
  const move = useHostMutation("tasks.move");
  // The list recomputes its visible tasks every render; compare the visible ids instead.
  const visibleKey = tasks.map((task) => task.id).join("\u0000");
  const [seenTasks, setSeenTasks] = useState(visibleKey);
  if (seenTasks !== visibleKey) {
    // Prune during render (not derived each time) so a task that leaves and
    // later returns is not silently re-selected for a destructive bulk action.
    setSeenTasks(visibleKey);
    const ids = new Set(tasks.map((task) => task.id));
    if (!selected.every((id) => ids.has(id))) setSelected(selected.filter((id) => ids.has(id)));
    if (!tasks.length && selecting) exit();
  }
  const retryIds = new Set(results.filter((row) => row.status === "failed").map((row) => row.task.id));
  const labels = {
    delete: copy("Sil", "Delete"),
    start: copy("Başlat", "Start"),
    stop: copy("Durdur", "Stop"),
    retry: copy("Yeniden dene", "Retry"),
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
    const ids = retry ? retryIds : new Set(selected);
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
      const current = currentScope.current;
      if (current.disabled) return;
      const visibleIds = new Set(current.tasks.map((task) => task.id));
      const requested = retry ? tasks.filter((task) => retryIds.has(task.id)).map((task) => task.id) : selected;
      if (!requested.length || !requested.every((id) => visibleIds.has(id))) return;
      void run(operation, retry).catch(setActionError);
    };
    const count = retry ? retryIds.size : selected.length;
    if (operation === "delete")
      confirmAction(
        copy("{p0} görevi sil", "Delete {p0} tasks", { p0: count }),
        copy(
          "Yalnız seçilen görevler silinir. Aktif görevler ve birleştirilmemiş kod korunur.",
          "Only the selected tasks are deleted. Active tasks and unmerged code are kept.",
        ),
        labels.delete,
        approve,
        copy("Vazgeç", "Cancel"),
        "destructive",
      );
    else if (operation === "stop")
      confirmAction(
        copy("{p0} görevi durdur", "Stop {p0} tasks", { p0: count }),
        copy(
          "Seçilen görevlerin çalışması durur, çalışma dosyaları korunur.",
          "Work on the selected tasks stops; their work files are kept.",
        ),
        labels.stop,
        approve,
        copy("Vazgeç", "Cancel"),
        "default",
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
      {retryIds.size ? (
        <Button
          label={copy("Başarısızları yeniden dene", "Retry failed tasks")}
          disabled={busy || refreshing || disabled || !tasks.some((task) => retryIds.has(task.id))}
          onPress={() => request(action, true)}
        />
      ) : null}
    </>
  );
  const locked = busy || refreshing || disabled;
  const entry = (
    <>
      {context}
      {tasks.length && !selecting ? (
        <Button
          label={copy("Seç", "Select")}
          accessibilityLabel={copy("Görevleri seç", "Select tasks")}
          tone="quiet"
          reserveTouchTarget
          disabled={locked}
          onPress={enter}
        />
      ) : null}
    </>
  );
  const count = selected.length;
  const bar = selecting ? (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={copy("Toplu işlemler", "Bulk actions")}
      style={{
        gap: space.sm,
        paddingHorizontal: space.screen,
        paddingTop: space.sm,
        paddingBottom: space.sm + insets.bottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
        <Body accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>
          {count ? copy("{p0} görev seçili", "{p0} selected", { p0: count }) : copy("Görev seç", "Select tasks")}
        </Body>
        <Row style={{ gap: 0 }}>
          <Button
            label={count === tasks.length ? copy("Seçimi temizle", "Clear selection") : copy("Tümünü seç", "Select all")}
            tone="quiet"
            flush
            disabled={locked}
            onPress={() => setSelected(count === tasks.length ? [] : tasks.map((task) => task.id))}
          />
          <Button label={copy("Bitti", "Done")} tone="quiet" flush disabled={busy} onPress={exit} />
        </Row>
      </Row>
      <Row style={{ flexWrap: "wrap" }}>
        <Button label={labels.start} tone="primary" style={{ flexGrow: 1 }} disabled={locked || !count} onPress={() => request("start")} />
        <Button label={labels.retry} tone="secondary" style={{ flexGrow: 1 }} disabled={locked || !count} onPress={() => request("retry")} />
        <Button label={labels.stop} tone="secondary" style={{ flexGrow: 1 }} disabled={locked || !count} onPress={() => request("stop")} />
        <Button label={labels.delete} tone="danger" style={{ flexGrow: 1 }} disabled={locked || !count} onPress={() => request("delete")} />
      </Row>
    </View>
  ) : null;
  const selection: TaskBulkSelection = {
    active: selecting,
    isSelected: (id) => selected.includes(id),
    toggle: (id) => {
      if (locked) return;
      setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    },
  };
  return { entry, feedback, selection, bar };
}
