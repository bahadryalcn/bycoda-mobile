import { router } from "expo-router";
import { uiStyles } from "@/ui/styles";
import { Body, Button, Card, Disclosure, ErrorText, Heading, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import { taskActions } from "../task-actions";
import { ReviewNotes } from "./review-notes";
import type { TaskCardProps } from "./types";

export function TaskCard({ task, busy, editorOpen, onEdit, onDelivery, move, remove, recheck, start, reorder, tasks, lifecycleReady }: TaskCardProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const moves = taskActions(task);
  const supported = !!machine?.capabilities?.includes("tasks.workspaces");
  const waiting = tasks.filter((entry) => task.dependsOn?.includes(entry.id) && entry.status !== "done");
  const ordered = tasks.filter((item) => item.status === task.status).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const position = ordered.findIndex((item) => item.id === task.id);
  const changeOrder = (delta: number) => {
    const ids = ordered.map((item) => item.id);
    [ids[position], ids[position + delta]] = [ids[position + delta], ids[position]];
    reorder.mutate({ taskIds: ids });
  };
  return (
    <Card key={task.id}>
      <Row>
        <Status value={task.status} />
        <Body muted numberOfLines={1} style={[uiStyles.caption, uiStyles.grow]}>
          {task.harness} · {task.model}
        </Body>
      </Row>
      <Heading numberOfLines={2} style={uiStyles.title}>
        {task.title}
      </Heading>
      <ErrorText error={task.error} />
      <ErrorText error={task.mergeError} />
      {!!waiting.length && <Body muted>{copy("Beklenen görevler", "Waiting for tasks")}: {waiting.map((item) => item.title).join(", ")}</Body>}
      {task.merged && <Body>{copy("Hedef dala teslim edildi", "Delivered to target branch")}: {task.baseBranch}</Body>}
      {moves.queue && moves.queueBlocked && (
        <Body muted>
          {!task.prompt.trim()
            ? copy("Çalıştırmadan önce bir açıklama ekleyin.", "Add a description before running.")
            : copy(
                "Yeniden çalıştırmadan önce görev açıklamasını güncelleyin.",
                "Update the task instructions before retrying.",
              )}
        </Body>
      )}
      <Row>
        {supported && (task.status === "todo" || task.status === "queued" || task.status === "blocked") && <Button label={copy("Şimdi başlat", "Start now")} tone="primary" disabled={busy || !lifecycleReady || moves.queueBlocked || waiting.length > 0} onPress={() => start.mutate({ taskId: task.id })} />}
        {task.sessionId && (
          <Button
            label={copy("Oturumu aç", "Open session")}
            onPress={() => {
              if (machine && task.sessionId)
                router.push({
                  pathname: "/session/[id]",
                  params: { id: task.sessionId, machineId: machine.id, projectId: task.projectId },
                });
            }}
          />
        )}
        {moves.queue && (
          <Button
            label={
              task.status === "done"
                ? copy("Yeniden çalıştır", "Run again")
                : task.status === "review"
                  ? copy("Tekrar çalıştır", "Retry")
                  : copy("Sıraya al", "Queue")
            }
            tone={supported ? "quiet" : "primary"}
            disabled={busy || moves.queueBlocked}
            onPress={() => move.mutate({ taskId: task.id, to: "queued" })}
          />
        )}
        {moves.stop && (
          <Button
            label={copy("Durdur", "Stop")}
            tone="danger"
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Görevi durdur", "Stop task"),
                copy(
                  "Aktif çalışma durdurulacak, çalışma dosyaları korunacak.",
                  "Active work will stop and work files will be retained.",
                ),
                copy("Durdur", "Stop"),
                () => move.mutate({ taskId: task.id, to: "blocked" }),
              )
            }
          />
        )}
        {moves.complete && (
          <Button
            label={copy("Tamamla", "Complete")}
            tone="success"
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Görevi tamamla", "Complete task"),
                task.status === "review" && task.branch
                  ? copy(
                      "Bu işlem görev dalını bilgisayardaki hedef dala birleştirebilir.",
                      "This can merge the task branch into the target branch on the computer.",
                    )
                  : copy(
                      "Görev tamamlandı olarak işaretlenecek.",
                      "The task will be marked complete.",
                    ),
                copy("Tamamla", "Complete"),
                () => move.mutate({ taskId: task.id, to: "done" }),
              )
            }
          />
        )}
      </Row>
      <Disclosure label={copy("Görev ayrıntıları", "Task details")}>
        {supported && lifecycleReady && (task.status === "todo" || task.status === "queued") && <Body muted>{copy("Bilgisayardaki sıra", "Queue position on computer")}: {position + 1}</Body>}
        {(task.worktreeCwd || task.workspace?.checkoutCwd) && <Body mono>{copy("Çalışma", "Execution")}: {task.worktreeCwd || task.workspace?.checkoutCwd}</Body>}
        {(task.deliveryCwd || task.baseBranch) && <Body mono>{copy("Teslim", "Delivery")}: {[task.deliveryCwd, task.baseBranch].filter(Boolean).join(" · ")}</Body>}
        {task.branch && <Body mono>{task.branch}</Body>}
        <Body>{task.prompt}</Body>
        {task.diffStat && <Body mono>{task.diffStat}</Body>}
        <ReviewNotes task={task} />
        <Row>
          {supported && (task.status === "todo" || task.status === "queued") && <>
            <Button label={copy("Sırada yukarı taşı", "Move up in queue")} tone="quiet" disabled={busy || !lifecycleReady || position <= 0} onPress={() => changeOrder(-1)} />
            <Button label={copy("Sırada aşağı taşı", "Move down in queue")} tone="quiet" disabled={busy || !lifecycleReady || position < 0 || position >= ordered.length - 1} onPress={() => changeOrder(1)} />
          </>}
          {supported && task.status === "review" && task.branch && !task.merged && <Button label={copy("Teslim hedefini değiştir", "Change delivery target")} disabled={busy || editorOpen} onPress={() => onDelivery(task)} />}
          {moves.edit && (
            <Button
              label={copy("Düzenle", "Edit")}
              disabled={busy || editorOpen}
              onPress={() => onEdit(task)}
            />
          )}
          {moves.toDo && (
            <Button
              label={copy("Yapılacaklara geri al", "Return to to-do")}
              disabled={busy}
              onPress={() => move.mutate({ taskId: task.id, to: "todo" })}
            />
          )}
          {task.status === "review" && (
            <Button
              label={copy("İncelemeyi yenile", "Recheck review")}
              disabled={busy}
              onPress={() => recheck.mutate({ taskId: task.id })}
            />
          )}
          {!["running", "verifying"].includes(task.status) && (
            <Button
              label={copy("Sil", "Delete")}
              tone="danger"
              disabled={busy}
              onPress={() =>
                confirmAction(
                  copy("Görevi sil", "Delete task"),
                  copy(
                    "Görev kaydı silinecek. Birleştirilmemiş çalışma varsa host işlemi engeller.",
                    "The task record will be deleted. The host prevents deletion if unmerged work remains.",
                  ),
                  copy("Sil", "Delete"),
                  () => remove.mutate({ taskId: task.id, discard: false }),
                )
              }
            />
          )}
        </Row>
      </Disclosure>
    </Card>
  );
}
