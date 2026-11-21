import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import {
  Badge,
  Body,
  Disclosure,
  FormActions,
  NavigationRow,
  Notice,
  Row,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MessageText } from "@/ui/message-text";
import { space } from "@/ui/tokens";
import { ErrorText } from "./shared";
import { TranscriptToolPreview } from "./transcript-tool-preview";
import { SubagentStopReview } from "./subagent-stop-review";
import type { TranscriptBlockProps } from "./session-types";
import {
  activeSubagent,
  subagentSteps,
  subagentStopCommand,
  subagentTarget,
} from "./subagent-model";
import { stamp } from "../management/shared/format";
import { FeatureUnavailable } from "./unavailable-state";
import { Status, statusLabel } from "../management/shared/status";
import { agentStateLabel } from "./agent-state";
import { activityState } from "./transcript-model";

type Step = NonNullable<TranscriptBlockProps["block"]["agentRun"]>["steps"][number];

function AgentTrailStep({ step, context, live }: { step: Step; context: TranscriptBlockProps["context"]; live: boolean }) {
  const copy = useCopy();
  const nested = step.agentRun;
  const state = nested ? activityState({ id: step.id, role: "tool", text: step.text, tool: { status: step.status }, agentRun: nested }) : undefined;
  const content = (
    <Stack style={{ gap: space.xs }}>
      {!nested ? (
        <Row>
          <Body muted>{statusLabel(step.kind, copy)}</Body>
          {step.status ? <Status value={step.status} /> : null}
        </Row>
      ) : null}
      {step.text !== nested?.name ? <MessageText text={step.text} context={context} compactMedia /> : null}
      {step.detail ? <MessageText text={step.detail} context={context} compactMedia /> : null}
      {step.output && step.output !== step.detail ? <MessageText text={step.output} context={context} compactMedia /> : null}
      {step.preview ? <TranscriptToolPreview preview={step.preview} status={step.status} context={context} /> : null}
      {step.outputTruncated ? <Body muted>{copy("Çıktı kısaltıldı.", "Output was truncated.")}</Body> : null}
    </Stack>
  );
  if (!nested || !state) return content;
  const meta = [state === "neutral" ? undefined : agentStateLabel(state === "running" && !live ? "interrupted" : state, copy), nested.model].filter(Boolean).join(" · ");
  return (
    <Disclosure label={nested.name || step.text} detail={meta || undefined}>
      {content}
      {nested.prompt ? <MessageText text={nested.prompt} context={context} compactMedia /> : null}
      {nested.steps?.map(item => <AgentTrailStep key={item.id} step={item} context={context} live={live && state === "running"} />)}
    </Disclosure>
  );
}

