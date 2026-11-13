import { router } from "expo-router";
import MessageSquare from "lucide-react-native/icons/message-square";
import Trash2 from "lucide-react-native/icons/trash-2";
import { Progress } from "panelui-native/components/progress";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey, useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Body, Button, ErrorNotice, IconButton, MutationState, NavigationGroup, NavigationRow, Row, Stack } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { RecordCard } from "@/ui/record-card";
import { Status, statusLabel } from "../shared/status";
import { stamp } from "../shared/format";
import { joinMeta, RecordTrailing, useMenuGlyph } from "../shared/record-bits";
import { MemberLines } from "./member-lines";
import { CrewRuntimePanel } from "./runtime-panel";
import { canDeleteCrewRun, canStopCrewRun, crewActivityKnown, crewHasRunningWork, crewTaskSessions } from "./runtime-model";

function CrewTaskRow({ task, model, supported, onOpenSession }: {
  task: CrewRunView["tasks"][number];
  model?: string;
  supported: boolean;
  onOpenSession: (sessionId: string) => void;
}) {
  const copy = useCopy();
  const sessions = crewTaskSessions(task);
  return <Stack>
    <NavigationRow
      label={task.title}
      detail={model}
      detailLines={2}
      supporting={<Row><Status value={task.status} /></Row>}
      accessibilityLabel={[task.title, statusLabel(task.status, copy), model].filter(Boolean).join(". ")}
      disabled={!sessions.worker || !supported}
      onPress={() => { if (sessions.worker) onOpenSession(sessions.worker); }}
    />
    <ErrorNotice error={task.error} />
    {sessions.review && <NavigationRow label={copy("İnceleyen", "Reviewer")} detail={task.title}
      disabled={!supported} onPress={() => onOpenSession(sessions.review!)} />}
  </Stack>;
}

