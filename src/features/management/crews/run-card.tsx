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
import { Button, MutationState, NavigationGroup, NavigationRow, Row, Stack, Body } from "@/ui/primitives";
import { StatusLine } from "@/ui/feedback";
import { errorMessage } from "@/ui/error-message";
import { RecordCard } from "@/ui/record-card";
import { Status, statusLabel } from "../shared/status";
import { stamp } from "../shared/format";
import { joinMeta, useMenuGlyph, useRelativeTime } from "../shared/record-bits";
import { MemberLines } from "./member-lines";
import { agentPresentation } from "../shared/agent-presentation";
import { CrewRuntimePanel } from "./runtime-panel";
import { canDeleteCrewRun, canStopCrewRun, crewActivityKnown, crewHasRunningWork, crewTaskSessions } from "./runtime-model";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";

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
    {task.error ? <StatusLine tone="danger" label={errorMessage(task.error, copy)} /> : null}
    {sessions.review && <NavigationRow label={copy("İnceleyen", "Reviewer")} detail={task.title}
      disabled={!supported} onPress={() => onOpenSession(sessions.review!)} />}
  </Stack>;
}

export function CrewRunCard({ run }: { run: CrewRunView }) {
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
  const title = run.title || run.definition.name;
  const { confirm, review } = useRecordConfirmation({ id: run.id, title, status: run.status, updatedAt: run.updatedAt },
    machine?.name || machine?.id, busy || !supported);
  const openSession = (sessionId: string) => {
    if (supported && machineId && useMachines.getState().activeId === machineId)
      router.navigate({ pathname: "/session/[id]", params: { id: sessionId, machineId, projectId: run.projectId } });
  };
  const done = run.tasks.filter((task) => task.status === "done").length;
  const relative = useRelativeTime();
  // Lists use relative time like every other record card.
  const created = relative(run.createdAt) ? copy("Oluşturuldu {p0}", "Created {p0}", { p0: relative(run.createdAt) }) : "";
  const stopWork = () => confirm(copy("Çalışmayı durdur", "Stop work"), copy("Koordinatör ve çalışan ekip görevleri durdurulur. Dosyalar ve çalışma kaydı korunur.", "The coordinator and active crew tasks will stop. Files and the work record are kept."),
    copy("Durdur", "Stop"), () => { if (supported && useMachines.getState().activeId === machineId) stop.mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); });
  const runActions = canStopCrewRun(run) || run.status !== "finished" ? <Row>
      {canStopCrewRun(run) && <Button tone="danger" busy={stop.isPending}
        label={copy("Çalışmayı durdur", "Stop work")}
        disabled={busy || !supported} onPress={stopWork} />}
      {run.status !== "finished" && <Button tone="quiet" busy={pause.isPending || resume.isPending}
        label={run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Duraklat", "Pause")}
        disabled={busy || !supported} onPress={() => confirm(run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Duraklat", "Pause"),
          run.status === "paused" ? copy("Ekip görevleri bilgisayarda yeniden ilerleyebilir; gerekirse koordinatör yeniden başlatılır.", "Crew work may continue on the computer; the coordinator may restart if needed.")
            : copy("Yeni görevler duraklatılır. Çalışan görevleri de durdurmak için Çalışmayı durdur işlemini kullanın.", "New work is paused. Use Stop work to stop currently running tasks too."),
          run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Duraklat", "Pause"),
          () => { if (supported && useMachines.getState().activeId === machineId) (run.status === "paused" ? resume : pause).mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); }, "default")} />}
    </Row> : null;
  const card = <RecordCard title={title} status={<Status value={run.status} />}
    metadata={joinMeta([run.definition.name, run.tasks.length ? copy("{p0}/{p1} görev", "{p0}/{p1} tasks", { p0: done, p1: run.tasks.length }) : "", created])}
    preview={run.tasks.length ? <Progress value={done} maxValue={run.tasks.length} size="sm"
      color={run.status === "finished" ? "success" : "primary"}
      accessibilityLabel={copy("{p0}/{p1} görev tamamlandı", "{p0} of {p1} tasks done", { p0: done, p1: run.tasks.length })} /> : null}
    issues={[run.error]}
    actions={{ label: copy("Ekip çalışması işlemleri", "Crew work actions"), items: [
      !!run.coordinatorSessionId && { key: "coordinator", icon: glyph(MessageSquare), label: copy("Koordinatör oturumu", "Coordinator session"),
        disabled: !supported, onPress: () => openSession(run.coordinatorSessionId!) },
      machine?.capabilities?.includes("crews.run-delete.v1") && { key: "delete", icon: glyph(Trash2, true), label: copy("Çalışmayı sil", "Delete work"), destructive: true,
        disabled: busy || !supported || !canDeleteCrewRun(run),
        onPress: () => confirm(copy("Çalışmayı sil", "Delete work"), copy("Bu çalışma listeden kaldırılsın mı? Ekip, görevler ve oturumlar korunur.", "Remove this work from the list? The crew, tasks and sessions are kept."),
          copy("Sil", "Delete"), () => { if (supported && !busy && canDeleteCrewRun(run) && useMachines.getState().activeId === machineId) remove.mutate({ projectId: run.projectId, runId: run.id, expectedUpdatedAt: run.updatedAt }); }) },
      ] }}
    details={(expanded) => <CrewRuntimePanel run={run} active={expanded}>
      <NavigationGroup>{run.tasks.map((task) => <CrewTaskRow key={task.id} task={task}
        model={(() => {
          const candidate = run.assignments.find((assignment) => assignment.taskId === task.id)?.candidate;
          return candidate ? agentPresentation(candidate.harness, candidate.model) : undefined;
        })()}
        supported={supported} onOpenSession={openSession} />)}</NavigationGroup>
      {!run.tasks.length && <Body muted>{copy("Henüz ekip görevi oluşmadı.", "No crew tasks have been created yet.")}</Body>}
      <Stack>
        <Body muted>{copy("Ekip üyeleri", "Crew members")} · {run.definition.agents.length}</Body>
        <MemberLines agents={run.definition.agents} />
      </Stack>
    </CrewRuntimePanel>}>
    {run.status === "paused" && crewActivityKnown(run) && <Body muted>{crewHasRunningWork(run)
      ? copy("Yeni görev atamaları duraklatıldı. Devam eden işler tamamlanabilir.", "New assignments are paused. Running work can still finish.")
      : copy("İş duraklatıldı. Çalışan bir işlem yok.", "Work is paused. Nothing is running.")}</Body>}
    {runActions}
    <MutationState mutation={pause} /><MutationState mutation={resume} /><MutationState mutation={stop} /><MutationState mutation={remove} />
  </RecordCard>;
  return <>
    {card}
    <RecordConfirmationSheet review={review} />
  </>;
}
