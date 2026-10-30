import { useRef, useState } from "react";
import type { CrewPendingInput, CrewRunDetail, CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
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

function PendingInput({
  input,
  run,
  disabled,
}: {
  input: CrewPendingInput;
  run: CrewRunView;
  disabled: boolean;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const answer = useHostMutation("crews.answer", ["crews", run.projectId]);
  const respond = useHostMutation("crews.respond", ["crews", run.projectId]);
  const [requestId] = useState(identifier);
  const sending = useRef(false);
  const blocked =
    disabled ||
    sending.current ||
    answer.isPending ||
    respond.isPending ||
    !input.targetRunId ||
    !run.definition.policy.delegateApprovals;
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
      {!run.definition.policy.delegateApprovals && (
        <Notice
          tone="info"
          message={copy(
            "Bu çalışma için devredilmiş onay izni yok. Üye oturumundan yanıtlayın.",
            "Delegated approval is unavailable for this work. Respond in the member session.",
          )}
        />
      )}
      {input.question && (
        <QuestionCard
          question={input.question}
          draftScope={JSON.stringify([machineId, input.sessionId, input.targetRunId])}
          deliveryVersion={run.updatedAt}
          disabled={blocked}
          onAnswer={async (reply) => {
            if (blocked || sending.current || useMachines.getState().activeId !== machineId) return;
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

export function CrewRuntimePanel({ run }: { run: CrewRunView }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const [assigning, setAssigning] = useState(false);
  const supported =
    machine?.id === machineId && machine?.capabilities?.includes("crews.v1") === true;
  const query = useHostQuery<CrewRunDetail>(
    ["crews", run.projectId, run.id],
    "crews.get",
    { projectId: run.projectId, runId: run.id },
    { enabled: supported, interval: 5000 },
  );
  const detail = query.data;
  const accept = useHostMutation("crews.accept", ["crews", run.projectId]);
  const finish = useHostMutation("crews.finish", ["crews", run.projectId]);
  const resolve = useHostMutation("crews.resolve", ["crews", run.projectId]);
  const request = useHostMutation("crews.request", ["crews", run.projectId]);
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(identifier);
  const sending = useRef(false);
  const busy = accept.isPending || finish.isPending || resolve.isPending || request.isPending;
  const available = () => supported && !busy && useMachines.getState().activeId === machineId;
  return (
    <Stack>
      <QueryState query={query} />
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
                  request.mutate(
                    { projectId: run.projectId, runId: run.id, requestId, text: text.trim() },
                    {
                      onSuccess: () => {
                        sending.current = false;
                        setText("");
                        setRequestId(identifier());
                      },
                    },
                  );
                }}
              />
            </Disclosure>
          )}
          {(detail.pendingInputs ?? []).map((input) => (
            <PendingInput
              key={`${input.sessionId}:${input.targetRunId}:${input.question?.requestId ?? input.approval?.requestId}`}
              input={input}
              run={detail}
              disabled={!available()}
            />
          ))}
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
