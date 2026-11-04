import { RecordCard } from "@/ui/record-card";
import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef } from "react";
import { router } from "expo-router";
import MessageSquare from "lucide-react-native/icons/message-square";
import Square from "lucide-react-native/icons/square";
import Cpu from "lucide-react-native/icons/cpu";
import Bot from "lucide-react-native/icons/bot";
import { uiStyles } from "@/ui/styles";
import { ActionMenu, Body, Button, Disclosure, ErrorText, IconButton, MutationState, Row } from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { statusLabel } from "../shared/status";
import { ProviderIcon } from "@/ui/provider-identity";
import { REMOTE_PROVIDERS } from "@/domain/providers";
import type { RemoteProvider } from "@/domain/types";
import { Hint } from "@/ui/hint";
import { decorativeSvgProps } from "@/ui/accessibility";
import { taskActions } from "../task-actions";
import { ReviewNotes } from "./review-notes";
import type { TaskCardProps } from "./types";
import { TaskStatusIcon } from "./task-status-icon";
import { TaskDeclineFeedback } from "./task-feedback";

export function TaskCard({
  task,
  busy,
  editorOpen,
  onEdit,
  onDelivery,
  move,
  remove,
  decline,
  recheck,
  start,
  reorder,
  tasks,
  lifecycleReady,
}: TaskCardProps) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const moves = taskActions(task);
  const supported = !!machine?.capabilities?.includes("tasks.workspaces");
  const moving = move.isPending && move.variables?.taskId === task.id;
  const starting = start.isPending && start.variables?.taskId === task.id;
  const orderedHere = useRef(false);
  useEffect(() => { if (!reorder.isPending) orderedHere.current = false; }, [reorder.isPending]);
  const menuBusy =
    (remove.isPending && remove.variables?.taskId === task.id) ||
    (decline.isPending && decline.variables?.taskId === task.id) ||
    (recheck.isPending && recheck.variables?.taskId === task.id) ||
    (reorder.isPending && orderedHere.current) ||
    (moving && move.variables?.to === "todo");
  const waiting = tasks.filter(
    (entry) => task.dependsOn?.includes(entry.id) && entry.status !== "done",
  );
  const ordered = tasks
    .filter((item) => item.status === task.status)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const position = ordered.findIndex((item) => item.id === task.id);
  const changeOrder = (delta: number) => {
    if (busy || orderedHere.current) return;
    orderedHere.current = true;
    const ids = ordered.map((item) => item.id);
    [ids[position], ids[position + delta]] = [ids[position + delta], ids[position]];
    reorder.mutate({ taskIds: ids });
  };
  const queued = supported && (task.status === "todo" || task.status === "queued");
  const canStart = supported && ["todo", "queued", "blocked"].includes(task.status);
  const openSession = () => {
    if (machine && task.sessionId)
      router.push({ pathname: "/session/[id]", params: {
        id: task.sessionId, machineId: machine.id, projectId: task.projectId,
      } });
  };
  const complete = () => confirmAction(
    copy("Görevi tamamla", "Complete task"),
    task.status === "review" && task.branch
      ? copy("Bu işlem görev dalını bilgisayardaki hedef dala birleştirebilir.", "This can merge the task branch into the target branch on the computer.")
      : copy("Görev tamamlandı olarak işaretlenecek.", "The task will be marked complete."),
    copy("Tamamla", "Complete"), () => move.mutate({ taskId: task.id, to: "done" }), undefined, "default",
  );
  // Rare or secondary actions live in the overflow menu; the card keeps only the next step.
  const queueLabel =
    task.status === "done"
      ? copy("Yeniden çalıştır", "Run again")
      : task.status === "review"
        ? copy("Tekrar çalıştır", "Retry")
        : copy("Sıraya al", "Queue");
  const menu = [
    canStart && !!task.sessionId && !starting && {
      key: "start", label: copy("Şimdi başlat", "Start now"),
      disabled: busy || !lifecycleReady || moves.queueBlocked || waiting.length > 0,
      onPress: () => start.mutate({ taskId: task.id }),
    },
    moves.complete && {
      key: "complete", label: copy("Tamamla", "Complete"), disabled: busy, onPress: complete,
    },
    task.source === "steward" && task.status === "todo" && {
      key: "decline",
      label: copy("Öneriyi reddet", "Decline suggestion"),
      destructive: true,
      disabled: busy || editorOpen || !machine?.capabilities?.includes("stewards") || decline.error?.message.includes("Unsupported host method"),
      onPress: () => confirmAction(copy("Öneriyi reddet", "Decline suggestion"),
        copy("Bu görev önerisi kaldırılacak ve proje sorumlusu aynı başlığı tekrar önermeyecek. Diğer görevler korunur.", "This task suggestion will be removed and the steward will remember its title. Other tasks are kept."),
        copy("Reddet", "Decline"), () => decline.mutate({ taskId: task.id })),
    },
    moves.queue && {
        key: "queue",
        label: queueLabel,
        disabled: busy || moves.queueBlocked,
        onPress: () => move.mutate({ taskId: task.id, to: "queued" }),
      },
    moves.edit && {
      key: "edit",
      label: copy("Düzenle", "Edit"),
      disabled: busy || editorOpen,
      onPress: () => onEdit(task),
    },
    queued && {
      key: "up",
      label: copy("Sırada yukarı taşı", "Move up in queue"),
      disabled: busy || !lifecycleReady || position <= 0,
      onPress: () => changeOrder(-1),
    },
    queued && {
      key: "down",
      label: copy("Sırada aşağı taşı", "Move down in queue"),
      disabled: busy || !lifecycleReady || position < 0 || position >= ordered.length - 1,
      onPress: () => changeOrder(1),
    },
    supported &&
      task.status === "review" &&
      !!task.branch &&
      !task.merged && {
        key: "delivery",
        label: copy("Teslim hedefini değiştir", "Change delivery target"),
        disabled: busy || editorOpen,
        onPress: () => onDelivery(task),
      },
    moves.toDo && {
      key: "todo",
      label: copy("Yapılacaklara geri al", "Return to to-do"),
      disabled: busy,
      onPress: () => move.mutate({ taskId: task.id, to: "todo" }),
    },
    supported &&
      moves.recheck && {
        key: "recheck",
        label: copy("İncelemeyi yenile", "Recheck review"),
        disabled: busy,
        onPress: () => recheck.mutate({ taskId: task.id }),
      },
    !["running", "verifying"].includes(task.status) && {
      key: "delete",
      label: copy("Sil", "Delete"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Görevi sil", "Delete task"),
          copy(
            "Görev kaydı silinecek. Birleştirilmemiş çalışma varsa host işlemi engeller.",
            "The task record will be deleted. The host prevents deletion if unmerged work remains.",
          ),
          copy("Sil", "Delete"),
          () => remove.mutate({ taskId: task.id, discard: false }),
        ),
    },
  ];
  const stopAction = moves.stop ? (
            <Hint label={copy("Durdur", "Stop")}><IconButton
              label={copy("Durdur", "Stop")}
              busy={moving && move.variables?.to === "blocked"}
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
            ><Square size={18} color={colors.danger} /></IconButton></Hint>
  ) : null;
  return (
    <RecordCard
      title={task.title}
      hint={[statusLabel(task.status, copy), task.harness, task.model].filter(Boolean).join(" · ")}
      status={<Row style={{ gap: space.sm }}>
        <TaskStatusIcon value={task.status} />
        {task.harness ? REMOTE_PROVIDERS.includes(task.harness as RemoteProvider)
          ? <ProviderIcon provider={task.harness as RemoteProvider} size={16} />
          : <Bot size={16} color={colors.muted} {...decorativeSvgProps} /> : null}
        {task.model ? <Cpu size={16} color={colors.muted} {...decorativeSvgProps} /> : null}
      </Row>}
      menu={<Row style={{ gap: 0, flexWrap: "nowrap" }}>
        {task.sessionId ? <IconButton label={copy("Oturumu aç", "Open session")} onPress={openSession}>
          <MessageSquare size={18} color={colors.accent} />
        </IconButton> : null}
        {stopAction}
        <ActionMenu label={copy("Görev işlemleri", "Task actions")} busy={menuBusy} actions={menu} />
      </Row>}
      footer={starting || (canStart && !task.sessionId) || (moving && ["done", "queued"].includes(String(move.variables?.to))) ?
        <Row>
          {(starting || (canStart && !task.sessionId)) && (
              <Button
                label={copy("Şimdi başlat", "Start now")}
                busy={starting}
                tone="quiet"
                disabled={busy || !lifecycleReady || moves.queueBlocked || waiting.length > 0}
                onPress={() => start.mutate({ taskId: task.id })}
              />
            )}
          {moving && move.variables?.to === "queued" && (
            <Button
              label={queueLabel}
              busy={moving && move.variables?.to === "queued"}
              tone="quiet"
              disabled={busy || moves.queueBlocked}
              onPress={() => move.mutate({ taskId: task.id, to: "queued" })}
            />
          )}
          {moving && move.variables?.to === "done" && (
            <Button
              label={copy("Tamamla", "Complete")}
              busy={moving && move.variables?.to === "done"}
              tone="success"
              disabled={busy}
              onPress={complete}
            />
          )}
        </Row> : null
      }
      details={
        <>
          <Body>{task.prompt}</Body>
          {task.harness || task.model ? <Body muted selectable style={uiStyles.caption}>{[task.harness, task.model].filter(Boolean).join(" · ")}</Body> : null}
          {supported && lifecycleReady && (task.status === "todo" || task.status === "queued") && (
            <Body muted style={uiStyles.caption}>
              {copy("Bilgisayardaki sıra", "Queue position on computer")}: {position + 1}
            </Body>
          )}
          {(task.worktreeCwd || task.workspace?.checkoutCwd || task.deliveryCwd || task.baseBranch || task.branch || task.diffStat) ? <Disclosure label={copy("Çalışma", "Execution")}>
          {(task.worktreeCwd || task.workspace?.checkoutCwd) && (
            <Body mono>
              {copy("Çalışma", "Execution")}: {task.worktreeCwd || task.workspace?.checkoutCwd}
            </Body>
          )}
          {(task.deliveryCwd || task.baseBranch) && (
            <Body mono>
              {copy("Teslim", "Delivery")}:{" "}
              {[task.deliveryCwd, task.baseBranch].filter(Boolean).join(" · ")}
            </Body>
          )}
          {task.branch && <Body mono>{task.branch}</Body>}
          {task.diffStat && <Body mono>{task.diffStat}</Body>}
          </Disclosure> : null}
          <ReviewNotes task={task} />
        </>
      }
    >
      <ErrorText error={task.error} />
      <ErrorText error={task.mergeError} />
      {move.variables?.taskId === task.id ? <MutationState mutation={move} /> : null}
      {remove.variables?.taskId === task.id ? <MutationState mutation={remove} /> : null}
      {recheck.variables?.taskId === task.id ? <MutationState mutation={recheck} /> : null}
      {decline.variables?.taskId === task.id ? <TaskDeclineFeedback mutation={decline} /> : null}
      {start.variables?.taskId === task.id ? <MutationState mutation={start} /> : null}
      {!!waiting.length && (
        <Body muted style={uiStyles.caption}>
          {copy("Beklenen görevler", "Waiting for tasks")}:{" "}
          {waiting.map((item) => item.title).join(", ")}
        </Body>
      )}
      {task.merged && (
        <Body style={uiStyles.caption}>
          {copy("Hedef dala teslim edildi", "Delivered to target branch")}: {task.baseBranch}
        </Body>
      )}
      {moves.queue && moves.queueBlocked && (
        <Body muted style={uiStyles.caption}>
          {!task.prompt.trim()
            ? copy("Çalıştırmadan önce bir açıklama ekleyin.", "Add a description before running.")
            : copy(
                "Yeniden çalıştırmadan önce görev açıklamasını güncelleyin.",
                "Update the task instructions before retrying.",
              )}
        </Body>
      )}
    </RecordCard>
  );
}
