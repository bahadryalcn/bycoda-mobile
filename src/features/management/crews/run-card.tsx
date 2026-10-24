import { router } from "expo-router";
import { useState } from "react";
import type { CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Body, Button, ErrorText, MutationState, NavigationGroup, NavigationRow, Row, Stack } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { Status } from "../shared/status";
import { CrewRuntimePanel } from "./runtime-panel";

export function CrewRunCard({ run }: { run: CrewRunView }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const pause = useHostMutation("crews.pause", ["crews", run.projectId]);
  const resume = useHostMutation("crews.resume", ["crews", run.projectId]);
  const stop = useHostMutation("crews.stop", ["crews", run.projectId]);
  const busy = pause.isPending || resume.isPending || stop.isPending;
  const supported = machine?.id === machineId && machine?.capabilities?.includes("crews.v1") === true;
  const openSession = (sessionId: string) => {
    if (machine) router.push({ pathname: "/session/[id]", params: { id: sessionId, machineId: machine.id, projectId: run.projectId } });
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
          () => { if (supported && useMachines.getState().activeId === machineId) (run.status === "paused" ? resume : pause).mutate({ projectId: run.projectId, runId: run.id }); })} />}
      {run.coordinatorSessionId && <Button tone="quiet" label={copy("Koordinatör oturumu", "Coordinator session")} onPress={() => openSession(run.coordinatorSessionId!)} />}
    </Row>}
    menu={<ActionMenu label={copy("Ekip çalışması işlemleri", "Crew work actions")} actions={[
      run.status !== "finished" && { key: "stop", label: copy("Çalışmayı durdur", "Stop work"), destructive: true, disabled: busy || !supported,
        onPress: () => confirmAction(copy("Çalışmayı durdur", "Stop work"), copy("Koordinatör ve çalışan ekip görevleri durdurulur. Dosyalar ve çalışma kaydı korunur.", "The coordinator and active crew tasks will stop. Files and the work record are kept."),
          copy("Durdur", "Stop"), () => { if (supported && useMachines.getState().activeId === machineId) stop.mutate({ projectId: run.projectId, runId: run.id }); }) },
    ]} />}
    details={<Stack>
      <Body muted>{copy("Ekip üyeleri", "Crew members")}: {run.definition.agents.map((agent) => agent.name).join(" · ")}</Body>
      <NavigationGroup>{run.tasks.map((task) => <NavigationRow key={task.id} label={task.title} trailing={<Status value={task.status} />}
        detail={[run.assignments.find((assignment) => assignment.taskId === task.id)?.candidate.model, task.error].filter(Boolean).join(" · ")}
        disabled={!task.sessionId} onPress={() => { if (task.sessionId) openSession(task.sessionId); }} />)}</NavigationGroup>
      {!run.tasks.length && <Body muted>{copy("Henüz ekip görevi oluşmadı.", "No crew tasks have been created yet.")}</Body>}
      <CrewRuntimePanel run={run} />
    </Stack>}>
    <ErrorText error={run.error} />
    <MutationState mutation={pause} /><MutationState mutation={resume} /><MutationState mutation={stop} />
  </RecordCard>;
}
