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
import { canAcceptCrewTask, canFinishCrewRun, crewInputDefinitelyRejected } from "./runtime-model";
import { CrewAssignmentEditor } from "./assignment-editor";
import { CrewMemberInspection } from "./member-inspection";
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
            router.push({
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
      <Body muted>{run.tasks.find((task) => task.id === input.taskId)?.title ?? input.taskId}</Body>
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
export function CrewRuntimePanel({ run, children }: PropsWithChildren<{ run: CrewRunView }>) {
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
    { enabled: supported, interval: 5000 },
  );
  const detail = supported ? query.data : undefined;
  const accept = useHostMutation("crews.accept", ["crews", run.projectId]);
  const finish = useHostMutation("crews.finish", ["crews", run.projectId]);
  const resolve = useHostMutation("crews.resolve", ["crews", run.projectId]);
  const request = useHostMutation("crews.request", ["crews", run.projectId]);
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(identifier);
  const [requestHeld, setRequestHeld] = useState(false);
  const sending = useRef(false);
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
            detail={`${detail.tasks.length} ${copy("görev", "tasks")}`}
          >
            {detail.tasks.map((task) => (
              <Disclosure key={task.id} label={task.title}>
                <Body>
                  {task.verification?.review?.verdict ??
                    copy("İnceleme bekleniyor", "Awaiting review")}
                </Body>
                <Body>{task.verification?.review?.note}</Body>
                <Body muted>
                  {detail.assignments.find((entry) => entry.taskId === task.id)?.files?.join(" · ")}
                </Body>
                <Button
                  tone="quiet"
                  label={copy("Teslimi kabul et", "Accept delivery")}
                  disabled={!available() || !canAcceptCrewTask(detail, task.id)}
                  onPress={() =>
                    confirmAction(
                      copy("Teslimi kabul et", "Accept delivery"),
                      copy(
                        "Host bağımsız incelemeyi ve güncel değişiklikleri tekrar doğrular. Bu işlem commit veya merge yapmaz.",
                        "The host rechecks independent review and current changes. Acceptance does not commit or merge.",
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
              <Body muted>{message.from}</Body>
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
                editable={!busy && !sending.current}
              />
              <Button
                tone="quiet"
                label={copy("İsteği ekle", "Add request")}
                disabled={!available() || !text.trim() || sending.current}
                onPress={() => {
                  if (!available() || !text.trim() || sending.current) return;
                  sending.current = true;
                  const submitted = text.trim();
                  request.mutate(
                    { projectId: run.projectId, runId: run.id, requestId, text: submitted },
                    {
                      onSuccess: () => {
                        sending.current = false;
                        setRequestHeld(false);
                        setText((latest) => (latest.trim() === submitted ? "" : latest));
                        setRequestId(identifier());
                      },
                      onError: () => setRequestHeld(true),
                    },
                  );
                }}
              />
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
                      const expected = text.trim();
                      void query
                        .refetch()
                        .then((result) => {
                          if (
                            !opening.isCurrent() ||
                            useMachines.getState().activeId !== machineId ||
                            result.error ||
                            !result.data?.messages.some(
                              (message) =>
                                message.id === requestId &&
                                message.from === "owner" &&
                                message.text === expected,
                            )
                          )
                            return;
                          sending.current = false;
                          setRequestHeld(false);
                          setText((latest) => (latest.trim() === expected ? "" : latest));
                          setRequestId(identifier());
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
            tone="quiet"
            label={copy("Ekip çalışmasını tamamla", "Finish crew work")}
            disabled={!available() || !canFinishCrewRun(detail)}
            onPress={() =>
              confirmAction(
                copy("Çalışmayı tamamla", "Finish work"),
                copy(
                  "Tüm teslimler, bağımsız inceleme ve entegrasyon host tarafından doğrulanır. Dosyalar yayımlanmaz.",
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