export function SubagentDetails({
  block,
  scope,
  runId,
  disabled,
  onCommand,
  context,
  parentProvider,
  interrupted = false,
}: Pick<
  TranscriptBlockProps,
  "block" | "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider"
> & { interrupted?: boolean }) {
  const copy = useCopy(),
    connection = useConnectionScope(),
    access = usePrivateContentAccess();
  const [target] = useState(() => subagentTarget(scope, block, runId));
  const machine = useMachines((state) =>
    state.machines.find((entry) => entry.id === target.machineId),
  );
  const [opening] = useState(() => ({
    connection,
    provider: parentProvider,
    machineName: machine?.name ?? machine?.id ?? "",
  }));
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const latest = useRef({ block, scope, runId, disabled, onCommand, parentProvider, access });
  latest.current = { block, scope, runId, disabled, onCommand, parentProvider, access };
  const [pending, setPending] = useState(false),
    [requested, setRequested] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<unknown>(null);
  const attemptedNow = useRef(false);
  useSheetGuard({ pending });
  const matches =
    target.blockId === block.id &&
    target.callId === block.tool?.callId &&
    target.machineId === scope.machineId &&
    target.sessionId === scope.sessionId;
  const scopeCurrent =
    matches &&
    connection === opening.connection &&
    opening.connection.isCurrent() &&
    useMachines.getState().activeId === target.machineId &&
    parentProvider === opening.provider;
  const readable = scopeCurrent && access.allowed && access.check();
  const readLease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => {
    readLease.active = true;
    return () => {
      readLease.active = false;
    };
  }, [readLease]);
  const current = () =>
    mounted.current &&
    readable &&
    readLease.active &&
    opening.connection.isCurrent() &&
    useMachines.getState().activeId === target.machineId &&
    latest.current.access.allowed &&
    latest.current.access.check();
  const running = matches && !interrupted && activeSubagent(block);
  const canStop =
    readable &&
    running &&
    !block.agentRun?.workflow &&
    target.runId === runId &&
    !!runId &&
    runId !== "desktop" &&
    !!target.callId &&
    opening.provider === "claude" &&
    parentProvider === opening.provider &&
    machine?.capabilities?.includes("sessions.stopItem.claude") === true &&
    !disabled;
  const lease = useMemo(() => ({ active: false }), [canStop, runId, block.agentRun?.name]);
  useLayoutEffect(() => {
    lease.active = true;
    return () => {
      lease.active = false;
    };
  }, [lease]);
  type Approval = { name: string; lease: typeof lease };
  const [approval, setApproval] = useState<Approval>(),
    issued = useRef<Approval | undefined>(undefined);
  useLayoutEffect(() => {
    if (issued.current && issued.current.lease !== lease) {
      issued.current = undefined;
      setApproval(undefined);
    }
  }, [lease]);
  useLayoutEffect(
    () => () => {
      issued.current = undefined;
    },
    [],
  );
  const openStop = () => {
    if (!current() || !lease.active || !canStop || attemptedNow.current || issued.current) return;
    const value = { name: block.agentRun?.name || target.blockId, lease };
    issued.current = value;
    setApproval(value);
  };
  const cancelStop = () => {
    if (approval && issued.current === approval) {
      issued.current = undefined;
      setApproval(undefined);
    }
  };
  const stop = async () => {
    if (
      !approval ||
      issued.current !== approval ||
      approval.lease !== lease ||
      !lease.active ||
      !current() ||
      !canStop ||
      attemptedNow.current
    )
      return;
    const value = latest.current,
      liveMachine = useMachines.getState().machines.find((entry) => entry.id === target.machineId);
    if (
      value.disabled ||
      value.parentProvider !== opening.provider ||
      !liveMachine?.capabilities?.includes("sessions.stopItem.claude")
    ) {
      issued.current = undefined;
      setApproval(undefined);
      return;
    }
    issued.current = undefined;
    setApproval(undefined);
    try {
      const command = subagentStopCommand(target, value.scope, value.block, value.runId);
      attemptedNow.current = true;
      setAttempted(true);
      setPending(true);
      setError(null);
      await value.onCommand(command);
      if (mounted.current) setRequested(true);
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  const { steps, report } = subagentSteps(block);
  const [reader, setReader] = useState<"assignment" | "report">();
  const readerLease = useMemo(() => ({ active: false }), [readable, reader]);
  useLayoutEffect(() => {
    readerLease.active = true;
    return () => {
      readerLease.active = false;
    };
  }, [readerLease]);
  useLayoutEffect(() => {
    if (!readable) setReader(undefined);
  }, [readable]);
  const read = (value: "assignment" | "report") => {
    if (current() && readerLease.active) setReader(value);
  };
  const closeReader = () => {
    if (mounted.current && readerLease.active) setReader(undefined);
  };
  const showStopAction = readable && canStop && (!attempted || pending);
  const feedback = (
    <>
      <ErrorText error={error} />
      {requested && running ? (
        <Notice
          tone="info"
          message={copy(
            "Durdurma isteği kabul edildi. Alt ajanın durumunu kontrol edin.",
            "The stop request was accepted. Check the subagent’s status.",
          )}
        />
      ) : null}
    </>
  );
  return (
    <>
      <ScreenList
        data={readable ? steps : []}
        keyExtractor={(step) => step.id}
        header={
          <Stack>
            {readable ? (
              <>
                <CollectionToolbar
                  field={<Body selectable>{opening.machineName}</Body>}
                  actions={
                    interrupted ? (
                      <Badge label={agentStateLabel("interrupted", copy)} tone="warning" />
                    ) : block.approval && !block.approval.decided ? (
                      <Status value="awaiting-approval" />
                    ) : running ? (
                      <Status value="running" />
                    ) : block.tool?.status ? (
                      <Status value={block.tool.status} />
                    ) : block.agentRun?.endedAt !== undefined ? (
                      <Status value="completed" />
                    ) : undefined
                  }
                />
                {[block.agentRun?.agentType, block.agentRun?.model].filter(Boolean).length ? (
                  <Body muted>
                    {[block.agentRun?.agentType, block.agentRun?.model].filter(Boolean).join(" · ")}
                  </Body>
                ) : null}
                {block.agentRun?.prompt ? (
                  <NavigationRow
                    label={copy("Görev", "Assignment")}
                    onPress={() => read("assignment")}
                  />
                ) : null}
                {report ? (
                  <NavigationRow label={copy("Sonuç", "Report")} onPress={() => read("report")} />
                ) : null}
                <Disclosure label={copy("Ayrıntılar", "Details")}>
                  {block.agentRun?.startedAt !== undefined ? (
                    <Body muted>
                      {copy("Başlangıç", "Started")}: {stamp(block.agentRun.startedAt)}
                    </Body>
                  ) : null}
                  {block.agentRun?.endedAt !== undefined ? (
                    <Body muted>
                      {copy("Bitiş", "Finished")}: {stamp(block.agentRun.endedAt)}
                    </Body>
                  ) : null}
                  {block.tool?.agentContext ? (
                    <Body muted>
                      {copy("Bağlam: %{p0}", "Context: {p0}%", {
                        p0: Math.round(block.tool.agentContext.used),
                      })}
                    </Body>
                  ) : null}
                  <Body muted>{copy("Ana oturum", "Parent session")}</Body>
                  <Body mono selectable>
                    {target.sessionId}
                  </Body>
                  <Body mono selectable>
                    {target.runId}
                  </Body>
                  <Body mono selectable>
                    {target.blockId}
                  </Body>
                  <Body mono selectable>
                    {target.callId}
                  </Body>
                </Disclosure>
                {!showStopAction ? feedback : null}
              </>
            ) : (
              <FeatureUnavailable
                message={
                  !matches
                    ? copy(
                        "Seçili alt ajan değişti. Ayrıntıları yeniden açın.",
                        "The selected subagent changed. Reopen its details.",
                      )
                    : copy(...RECORD_ACCESS_UNAVAILABLE)
                }
              />
            )}
          </Stack>
        }
        renderItem={({ item: step }) => <AgentTrailStep step={step} context={context} live={running} />}
      />
      {showStopAction ? (
        <FormActions
          submitLabel={copy("Bu alt ajanı durdur", "Stop this subagent")}
          tone="danger"
          disabled={pending || attempted || !!approval}
          busy={pending}
          onSubmit={openStop}
          feedback={feedback}
        />
      ) : null}
      <PrivateContentAccessProvider value={{ allowed: readable, check: current }}>
        {approval && approval.lease === lease && canStop ? (
          <SubagentStopReview
            name={approval.name}
            machineName={opening.machineName}
            target={target}
            onClose={cancelStop}
            onConfirm={() => {
              void stop();
            }}
          />
        ) : null}
        {reader && readable ? (
          <Sheet
            visible
            title={reader === "assignment" ? copy("Görev", "Assignment") : copy("Sonuç", "Report")}
            size="form"
            onClose={closeReader}
          >
            <MessageText
              text={reader === "assignment" ? block.agentRun?.prompt || "" : report || ""}
              context={context}
              compactMedia
            />
          </Sheet>
        ) : null}
      </PrivateContentAccessProvider>
    </>
  );
}
