import { QuestionCard } from "./question-card";
import { useEffect, useRef } from "react";
import { QuestionAttachmentCard, QuestionAttachmentCleanup } from "./question-attachment-card";
import type { HostTransport } from "@/remote/transport";
import { questionCardIdentity } from "./question-card-state";
import type { UserQuestionPrompt } from "./wire";
import type { QuestionCardProps, SessionCommand, SessionScope } from "./session-types";

/** Submitted requests remain visible until the Host replaces them with transcript history. */
export function SessionQuestions({ pending, submitted = [], scope, runId, revision, disabled, onCommand, client }: {
  pending?: UserQuestionPrompt;
  submitted?: UserQuestionPrompt[];
  scope: SessionScope;
  runId: string;
  revision: number;
  disabled: boolean;
  onCommand: SessionCommand;
  client?: HostTransport;
}) {
  const draftScope = JSON.stringify([scope.machineId, scope.sessionId, runId]);
  const pendingIdentity = pending && questionCardIdentity(draftScope, pending);
  const current = useRef(pendingIdentity); current.current = disabled ? undefined : pendingIdentity;
  // A saved callback cannot dispatch after its question list leaves the screen.
  useEffect(() => () => { current.current = undefined; }, []);
  const card = (key: string, props: QuestionCardProps) => client?.machine.id === scope.machineId
    ? <QuestionAttachmentCard key={key} {...props} client={client} scope={scope} />
    : <QuestionCard key={key} {...props} />;
  const history = submitted.filter(question => questionCardIdentity(draftScope, question) !== pendingIdentity);
  return <>
    {client?.machine.id === scope.machineId ? <QuestionAttachmentCleanup client={client} scope={scope} revision={revision}
      identities={[...history.map(question => questionCardIdentity(draftScope, question)), ...(pendingIdentity ? [pendingIdentity] : [])]} disabled={disabled} /> : null}
    {history.map(question => card(questionCardIdentity(draftScope, question), {
      question, draftScope, deliveryVersion: revision, disabled: true,
      onAnswer: async () => { throw new Error("Submitted question cannot be answered again"); },
    }))}
    {pending ? card(pendingIdentity!, { question: pending, draftScope,
      deliveryVersion: revision, disabled,
      onAnswer: reply => {
        if (current.current !== pendingIdentity) throw new Error("This question changed. Reopen its current answer.");
        return onCommand({ type: "answer", sessionId: scope.sessionId, runId, requestId: pending.requestId, reply });
      },
    }) : null}
  </>;
}
