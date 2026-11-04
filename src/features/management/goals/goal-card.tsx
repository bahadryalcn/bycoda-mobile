import { RecordCard } from "@/ui/record-card";
import { PlanSteps } from "@/ui/plan-steps";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import MessageSquare from "lucide-react-native/icons/message-square";
import { uiStyles } from "@/ui/styles";
import { ActionMenu, Body, Button, Disclosure, ErrorText, IconButton, MutationState, Row } from "@/ui/primitives";
import { colors } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import type { GoalCardProps } from "./types";

export function GoalCard({
  goal,
  projects,
  busy,
  editorOpen,
  onReplan,
  onSettings,
  approve,
  cancel,
  remove,
}: GoalCardProps) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const canCancel = !["done", "cancelled"].includes(goal.status);
  const canDelete = ["done", "cancelled"].includes(goal.status);
  const active = goal.status === "planning" || goal.status === "running";
  const cancelling = cancel.isPending && cancel.variables?.goalId === goal.id;
  const stop = () => confirmAction(
    copy("Hedefi durdur", "Cancel goal"),
    copy(
      "Hedef ve devam eden görevleri durdurulacak; çalışma dosyaları korunacak.",
      "The goal and its active tasks will stop; work files will be retained.",
    ),
    copy("Durdur", "Stop"),
    () => cancel.mutate({ goalId: goal.id }),
  );
  const openPlanner = () => {
    if (machine && goal.plannerSessionId)
      router.push({ pathname: "/session/[id]", params: {
        id: goal.plannerSessionId, machineId: machine.id, projectId: goal.leadProjectId,
      } });
  };
  // Active work keeps Stop direct; inactive cancellation remains secondary.
  const menu = [
    canCancel && {
      key: "settings",
      label: copy("Hedef ayarları", "Goal settings"),
      disabled: busy || editorOpen,
      onPress: () => onSettings(goal),
    },
    ["awaiting-approval", "blocked"].includes(goal.status) && {
      key: "revise",
      label: copy("Planı değiştir", "Revise plan"),
      disabled: busy || editorOpen,
      onPress: () => onReplan(goal.id),
    },
    canCancel && !active && {
      key: "cancel",
      label: copy("Hedefi durdur", "Cancel goal"),
      destructive: true,
      disabled: busy,
      onPress: stop,
    },
    canDelete && {
      key: "delete",
      label: copy("Kaydı sil", "Delete record"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Hedefi sil", "Delete goal"),
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
      metadata={goal.taskIds.length + " " + copy("görev", "tasks")}
      defaultExpanded={goal.status === "awaiting-approval"}
      menu={<Row style={{ gap: 0, flexWrap: "nowrap" }}>
        {goal.plannerSessionId ? <IconButton label={copy("Planlayıcı oturumu", "Planner session")} onPress={openPlanner}>
          <MessageSquare size={18} color={colors.accent} />
        </IconButton> : null}
        <ActionMenu label={copy("Hedef işlemleri", "Goal actions")}
          busy={(!active && cancelling) || (remove.isPending && remove.variables?.goalId === goal.id)} actions={menu} />
      </Row>}
      footer={active || goal.status === "awaiting-approval" ? (
        <Row>
          {active && (
            <Button
              label={copy("Hedefi durdur", "Cancel goal")}
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
        {goal.plan?.tasks.length ? <Disclosure label={copy("Plan", "Plan")} detail={`${goal.plan.tasks.length} ${copy("görev", "tasks")}`}><PlanSteps steps={goal.plan.tasks.map((task) => ({
          id: task.key,
          title: task.title,
          description: task.prompt,
          metadata: [task.project, task.dependsOn.length
            ? `${copy("Bağımlılıklar", "Depends on")}: ${task.dependsOn.join(", ")}` : ""].filter(Boolean).join(" · "),
        }))} /></Disclosure> : null}
      </>}
    >
      <ErrorText error={goal.error} />
      <ErrorText error={goal.planError} />
      {approve.variables?.goalId === goal.id ? <MutationState mutation={approve} /> : null}
      {cancel.variables?.goalId === goal.id ? <MutationState mutation={cancel} /> : null}
      {remove.variables?.goalId === goal.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
  );
}
