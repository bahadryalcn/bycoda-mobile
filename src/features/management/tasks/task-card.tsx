import { agentPresentation } from "../shared/agent-presentation";
import type { LucideIcon } from "lucide-react-native";
import { RecordCard } from "@/ui/record-card";
import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef } from "react";
import { router } from "expo-router";
import MessageSquare from "lucide-react-native/icons/message-square";
import Play from "lucide-react-native/icons/play";
import Check from "lucide-react-native/icons/check";
import Ban from "lucide-react-native/icons/ban";
import ListPlus from "lucide-react-native/icons/list-plus";
import Pencil from "lucide-react-native/icons/pencil";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import GitMerge from "lucide-react-native/icons/git-merge";
import Undo2 from "lucide-react-native/icons/undo-2";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Trash2 from "lucide-react-native/icons/trash-2";
import Square from "lucide-react-native/icons/square";
import {
  ActionMenu,
  Body,
  Button,
  ErrorNotice,
  IconButton,
  MutationState,
  Row,
  Stack,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import { joinMeta, useRelativeTime } from "../shared/record-bits";
import { Hint } from "@/ui/hint";
import { taskActions } from "../task-actions";
import { ReviewNotes } from "./review-notes";
import type { TaskCardProps } from "./types";
import { TaskDeclineFeedback } from "./task-feedback";
import { stamp } from "../shared/format";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";
import { hasUnmergedBranch } from "../../../../../src/features/tasks/model/taskRules";

export function TaskCard({
  task,
  projectName,
  busy,
  editorOpen,
  onEdit,
  onDelivery,
  onReviewDelivery,
  move,
  remove,
  decline,
  recheck,
  finish,
  start,
  reorder,
  tasks,
  lifecycleReady,
}: TaskCardProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const { confirm, review } = useRecordConfirmation(task, machine?.name || machine?.id, busy);
  const relative = useRelativeTime();
  const moves = taskActions(task, machine?.capabilities);
  const supported = !!machine?.capabilities?.includes("tasks.workspaces");
  const moving = move.isPending && move.variables?.taskId === task.id;
  const admissionWait =
    task.status === "queued" && !task.needsInput ? task.modelRoutingWait : undefined;
  const presentedStatus = admissionWait?.reason ? "waiting" : task.status;
  const starting = start.isPending && start.variables?.taskId === task.id;
  const orderedHere = useRef(false);
  useEffect(() => {
    if (!reorder.isPending) orderedHere.current = false;
  }, [reorder.isPending]);
  const menuBusy =
    (remove.isPending && remove.variables?.taskId === task.id) ||
    (decline.isPending && decline.variables?.taskId === task.id) ||
    (recheck.isPending && recheck.variables?.taskId === task.id) ||
    (finish.isPending && finish.variables?.taskId === task.id) ||
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
  const isBlocked = task.status === "blocked";
  const startUnavailable = !lifecycleReady || moves.queueBlocked || waiting.length > 0;
  const showStart = starting || (canStart && (isBlocked ? !startUnavailable : !task.sessionId));
  const openSession = () => {
    if (machine && task.sessionId)
      router.navigate({
        pathname: "/session/[id]",
        params: {
          id: task.sessionId,
          machineId: machine.id,
          projectId: task.projectId,
        },
      });
  };
  const reviewingDelivery = task.status === "review" && hasUnmergedBranch(task);
  const deliverySupported = machine?.capabilities?.includes("workspaces.delivery.v1");
  const complete = () =>
    confirm(
      copy("Görevi tamamla", "Complete task"),
      copy("Görev tamamlandı olarak işaretlenecek.", "The task will be marked complete."),
      copy("Tamamla", "Complete"),
      () => move.mutate({ taskId: task.id, to: "done" }),
      "default",
    );
  // Rare or secondary actions live in the overflow menu; the card keeps only the next step.
  const queueLabel =
    task.status === "done"
      ? copy("Yeniden çalıştır", "Run again")
      : task.status === "review"
        ? copy("Tekrar çalıştır", "Retry")
        : copy("Sıraya al", "Queue");
  const glyph = (Icon: LucideIcon, color = colors.muted) => <Icon size={18} color={color} />;
  const menu = [
    canStart &&
      !isBlocked &&
      !!task.sessionId &&
      !starting && {
        key: "start",
        icon: glyph(Play),
        label: copy("Şimdi başlat", "Start now"),
        disabled: busy || startUnavailable,
        onPress: () => start.mutate({ taskId: task.id }),
      },
    moves.finishWithFindings && {
      key: "finish-findings",
      icon: glyph(Check),
      label: copy("Bulgularla tamamla", "Finish with findings"),
      disabled: busy,
      onPress: () =>
        confirm(
          copy("Bulgularla tamamla", "Finish with findings"),
          copy(
            "Başarısız inceleme korunur; teslim için onayınız gerekir.",
            "The failed review remains; delivery requires your approval.",
          ),
          copy("Bulgularla tamamla", "Finish with findings"),
          () => finish.mutate({ taskId: task.id, expectedUpdatedAt: task.updatedAt }),
        ),
    },
    moves.complete && !reviewingDelivery && {
      key: "complete",
      icon: glyph(Check),
      label: copy("Tamamla", "Complete"),
      disabled: busy,
      onPress: complete,
    },
    task.source === "steward" &&
      task.status === "todo" && {
        key: "decline",
        icon: glyph(Ban, colors.danger),
        label: copy("Öneriyi reddet", "Decline suggestion"),
        destructive: true,
        disabled:
          busy ||
          editorOpen ||
          !machine?.capabilities?.includes("stewards") ||
          decline.error?.message.includes("Unsupported host method"),
        onPress: () =>
          confirm(
            copy("Öneriyi reddet", "Decline suggestion"),
            copy(
              "Bu görev önerisi kaldırılacak ve proje sorumlusu aynı başlığı tekrar önermeyecek. Diğer görevler korunur.",
              "This task suggestion will be removed and the steward will remember its title. Other tasks are kept.",
            ),
            copy("Reddet", "Decline"),
            () => decline.mutate({ taskId: task.id }),
          ),
      },
    moves.queue && {
      key: "queue",
      icon: glyph(ListPlus),
      label: queueLabel,
      disabled: busy || moves.queueBlocked,
      onPress: () => move.mutate({ taskId: task.id, to: "queued" }),
    },
    moves.edit && {
      key: "edit",
      icon: glyph(Pencil),
      label: copy("Düzenle", "Edit"),
      disabled: busy || editorOpen,
      onPress: () => onEdit(task),
    },
    queued && {
      key: "up",
      icon: glyph(ArrowUp),
      label: copy("Sırada yukarı taşı", "Move up in queue"),
      disabled: busy || !lifecycleReady || position <= 0,
      onPress: () => changeOrder(-1),
    },
    queued && {
      key: "down",
      icon: glyph(ArrowDown),
      label: copy("Sırada aşağı taşı", "Move down in queue"),
      disabled: busy || !lifecycleReady || position < 0 || position >= ordered.length - 1,
      onPress: () => changeOrder(1),
    },
    supported &&
      task.status === "review" &&
      !!task.branch &&
      !task.merged && {
        key: "delivery",
        icon: glyph(GitMerge),
        label: copy("Teslim hedefini değiştir", "Change delivery target"),
        disabled: busy || editorOpen,
        onPress: () => onDelivery(task),
      },
    moves.toDo && {
      key: "todo",
      icon: glyph(Undo2),
      label: copy("Yapılacaklara geri al", "Return to to-do"),
      disabled: busy,
      onPress: () => move.mutate({ taskId: task.id, to: "todo" }),
    },
    supported &&
      moves.recheck && {
        key: "recheck",
        icon: glyph(RefreshCw),
        label: copy("İncelemeyi yenile", "Recheck review"),
        disabled: busy,
        onPress: () => recheck.mutate({ taskId: task.id }),
      },
    !["running", "verifying"].includes(task.status) && {
      key: "delete",
      icon: glyph(Trash2, colors.danger),
      label: copy("Sil", "Delete"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirm(
          copy("Görevi sil", "Delete task"),
          copy(
            "Görev kaydı silinecek. Birleştirilmemiş çalışma varsa host işlemi engeller.",
            "The task record will be deleted. The host prevents deletion if unmerged work remains.",
          ),
          copy("Sil", "Delete"),
          () =>
            remove.mutate({
              taskId: task.id,
              discard: false,
              expectedUpdatedAt: task.updatedAt,
            }),
        ),
    },
  ];
  const stopAction = moves.stop ? (
    <Hint label={copy("Durdur", "Stop")}>
      <IconButton
        label={copy("Durdur", "Stop")}
        busy={moving && move.variables?.to === "blocked"}
        tone="danger"
        disabled={busy}
        onPress={() =>
          confirm(
            copy("Görevi durdur", "Stop task"),
            copy(
              "Aktif çalışma durdurulacak, çalışma dosyaları korunacak.",
              "Active work will stop and work files will be retained.",
            ),
            copy("Durdur", "Stop"),
            () => move.mutate({ taskId: task.id, to: "blocked" }),
          )
        }
      >
        <Square size={18} color={colors.danger} />
      </IconButton>
    </Hint>
  ) : null;
  const card = (
    <RecordCard
      title={task.title}
      status={<Status value={presentedStatus} />}
      metadata={
        joinMeta([admissionWait?.reason, agentPresentation(task.harness, task.model), projectName, relative(task.updatedAt)]) || undefined
      }
      menu={
        <Row style={{ gap: 0, flexWrap: "nowrap", alignItems: "flex-start" }}>
          {task.sessionId ? (
            <IconButton label={copy("Oturumu aç", "Open session")} onPress={openSession}>
              <MessageSquare size={18} color={colors.accent} />
            </IconButton>
          ) : null}
          {stopAction}
          <ActionMenu
            label={copy("Görev işlemleri", "Task actions")}
            busy={menuBusy}
            actions={menu}
          />
        </Row>
      }
      footer={
        showStart || reviewingDelivery && moves.complete && deliverySupported ||
        (moving && ["done", "queued"].includes(String(move.variables?.to))) ? (
          <Row>
            {showStart && (
              <Button
                label={isBlocked ? copy("Yeniden dene", "Retry") : copy("Şimdi başlat", "Start now")}
                busy={starting}
                tone={isBlocked ? "primary" : "quiet"}
                disabled={busy || startUnavailable}
                onPress={() => start.mutate({ taskId: task.id })}
              />
            )}
            {reviewingDelivery && moves.complete && deliverySupported && (
              <Button label={copy("Teslimi incele", "Review delivery")} tone="primary"
                disabled={busy || editorOpen} onPress={() => onReviewDelivery(task)} />
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
          </Row>
        ) : null
      }
      details={
        <>
          <Body>{task.prompt}</Body>
          {admissionWait?.reason ? (
            <Body muted>
              {copy("Bekliyor", "Waiting")}: {admissionWait.reason}
              {admissionWait.retryAt
                ? ` · ${copy("Sonraki deneme", "Next attempt")}: ${stamp(admissionWait.retryAt)}`
                : ""}
            </Body>
          ) : null}
          {supported &&
            lifecycleReady &&
            position >= 0 &&
            (task.status === "todo" || task.status === "queued") && (
              <Body muted style={uiStyles.caption}>
                {copy("Bilgisayardaki sıra", "Queue position on computer")}: {position + 1}
              </Body>
            )}
          {task.worktreeCwd ||
          task.workspace?.checkoutCwd ||
          task.deliveryCwd ||
          task.baseBranch ||
          task.branch ||
          task.diffStat ? (
            <Stack>
              <Body muted style={uiStyles.caption}>{copy("Çalışma", "Execution")}</Body>
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
            </Stack>
          ) : null}
          <ReviewNotes task={task} />
        </>
      }
    >
      {reviewingDelivery && moves.complete && !deliverySupported ? (
        <Body muted>{copy("Bu özellik için bilgisayarındaki Bycoda’yı güncelle.", "Update Bycoda on your computer to use this feature.")}</Body>
      ) : null}
      <ErrorNotice error={task.error} />
      <ErrorNotice error={task.mergeError} />
      {move.variables?.taskId === task.id ? <MutationState mutation={move} /> : null}
      {remove.variables?.taskId === task.id ? <MutationState mutation={remove} /> : null}
      {finish.variables?.taskId === task.id ? <MutationState mutation={finish} /> : null}
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
  return (
    <>
      {card}
      <RecordConfirmationSheet review={review} />
    </>
  );
}
