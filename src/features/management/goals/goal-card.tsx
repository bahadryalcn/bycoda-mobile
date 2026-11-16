import { RecordCard } from "@/ui/record-card";
import { PlanSteps } from "@/ui/plan-steps";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import MessageSquare from "lucide-react-native/icons/message-square";
import Settings2 from "lucide-react-native/icons/settings-2";
import Pencil from "lucide-react-native/icons/pencil";
import Square from "lucide-react-native/icons/square";
import Trash2 from "lucide-react-native/icons/trash-2";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { ActionMenu, Body, Button, ErrorNotice, IconButton, MutationState, Row } from "@/ui/primitives";
import { joinMeta, RecordTrailing, useMenuGlyph, useRelativeTime } from "../shared/record-bits";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import type { GoalCardProps } from "./types";

export function GoalCard({
  goal,
  projects,
  progress,
  tasks,
  busy,
  editorOpen,
  onReplan,
  onSettings,
  approve,
  cancel,
  remove,
}: GoalCardProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const glyph = useMenuGlyph();
  const relative = useRelativeTime();
  const canCancel = !["done", "cancelled"].includes(goal.status);
  const canDelete = ["done", "cancelled"].includes(goal.status);
  const active = goal.status === "planning" || goal.status === "running";
  const cancelling = cancel.isPending && cancel.variables?.goalId === goal.id;
  const stop = () => confirmAction(
    copy("Epici durdur", "Cancel epic"),
    copy(
      "Hedef ve devam eden görevleri durdurulacak; çalışma dosyaları korunacak.",
      "The goal and its active tasks will stop; work files will be retained.",
    ),
    copy("Durdur", "Stop"),
    () => cancel.mutate({ goalId: goal.id }),
  );
  const openPlanner = () => {
    if (machine && goal.plannerSessionId)
      router.navigate({ pathname: "/session/[id]", params: {
        id: goal.plannerSessionId, machineId: machine.id, projectId: goal.leadProjectId,
      } });
  };
  // Active work keeps Stop direct; inactive cancellation remains secondary.
  const menu = [
    canCancel && {
      key: "settings", icon: glyph(Settings2),
      label: copy("Epic ayarları", "Epic settings"),
      disabled: busy || editorOpen,
      onPress: () => onSettings(goal),
    },
    ["awaiting-approval", "blocked"].includes(goal.status) && {
      key: "revise", icon: glyph(Pencil),
      label: copy("Planı değiştir", "Revise plan"),
      disabled: busy || editorOpen,
      onPress: () => onReplan(goal.id),
    },
    canCancel && !active && {
      key: "cancel", icon: glyph(Square, true),
      label: copy("Epici durdur", "Cancel epic"),
      destructive: true,
      disabled: busy,
      onPress: stop,
    },
    canDelete && {
      key: "delete", icon: glyph(Trash2, true),
      label: copy("Kaydı sil", "Delete record"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Epici sil", "Delete epic"),
          copy(
            "Hedef kaydı silinecek; görevler korunacak.",
            "The goal record will be deleted; tasks will be retained.",
          ),
          copy("Sil", "Delete"),
          () => remove.mutate({ goalId: goal.id, withTasks: false }),
        ),
    },
  ];
  return (
    <RecordCard
      title={goal.title}
      status={<Status value={goal.status} />}
      metadata={joinMeta([
        progress && progress.total > 0
          ? copy("{p0}/{p1} görev bitti", "{p0}/{p1} tasks done", { p0: progress.done, p1: progress.total })
          : copy("{p0} görev", "{p0} tasks", { p0: goal.plan?.tasks.length ?? goal.taskIds.length }),
        goal.projectIds.length === 1 && projects.find((project) => project.id === goal.projectIds[0])?.name,
        goal.projectIds.length > 1 && copy("{p0} proje", "{p0} projects", { p0: goal.projectIds.length }),
        relative(goal.updatedAt) && copy("Güncellendi {p0}", "Updated {p0}", { p0: relative(goal.updatedAt) }),
      ])}
      preview={goal.prompt ? <Body muted numberOfLines={2}>{goal.prompt}</Body> : null}
      defaultExpanded={goal.status === "awaiting-approval"}
      menu={<RecordTrailing>
        {goal.plannerSessionId ? <IconButton label={copy("Planlayıcı oturumu", "Planner session")} onPress={openPlanner}>
          <MessageSquare size={18} color={colors.accent} />
        </IconButton> : null}
        <ActionMenu label={copy("Epic işlemleri", "Epic actions")}
          busy={(!active && cancelling) || (remove.isPending && remove.variables?.goalId === goal.id)} actions={menu} />
      </RecordTrailing>}
      footer={active || goal.status === "awaiting-approval" ? (
        <Row>
          {active && (
            <Button
              label={copy("Epici durdur", "Cancel epic")}
              tone="danger"
              busy={cancelling}
              disabled={busy}
              onPress={stop}
            />
          )}
          {goal.status === "awaiting-approval" && (
            <Button
              label={copy("Planı onayla", "Approve plan")}
              tone="success"
              busy={approve.isPending && approve.variables?.goalId === goal.id}
              disabled={busy}
              onPress={() =>
                confirmAction(
                  copy("Planı onayla", "Approve plan"),
                  copy(
                    "Plandaki görevler bilgisayarda çalıştırılmaya başlanacak.",
                    "The planned tasks will start running on the computer.",
                  ),
                  copy("Onayla", "Approve"),
                  () => approve.mutate({ goalId: goal.id }), undefined, "default",
                )
              }
            />
          )}
        </Row>
      ) : null}
      details={<>
        <Body>{goal.prompt}</Body>
        <Body muted style={uiStyles.caption}>
          {goal.projectIds
            .map((id) => projects.find((project) => project.id === id)?.name ?? id)
            .join(" · ")}
        </Body>
        {tasks?.length ? <View style={{ gap: space.xs }}>
          <Body muted style={uiStyles.caption}>{copy("Görevler", "Tasks")}</Body>
          {tasks.map((task) => <Row key={task.id} style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <Status value={task.status} />
            <Body style={uiStyles.grow}>{task.title}</Body>
          </Row>)}
        </View> : goal.plan?.tasks.length ? <View style={{ gap: space.xs }}>
          <Body muted style={uiStyles.caption}>{copy("Plan", "Plan")}</Body>
          <PlanSteps steps={goal.plan.tasks.map((task) => ({
            id: task.key,
            title: task.title,
            description: task.prompt,
            metadata: [task.project, task.dependsOn.length
              ? `${copy("Bağımlılıklar", "Depends on")}: ${task.dependsOn.join(", ")}` : ""].filter(Boolean).join(" · "),
          }))} />
        </View> : null}
      </>}
    >
      <ErrorNotice error={goal.error} />
      <ErrorNotice error={goal.planError} />
      {approve.variables?.goalId === goal.id ? <MutationState mutation={approve} /> : null}
      {cancel.variables?.goalId === goal.id ? <MutationState mutation={cancel} /> : null}
      {remove.variables?.goalId === goal.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
  );
}
