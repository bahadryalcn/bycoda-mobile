import { useRef, useState } from "react";
import { useMachines } from "@/state/machines";
import { Badge, Body, Button, Notice, Row, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { useCopy } from "@/ui/copy";
import { MessageText } from "@/ui/message-text";
import { space } from "@/ui/tokens";
import { confirmAction } from "@/ui/confirm";
import { ErrorText } from "./shared";
import { TranscriptToolPreview } from "./transcript-tool-preview";
import type { TranscriptBlockProps } from "./session-types";
import { activeSubagent, subagentSteps, subagentStopCommand, subagentTarget } from "./subagent-model";
import { stamp } from "../management/shared/format";

export function SubagentDetails({ block, scope, runId, disabled, onCommand, context, parentProvider }:
  Pick<TranscriptBlockProps, "block" | "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider">) {
  const copy = useCopy();
  const [target] = useState(() => subagentTarget(scope, block, runId));
  const [opening] = useState(block);
  const [provider] = useState(parentProvider);
  const latest = useRef({ block, scope, runId, disabled });
  latest.current = { block, scope, runId, disabled };
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const attempted = useRef(false);
  const machine = useMachines((state) => state.machines.find((entry) => entry.id === target.machineId));
  const { steps, report } = subagentSteps(block);
  const matches = target.blockId === block.id && target.callId === block.tool?.callId && target.machineId === scope.machineId && target.sessionId === scope.sessionId;
  const running = matches && activeSubagent(block);
  const shown = matches ? block : opening;
  const canStop = running && target.runId === runId && !!runId && runId !== "desktop" && !!target.callId &&
    provider === "claude" && parentProvider === provider && machine?.capabilities?.includes("sessions.stopItem.claude") === true && !disabled;
  const stop = async () => {
    if (attempted.current || pending) return;
    const current = latest.current;
    if (current.disabled || useMachines.getState().activeId !== target.machineId || !canStop) return;
    try {
      const command = subagentStopCommand(target, current.scope, current.block, current.runId);
      attempted.current = true;
      setPending(true);
      await onCommand(command);
      setRequested(true);
    } catch (cause) { setError(cause); }
    finally { setPending(false); }
  };
  return <ScreenList data={matches ? steps : []} keyExtractor={(step) => step.id}
    header={<Stack>
      <Row><Body>{shown.agentRun?.name}</Body><Badge label={running ? copy("Çalışıyor", "Running") : shown.tool?.status || copy("Tamamlandı", "Completed")} /></Row>
      <Body muted>{[shown.agentRun?.agentType, shown.agentRun?.model].filter(Boolean).join(" · ")}</Body>
      {shown.agentRun?.startedAt !== undefined ? <Body muted>{copy("Başlangıç", "Started")}: {stamp(shown.agentRun.startedAt)}</Body> : null}
      {shown.agentRun?.endedAt !== undefined ? <Body muted>{copy("Bitiş", "Finished")}: {stamp(shown.agentRun.endedAt)}</Body> : null}
      {shown.tool?.agentContext ? <Body muted>{copy("Bağlam: %{p0}", "Context: {p0}%", { p0: Math.round(shown.tool.agentContext.used) })}</Body> : null}
      <Body muted>{copy("Ana oturum", "Parent session")}: {target.sessionId}</Body>
      {!matches ? <Notice tone="warning" message={copy("Seçili alt ajan değişti. Ayrıntıları yeniden açın.", "The selected subagent changed. Reopen its details.")} /> : null}
      {shown.agentRun?.prompt ? <><Body>{copy("Görev", "Assignment")}</Body><MessageText text={shown.agentRun.prompt} context={context} compactMedia /></> : null}
      <ErrorText error={error} />
      {requested && running ? <Notice tone="info" message={copy("Durdurma isteği kabul edildi. Alt ajanın durumunu kontrol edin.", "The stop request was accepted. Check the subagent’s status.")} /> : null}
      {canStop ? <Button label={copy("Bu alt ajanı durdur", "Stop this subagent")} tone="danger" disabled={pending || attempted.current} busy={pending}
        onPress={() => confirmAction(copy("Bu alt ajanı durdur", "Stop this subagent"), block.agentRun?.name ?? target.blockId,
          copy("Durdur", "Stop"), () => { void stop(); })} /> : null}
    </Stack>}
    renderItem={({ item: step }) => <Stack style={{ gap: space.xs }}>
      <Row><Body muted>{step.kind}</Body>{step.status ? <Badge label={step.status} /> : null}</Row>
      <MessageText text={step.text} context={context} compactMedia />
      {step.detail ? <MessageText text={step.detail} context={context} compactMedia /> : null}
      {step.output && step.output !== step.detail ? <MessageText text={step.output} context={context} compactMedia /> : null}
      {step.preview ? <TranscriptToolPreview preview={step.preview} status={step.status} context={context} /> : null}
      {step.outputTruncated ? <Body muted>{copy("Çıktı kısaltıldı.", "Output was truncated.")}</Body> : null}
    </Stack>}
    footer={report && matches ? <Stack><Body>{copy("Sonuç", "Report")}</Body><MessageText text={report} context={context} compactMedia /></Stack> : undefined} />;
}
