import { router } from "expo-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey, useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Body, Button, ErrorText, MutationState, NavigationGroup, NavigationRow, Row, Stack } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { Status } from "../shared/status";
import { CrewRuntimePanel } from "./runtime-panel";
import { canDeleteCrewRun, canStopCrewRun, crewActivityKnown, crewHasRunningWork, crewTaskSessions } from "./runtime-model";

export function CrewRunCard({ run }: { run: CrewRunView }) {
  const copy = useCopy();
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
  return <RecordCard title={run.title || run.definition.name} status={<Status value={run.status} />}
    metadata={`${run.definition.name} · ${run.tasks.filter((task) => task.status === "done").length}/${run.tasks.length}`}
    footer={<Row>
      {run.status !== "finished" && <Button tone="quiet" busy={pause.isPending || resume.isPending}
        label={run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause")}
        disabled={busy || !supported} onPress={() => confirmAction(run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause"),
          run.status === "paused" ? copy("Ekip görevleri bilgisayarda yeniden ilerleyebilir; gerekirse koordinatör yeniden başlatılır.", "Crew work may continue on the computer; the coordinator may restart if needed.")
            : copy("Yeni görevler bekletilir. Çalışan görevleri de durdurmak için Çalışmayı durdur işlemini kullanın.", "New work is paused. Use Stop work to stop currently running tasks too."),
          run.status === "paused" ? copy("Devam ettir", "Resume") : copy("Beklet", "Pause"),
          () => { if (supported && useMachines.getState().activeId === machineId) (run.status === "paused" ? resume : pause).mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); })} />}
      {run.coordinatorSessionId && <Button tone="quiet" disabled={!supported} label={copy("Koordinatör oturumu", "Coordinator session")} onPress={() => openSession(run.coordinatorSessionId!)} />}
    </Row>}
    menu={<ActionMenu label={copy("Ekip çalışması işlemleri", "Crew work actions")} actions={[
      canStopCrewRun(run) && { key: "stop", label: copy("Çalışmayı durdur", "Stop work"), destructive: true, disabled: busy || !supported,
        onPress: () => confirmAction(copy("Çalışmayı durdur", "Stop work"), copy("Koordinatör ve çalışan ekip görevleri durdurulur. Dosyalar ve çalışma kaydı korunur.", "The coordinator and active crew tasks will stop. Files and the work record are kept."),
          copy("Durdur", "Stop"), () => { if (supported && useMachines.getState().activeId === machineId) stop.mutate({ projectId: run.projectId, runId: run.id }, { onError: refreshAfterFailure }); }) },
      machine?.capabilities?.includes("crews.run-delete.v1") && { key: "delete", label: copy("Çalışmayı sil", "Delete work"), destructive: true,
        disabled: busy || !supported || !canDeleteCrewRun(run),
        onPress: () => confirmAction(copy("Çalışmayı sil", "Delete work"), copy("Bu çalışma listeden kaldırılsın mı? Ekip, görevler ve oturumlar korunur.", "Remove this work from the list? The crew, tasks and conversations are kept."),
          copy("Sil", "Delete"), () => { if (supported && !busy && canDeleteCrewRun(run) && useMachines.getState().activeId === machineId) remove.mutate({ projectId: run.projectId, runId: run.id, expectedUpdatedAt: run.updatedAt }); }) },
    ]} />}
    details={<Stack>
      <Body muted>{copy("Ekip üyeleri", "Crew members")}: {run.definition.agents.map((agent) => agent.name).join(" · ")}</Body>
      <NavigationGroup>{run.tasks.map((task) => { const sessions = crewTaskSessions(task); return <Stack key={task.id}><NavigationRow label={task.title} trailing={<Status value={task.status} />}
        detail={[run.assignments.find((assignment) => assignment.taskId === task.id)?.candidate.model, task.error].filter(Boolean).join(" · ")}
        disabled={!sessions.worker || !supported} onPress={() => { if (sessions.worker) openSession(sessions.worker); }} />
        {sessions.review && <NavigationRow label={copy("İnceleyen", "Reviewer")} detail={task.title} disabled={!supported}
          onPress={() => openSession(sessions.review!)} />}</Stack>; })}</NavigationGroup>
      {!run.tasks.length && <Body muted>{copy("Henüz ekip görevi oluşmadı.", "No crew tasks have been created yet.")}</Body>}
      <CrewRuntimePanel run={run} />
    </Stack>}>
    {run.status === "paused" && crewActivityKnown(run) && <Body muted>{crewHasRunningWork(run)
      ? copy("Yeni görev atamaları duraklatıldı. Devam eden işler tamamlanabilir.", "New assignments are paused. Running work can still finish.")
      : copy("İş duraklatıldı. Çalışan bir işlem yok.", "Work is paused. Nothing is running.")}</Body>}
    <ErrorText error={run.error} />
    <MutationState mutation={pause} /><MutationState mutation={resume} /><MutationState mutation={stop} /><MutationState mutation={remove} />
  </RecordCard>;
}