export function CrewRunCard({ run }: { run: CrewRunView }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const glyph = useMenuGlyph();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const cache = useQueryClient();
  // Controls can change the crew before a provider cancellation/launch fails.
  // Refresh the original host's state without retrying the failed mutation.
  const refreshAfterFailure = () => { void cache.invalidateQueries({ queryKey: hostKey(machineId ?? null, ["crews", run.projectId]) }); };
  const pause = useHostMutation("crews.pause", ["crews", run.projectId]);
  const resume = useHostMutation("crews.resume", ["crews", run.projectId]);
  const stop = useHostMutation("crews.stop", ["crews", run.projectId]);
  const remove = useHostMutation("crews.deleteRun", ["crews", run.projectId]);
  const busy = pause.isPending || resume.isPending || stop.isPending || remove.isPending;
  const supported = machine?.id === machineId && machine?.capabilities?.includes("crews.v1") === true;
  const openSession = (sessionId: string) => {
    if (supported && machineId && useMachines.getState().activeId === machineId)
      router.push({ pathname: "/session/[id]", params: { id: sessionId, machineId, projectId: run.projectId } });
  };
  const done = run.tasks.filter((task) => task.status === "done").length;
  const created = `${copy("Oluşturulma", "Created")}: ${stamp(run.createdAt)}`;
  const stopWork = () => confirmAction(copy("Çalışmayı durdur", "Stop work"), copy("Koordinatör ve çalışan ekip görevleri durdurulur. Dosyalar ve çalışma kaydı korunur.", "The coordinator and active crew tasks will stop. Files and the work record are kept."),
    copy("Durdur", "Stop"), () => { if (supported && useMachines.getState().activeId === machineId) stop.mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); });
  return <RecordCard title={run.title || run.definition.name} status={<Status value={run.status} />}
    metadata={joinMeta([run.definition.name, run.tasks.length ? copy("{p0}/{p1} görev", "{p0}/{p1} tasks", { p0: done, p1: run.tasks.length }) : "", created])}
    preview={run.tasks.length ? <Progress value={done} maxValue={run.tasks.length} size="sm"
      color={run.status === "finished" ? "success" : "primary"}
      accessibilityLabel={copy("{p0}/{p1} görev tamamlandı", "{p0} of {p1} tasks done", { p0: done, p1: run.tasks.length })} /> : null}
    footer={canStopCrewRun(run) || run.status !== "finished" ? <Row>
      {canStopCrewRun(run) && <Button tone="danger" busy={stop.isPending}
        label={copy("Çalışmayı durdur", "Stop work")}
        disabled={busy || !supported} onPress={stopWork} />}
      {run.status !== "finished" && <Button tone="quiet" busy={pause.isPending || resume.isPending}
        label={run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause")}
        disabled={busy || !supported} onPress={() => confirmAction(run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause"),
          run.status === "paused" ? copy("Ekip görevleri bilgisayarda yeniden ilerleyebilir; gerekirse koordinatör yeniden başlatılır.", "Crew work may continue on the computer; the coordinator may restart if needed.")
            : copy("Yeni görevler bekletilir. Çalışan görevleri de durdurmak için Çalışmayı durdur işlemini kullanın.", "New work is paused. Use Stop work to stop currently running tasks too."),
          run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause"),
          () => { if (supported && useMachines.getState().activeId === machineId) (run.status === "paused" ? resume : pause).mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); }, undefined, "default")} />}
    </Row> : null}
    menu={<RecordTrailing>
      {run.coordinatorSessionId ? <IconButton disabled={!supported} label={copy("Koordinatör oturumu", "Coordinator session")} onPress={() => openSession(run.coordinatorSessionId!)}>
        <MessageSquare size={18} color={colors.accent} />
      </IconButton> : null}
      <ActionMenu label={copy("Ekip çalışması işlemleri", "Crew work actions")} actions={[
      machine?.capabilities?.includes("crews.run-delete.v1") && { key: "delete", icon: glyph(Trash2, true), label: copy("Çalışmayı sil", "Delete work"), destructive: true,
        disabled: busy || !supported || !canDeleteCrewRun(run),
        onPress: () => confirmAction(copy("Çalışmayı sil", "Delete work"), copy("Bu çalışma listeden kaldırılsın mı? Ekip, görevler ve oturumlar korunur.", "Remove this work from the list? The crew, tasks and conversations are kept."),
          copy("Sil", "Delete"), () => { if (supported && !busy && canDeleteCrewRun(run) && useMachines.getState().activeId === machineId) remove.mutate({ projectId: run.projectId, runId: run.id, expectedUpdatedAt: run.updatedAt }); }) },
      ]} />
    </RecordTrailing>}
    details={<CrewRuntimePanel run={run}>
      <Body muted>{copy("Ekip üyeleri", "Crew members")}</Body>
      <MemberLines agents={run.definition.agents} />
      <NavigationGroup>{run.tasks.map((task) => <CrewTaskRow key={task.id} task={task}
        model={run.assignments.find((assignment) => assignment.taskId === task.id)?.candidate.model}
        supported={supported} onOpenSession={openSession} />)}</NavigationGroup>
      {!run.tasks.length && <Body muted>{copy("Henüz ekip görevi oluşmadı.", "No crew tasks have been created yet.")}</Body>}
    </CrewRuntimePanel>}>
    {run.status === "paused" && crewActivityKnown(run) && <Body muted>{crewHasRunningWork(run)
      ? copy("Yeni görev atamaları duraklatıldı. Devam eden işler tamamlanabilir.", "New assignments are paused. Running work can still finish.")
      : copy("İş duraklatıldı. Çalışan bir işlem yok.", "Work is paused. Nothing is running.")}</Body>}
    <ErrorNotice error={run.error} />
    <MutationState mutation={pause} /><MutationState mutation={resume} /><MutationState mutation={stop} /><MutationState mutation={remove} />
  </RecordCard>;
}
