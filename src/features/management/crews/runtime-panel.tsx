import { useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { router } from "expo-router";
import type { CrewPendingInput, CrewRunDetail, CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import {
  Body,
  Button,
  Disclosure,
  Field,
  MutationState,
  Notice,
  QueryState,
  Row,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { QuestionCard } from "../../workspace/question-card";
import { identifier } from "../shared/format";
import { canAcceptCrewTask, canFinishCrewRun, crewInputDefinitelyRejected, crewRunPollInterval } from "./runtime-model";
import { CrewAssignmentEditor } from "./assignment-editor";
import { CrewMemberInspection } from "./member-inspection";
import { messageSenderLabel, reviewVerdictLabel } from "./review-labels";
import { isApprovalOccurrenceId } from "../../../../../src/shared/model/approvalOccurrence";

function PendingInput({
  input,
  run,
  disabled,
  current,
}: {
  input: CrewPendingInput;
  run: CrewRunView;
  disabled: boolean;
  current(): boolean;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const answer = useHostMutation("crews.answer", ["crews", run.projectId]);
  const respond = useHostMutation("crews.respond", ["crews", run.projectId]);
  const [requestId] = useState(identifier);
  const sending = useRef(false);
  const needsMemberSession =
    !input.targetRunId ||
    !run.definition.policy.delegateApprovals ||
    (!!input.approval && !isApprovalOccurrenceId(input.approval.occurrenceId));
  // Retire retained navigation callbacks when their displayed owner or access changes.
  const navigation = useMemo(
    () => ({ active: false }),
    [
      disabled,
      machineId,
      run.id,
      run.projectId,
      input.sessionId,
      input.targetRunId,
      needsMemberSession,
    ],
  );
  useLayoutEffect(() => {
    navigation.active = true;
    return () => {
      navigation.active = false;
    };
  }, [navigation]);
  const recoveryAction =
    !disabled && machineId && input.sessionId
      ? {
          label: copy("Oturumu aç", "Open session"),
          onPress: () => {
            if (!navigation.active || !current() || useMachines.getState().activeId !== machineId)
              return;
            router.navigate({
              pathname: "/session/[id]",
              params: {
                id: input.sessionId,
                machineId,
                projectId: run.projectId,
              },
            });
          },
        }
      : undefined;
  const blocked =
    disabled || sending.current || answer.isPending || respond.isPending || needsMemberSession;
  const params = {
    projectId: run.projectId,
    runId: run.id,
    sessionId: input.sessionId,
    targetRunId: input.targetRunId,
    requestId,
  };
  const displayedApproval =
    input.approval &&
    Object.freeze({
      approvalId: input.approval.requestId,
      approvalOccurrenceId: input.approval.occurrenceId,
    });
  return (
    <Stack>
      <Body muted>{run.tasks.find((task) => task.id === input.taskId)?.title ?? copy("Ekip görevi", "Crew task")}</Body>
      {needsMemberSession &&
        (run.definition.policy.delegateApprovals ? (
          <Notice
            tone="info"
            message={copy(
              "Bu isteği üye oturumundan yanıtlayın.",
              "Respond to this request in the member session.",
            )}
            action={recoveryAction}
          />
        ) : (
          recoveryAction && <Button tone="quiet" {...recoveryAction} />
        ))}
      {input.question && (
        <QuestionCard
          question={input.question}
          draftScope={JSON.stringify([machineId, input.sessionId, input.targetRunId])}
          deliveryVersion={run.updatedAt}
          disabled={blocked}
          onAnswer={async (reply) => {
            if (
              blocked ||
              sending.current ||
              !current() ||
              useMachines.getState().activeId !== machineId
            )
              return;
            sending.current = true;
            // Keep the same receipt identity after an uncertain response; never replay automatically.
            try {
              await answer.mutateAsync({
                ...params,
                questionId: input.question!.requestId,
                replyJson: JSON.stringify(reply),
              });
            } catch (error) {
              if (crewInputDefinitelyRejected(error)) sending.current = false;
              throw error;
            }
          }}
        />
      )}
      {input.approval && (
        <>
          <Body>{input.text}</Body>
          <Row>
            {(["allow", "deny"] as const).map((decision) => (
              <Button
                key={decision}
                tone="quiet"
                disabled={blocked}
                label={decision === "allow" ? copy("İzin ver", "Allow") : copy("Reddet", "Deny")}
                onPress={() =>
                  confirmAction(
                    copy("Üye izin isteği", "Member approval request"),
                    input.text ?? String(displayedApproval!.approvalId),
                    decision === "allow" ? copy("İzin ver", "Allow") : copy("Reddet", "Deny"),
                    () => {
                      if (
                        blocked ||
                        sending.current ||
                        !current() ||
                        useMachines.getState().activeId !== machineId
                      )
                        return;
                      sending.current = true;
                      respond.mutate(
                        { ...params, ...displayedApproval, decision },
                        {
                          onError: (error) => {
                            if (crewInputDefinitelyRejected(error)) sending.current = false;
                          },
                        },
                      );
                    },
                  )
                }
              />
            ))}
          </Row>
        </>
      )}
      <MutationState mutation={answer} />
      <MutationState mutation={respond} />
    </Stack>
  );
}

/** One runtime query owns required inputs; task content follows them without entering its data gate. */
export function CrewRuntimePanel({ run, active, children }: PropsWithChildren<{ run: CrewRunView; active: boolean }>) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const connection = useConnectionScope();
  const [opening] = useState(connection);
  const [assigning, setAssigning] = useState(false);
  const supported =
    machine?.id === machineId &&
    opening.isCurrent() &&
    machine?.capabilities?.includes("crews.v1") === true;
  const query = useHostQuery<CrewRunDetail>(
    ["crews", run.projectId, run.id],
    "crews.get",
    { projectId: run.projectId, runId: run.id },
    { enabled: supported && active, interval: (data) => crewRunPollInterval(data ?? run) },
  );
  const detail = supported ? query.data : undefined;
  const accept = useHostMutation("crews.accept", ["crews", run.projectId]);
  const finish = useHostMutation("crews.finish", ["crews", run.projectId]);
  const resolve = useHostMutation("crews.resolve", ["crews", run.projectId]);
  const request = useHostMutation("crews.request", ["crews", run.projectId]);
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(identifier);
  // "uncertain": the send outcome is unknown, so the draft and receipt stay locked until a check settles it.
  // "absent": the receipt was absent at the time of the check; the original send may still land.
  const [requestState, setRequestState] = useState<"idle" | "uncertain" | "absent">("idle");
  // The exact text the current receipt was sent with; the host rejects a receipt reused with other text.
  const [attemptText, setAttemptText] = useState<string>();
  // Synchronous double-press guard only; it is cleared on every outcome and never gates rendering.
  const sending = useRef(false);
  const requestHeld = requestState === "uncertain";
  const clearRequest = (submitted: string) => {
    sending.current = false;
    setRequestState("idle");
    setAttemptText(undefined);
    setText((latest) => (latest.trim() === submitted ? "" : latest));
    setRequestId(identifier());
  };
  const busy = accept.isPending || finish.isPending || resolve.isPending || request.isPending;
  const available = () =>
    supported && opening.isCurrent() && !busy && useMachines.getState().activeId === machineId;
  return (
    <Stack>
      <QueryState query={query} />
      {!!detail?.pendingInputs?.length && !detail.definition.policy.delegateApprovals && (
        <Notice
          tone="info"
          message={copy(
            "Bu çalışma için devredilmiş onay izni yok. Üye oturumundan yanıtlayın.",
            "Delegated approval is unavailable for this work. Respond in the member session.",
          )}
        />
      )}
      {detail &&
        (detail.pendingInputs ?? []).map((input) => (
          <PendingInput
            key={JSON.stringify([
              opening.token,
              detail.projectId,
              detail.id,
              input.sessionId,
              input.targetRunId,
              input.question
                ? ["question", input.question.requestId, input.question.occurrenceId]
                : null,
              input.approval
                ? ["approval", input.approval.requestId, input.approval.occurrenceId]
                : null,
            ])}
            input={input}
            run={detail}
            disabled={!available()}
            current={opening.isCurrent}
          />
        ))}
      {children}
      {detail && (
        <>
          <Disclosure
            label={copy("Üye yetenekleri", "Member capabilities")}
            detail={detail.definition.agents.map((member) => member.name).join(" · ")}
          >
            {detail.definition.agents.map((member) => (
              <Disclosure key={member.id} label={member.name}>
                <CrewMemberInspection
                  definition={detail.definition}
                  memberId={member.id}
                  projectId={run.projectId}
                />
              </Disclosure>
            ))}
          </Disclosure>
          <Button
            tone="quiet"
            label={copy("Görev ata", "Assign task")}
            disabled={
              !available() ||
              detail.status !== "active" ||
              !machine?.capabilities?.includes("crews.tasks.v1")
            }
            onPress={() => setAssigning(true)}
          />
          {assigning && (
            <Sheet
              visible
              size="form"
              title={copy("Ekip görevi", "Crew task")}
              onClose={() => setAssigning(false)}
            >
              <CrewAssignmentEditor run={detail} onClose={() => setAssigning(false)} />
            </Sheet>
          )}
          <Disclosure
            label={copy("İnceleme", "Review")}
            detail={copy("{p0} görev", "{p0} tasks", { p0: detail.tasks.length })}
          >
            {detail.tasks.map((task) => (
              <Disclosure key={task.id} label={task.title}>
                <Body>{reviewVerdictLabel(task.verification?.review?.verdict, copy)}</Body>
                {task.verification?.review?.note ? <Body>{task.verification.review.note}</Body> : null}
                {detail.assignments.find((entry) => entry.taskId === task.id)?.files?.length ? (
                  <Body muted>
                    {detail.assignments.find((entry) => entry.taskId === task.id)?.files?.join(" · ")}
                  </Body>
                ) : null}
                <Button
                  tone="quiet"
                  label={copy("Teslimi kabul et", "Accept delivery")}
                  disabled={!available() || !canAcceptCrewTask(detail, task.id)}
                  onPress={() =>
                    confirmAction(
                      copy("Teslimi kabul et", "Accept delivery"),
                      copy(
                        "Bilgisayar bağımsız incelemeyi ve güncel değişiklikleri yeniden doğrular. Kabul etmek değişiklikleri kaydetmez veya birleştirmez.",
                        "The computer rechecks the independent review and current changes. Accepting does not commit or merge them.",
                      ),
                      copy("Kabul et", "Accept"),
                      () => {
                        if (available())
                          accept.mutate({
                            projectId: run.projectId,
                            runId: run.id,
                            taskId: task.id,
                          });
                      },
                      undefined,
                      "default",
                    )
                  }
                />
              </Disclosure>
            ))}
          </Disclosure>
          {detail.messages.map((message) => (
            <Stack key={message.id}>
              <Body>{message.text}</Body>
              <Body muted>{messageSenderLabel(message.from, detail.coordinatorSessionId, copy)}</Body>
              {!message.resolvedAt && (
                <Button
                  tone="quiet"
                  label={copy("Çözüldü olarak işaretle", "Mark resolved")}
                  disabled={!available()}
                  onPress={() =>
                    confirmAction(
                      copy("İsteği çöz", "Resolve request"),
                      message.text,
                      copy("Çözüldü", "Resolved"),
                      () => {
                        if (available())
                          resolve.mutate({
                            projectId: run.projectId,
                            runId: run.id,
                            requestId: message.id,
                          });
                      },
                    )
                  }
                />
              )}
            </Stack>
          ))}
          {detail.status !== "finished" && (
            <Disclosure label={copy("Ekibe istek", "Request to crew")}>
              <Field
                label={copy("Ekibe istek", "Request to crew")}
                value={text}
                onChangeText={setText}
                multiline
                editable={!busy && requestState === "idle"}
              />
              <Button
                tone="quiet"
                label={requestState === "absent" ? copy("Yeniden dene", "Retry") : copy("İsteği ekle", "Add request")}
                disabled={!available() || !text.trim() || requestHeld}
                onPress={() => {
                  if (!available() || !text.trim() || requestHeld || sending.current) return;
                  const submitted = text.trim();
                  if (requestState === "absent" && attemptText !== submitted) return;
                  sending.current = true;
                  // An edited draft may use a new receipt only after a definite rejection.
                  const id = attemptText === undefined || attemptText === submitted ? requestId : identifier();
                  setRequestId(id);
                  setAttemptText(submitted);
                  request.mutate(
                    { projectId: run.projectId, runId: run.id, requestId: id, text: submitted },
                    {
                      onSuccess: () => clearRequest(submitted),
                      onError: (error) => {
                        sending.current = false;
                        // A definite rejection keeps draft and receipt unlocked; the mutation error stays visible.
                        if (!crewInputDefinitelyRejected(error)) setRequestState("uncertain");
                      },
                    },
                  );
                }}
              />
              {requestState === "absent" && (
                <Notice
                  tone="info"
                  message={copy(
                    "Eşleşen istek bulunamadı. Yeniden denerseniz aynı istek yeniden gönderilir.",
                    "No matching request was found. Retrying sends the same request again.",
                  )}
                />
              )}
              {requestHeld ? (
                <>
                  <Notice
                    tone="warning"
                    message={copy(
                      "İstek sonucu bilinmiyor. Durumu kontrol etmek isteği yeniden göndermez.",
                      "The request outcome is unknown. Checking status does not resend it.",
                    )}
                  />
                  <Button
                    label={copy("İsteği kontrol et", "Check request")}
                    busy={query.isFetching}
                    disabled={
                      !opening.isCurrent() ||
                      query.isFetching ||
                      useMachines.getState().activeId !== machineId
                    }
                    onPress={() => {
                      if (
                        !opening.isCurrent() ||
                        query.isFetching ||
                        useMachines.getState().activeId !== machineId
                      )
                        return;
                      const expected = attemptText ?? text.trim();
                      void query
                        .refetch()
                        .then((result) => {
                          if (
                            !opening.isCurrent() ||
                            useMachines.getState().activeId !== machineId ||
                            result.error ||
                            !result.data
                          )
                            return;
                          const stored = result.data.messages.find((message) => message.id === requestId);
                          if (!stored) {
                            // The host dedupes this receipt even if the original send arrives late.
                            setRequestState("absent");
                            return;
                          }
                          if (stored.from !== "owner" || stored.text !== expected) return;
                          clearRequest(expected);
                          request.reset();
                        })
                        .catch(() => {});
                    }}
                  />
                </>
              ) : null}
            </Disclosure>
          )}
          <Button
            tone="primary"
            label={copy("Ekip çalışmasını tamamla", "Finish crew work")}
            disabled={!available() || !canFinishCrewRun(detail)}
            onPress={() =>
              confirmAction(
                copy("Çalışmayı tamamla", "Finish work"),
                copy(
                  "Tüm teslimleri, bağımsız incelemeyi ve entegrasyonu bilgisayar doğrular. Dosyalar yayımlanmaz.",
                  "The host validates deliveries, independent review and integration. Files are not published.",
                ),
                copy("Tamamla", "Finish"),
                () => {
                  if (available()) finish.mutate({ projectId: run.projectId, runId: run.id });
                },
                undefined,
                "default",
              )
            }
          />
        </>
      )}
      <MutationState mutation={accept} />
      <MutationState mutation={finish} />
      <MutationState mutation={resolve} />
      <MutationState mutation={request} />
    </Stack>
  );
}
