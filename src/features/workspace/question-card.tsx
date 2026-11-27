import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useFormDraft } from "@/state/form-draft";
import { RemoteHostError } from "@/remote/host-error";
import { space } from "@/ui/tokens";
import {
  Badge,
  StatusText,
  Body,
  Button,
  Card,
  Disclosure,
  Field,
  ErrorText,
} from "@/ui/primitives";
import { Questionnaire } from "panelui-native/components/questionnaire";
import { useCopy } from "@/ui/copy";
import type { QuestionCardProps, QuestionDraft } from "./session-types";
import {
  questionDismissLabel,
  questionNeedsAttention,
  questionStatusLabel,
  questionSubmissionHeld,
} from "./question-status";
import { questionCardIdentity, questionCardStates } from "./question-card-state";
import {
  buildReply,
  fromQuestionnaireAnswer,
  noteApplies,
  questionComplete,
  toQuestionnaireAnswers,
  isCustomChoice,
  updateCustomAnswer,
} from "./question-card-model";

const RETAINED = Symbol("retained");
type LocalDelivery = {
  value: NonNullable<QuestionCardProps["question"]["delivery"]>;
  base: QuestionCardProps["question"]["delivery"] | typeof RETAINED;
  version?: number;
  error?: unknown;
};

export function QuestionCard(props: QuestionCardProps) {
  return <QuestionCardOwner key={questionCardIdentity(props.draftScope, props.question)} {...props} />;
}

function QuestionCardOwner({
  question,
  draftScope,
  deliveryVersion,
  disabled,
  onAnswer,
  initialDraft,
  onDraftChange,
  onDraftFlush,
  attachmentControls,
  attachments,
  attachmentBusy,
  submitAnswer,
}: QuestionCardProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [retained] = useState(() => questionCardStates.read(draftScope, question));
  const form = useFormDraft<QuestionDraft>(() => initialDraft ?? retained?.draft ?? { answers: {}, custom: {} });
  const draft = { ...form.values, ...(attachments ? { attachments } : {}) };
  const { answers, custom, notes = {} } = form.values;
  const [activeItem, setActiveItem] = useState(question.questions[0]?.id);
  const submitting = useRef(
    !!retained?.delivery && questionSubmissionHeld({ ...question, delivery: retained.delivery }),
  );
  // A local latch belongs to the authoritative delivery it was set under. Once the host
  // reports a different delivery (or a new revision) the host value wins again.
  const [local, setLocal] = useState<LocalDelivery | undefined>(
    retained?.delivery ? { value: retained.delivery, base: RETAINED, error: retained.error } : undefined,
  );
  const superseded =
    !!local &&
    !!question.delivery &&
    !(local.base === question.delivery && local.version === deliveryVersion);
  if (superseded) setLocal(undefined);
  const localDelivery = local && !superseded ? local.value : undefined;
  const setLocalDelivery = (value: NonNullable<QuestionCardProps["question"]["delivery"]>, error?: unknown) =>
    setLocal({ value, base: question.delivery, version: deliveryVersion, error });
  // Only an authoritative failed delivery permits another attempt.
  useEffect(() => {
    if (question.delivery === "failed") submitting.current = false;
  }, [question.delivery, deliveryVersion]);
  // Retain the editor and local delivery across navigation for this exact occurrence.
  useEffect(() => {
    questionCardStates.write(draftScope, question, {
      draft: form.values,
      delivery: localDelivery ?? (question.delivery === "failed" ? undefined : question.delivery),
      error: local && !superseded ? local.error : undefined,
    });
  }, [draftScope, question, form.values, localDelivery, local, superseded]);
  // The attachment custody owner persists text alongside files for process restart.
  useEffect(() => { onDraftChange?.(form.values); }, [onDraftChange, form.values]);
  const current = localDelivery ? { ...question, delivery: localDelivery } : question;
  // A host command receipt is not provider delivery. Keep the latch until the
  // authoritative question resolves or explicitly reports an undelivered failure.
  const held = disabled || !!attachmentBusy || questionSubmissionHeld(current);
  const submit: QuestionCardProps["onAnswer"] = async (reply) => {
    if (held || submitting.current) return;
    submitting.current = true;
    setLocalDelivery("sending");
    questionCardStates.write(draftScope, question, { draft: form.values, delivery: "sending" });
    try {
      if (submitAnswer) await submitAnswer(reply, draft);
      else await onAnswer(reply);
    } catch (cause) {
      const delivery = cause instanceof RemoteHostError && !cause.uncertain ? "failed" : "unknown";
      if (delivery === "failed") submitting.current = false;
      setLocalDelivery(delivery, cause);
      questionCardStates.write(draftScope, question, { draft: form.values, delivery, error: cause });
    }
  };
  const complete = question.questions.length > 0 && question.questions.every((item) => questionComplete(item, draft));
  const currentItem = question.questions.find((item) => item.id === activeItem);
  const answer = () => {
    if (!complete) return;
    void submit(buildReply(question.questions, draft));
  };
  const customField = (item: QuestionCardProps["question"]["questions"][number]) => (
    <Field
      label={item.options.length ? copy("Kendi yanıtın", "Your own answer") : copy("Yanıtın", "Your answer")}
      value={custom[item.id] ?? ""}
      editable={!held}
      onChangeText={(text) =>
        !held && form.patch((current) => updateCustomAnswer(item, current, text))
      }
      onBlur={onDraftFlush}
      multiline
    />
  );

  return (
    <Card
      variant="surface"
      style={{
        // The shared surface owns padding, radius and fill; a one-pixel edge turns warm while it
        // needs an answer.
        borderWidth: 1,
        borderColor: questionNeedsAttention(current) ? colors.warning : colors.border,
      }}
    >
      <View style={uiStyles.stack}>
        {questionNeedsAttention(current)
          ? <Badge label={questionStatusLabel(current, copy)} tone="warning" />
          : <StatusText label={questionStatusLabel(current, copy)} />}
        {current.error ? (
          <View accessibilityRole="alert" style={{ gap: space.xxs }}>
            {current.delivery !== "unknown" && current.delivery !== "failed" ? (
              <Body>{copy("Yanıt teslim edilemedi.", "The answer could not be delivered.")}</Body>
            ) : null}
            <Disclosure label={copy("Teknik ayrıntılar", "Technical details")}>
              <Body mono selectable>{current.error}</Body>
            </Disclosure>
          </View>
        ) : null}
        <ErrorText error={local && !superseded ? local.error : undefined} />
        {current.delivery === "unknown" ? (
          <Body muted>
            {copy(
              "Yeniden denemeden önce oturumu kontrol et.",
              "Check the session before trying again.",
            )}
          </Body>
        ) : null}
        <Questionnaire
          frame={false}
          swipeable={false}
          item={activeItem}
          onItemChange={setActiveItem}
          answers={toQuestionnaireAnswers(question.questions, draft)}
          onAnswersChange={(next) => {
            if (held) return;
            form.patch((current) => {
              const nextAnswers = { ...current.answers };
              for (const item of question.questions) {
                const ids = fromQuestionnaireAnswer(next[item.id]);
                if (ids.join("\u0000") !== (nextAnswers[item.id] ?? []).join("\u0000"))
                  nextAnswers[item.id] = ids;
              }
              return { answers: nextAnswers };
            });
          }}
        >
          {question.questions.length > 1 ? (
            <Questionnaire.Progress variant="count">
              {({ current: position, total }) =>
                copy("Soru {p0} / {p1}", "Question {p0} of {p1}", { p0: position, p1: total })}
            </Questionnaire.Progress>
          ) : null}
          {question.questions.map((item) => (
            <Questionnaire.Item
              key={item.id}
              name={item.id}
              required
              multiple={!!item.multiSelect}
              invalid={(answers[item.id] ?? []).some((id) => isCustomChoice(item, id)) && !questionComplete(item, draft)}
            >
              <Questionnaire.Question>{item.prompt}</Questionnaire.Question>
              {item.options.length ? (
                <Questionnaire.Choices>
                  {item.options.map((option) => (
                    <Questionnaire.Choice
                      className="min-h-12"
                      key={option.id}
                      value={option.id}
                      label={option.label}
                      description={option.description}
                      disabled={held}
                    />
                  ))}
                </Questionnaire.Choices>
              ) : null}
              {item.allowCustom ? (
                !item.options.length || answers[item.id]?.some((id) => isCustomChoice(item, id)) ? (
                  customField(item)
                ) : item.options.some((option) => isCustomChoice(item, option.id)) ? null : (
                  <Disclosure
                    label={copy("Kendi yanıtın", "Your own answer")}
                    defaultExpanded={!!custom[item.id]}
                  >
                    {customField(item)}
                  </Disclosure>
                )
              ) : null}
              {attachmentControls?.(item.id, held)}
              {noteApplies(item, form.values) ? (
                <Field
                  label={copy("Ek not (isteğe bağlı)", "Additional note (optional)")}
                  value={notes[item.id] ?? ""}
                  editable={!held}
                  onChangeText={(text) =>
                    !held && form.patch((current) => ({ notes: { ...current.notes, [item.id]: text } }))
                  }
                  onBlur={onDraftFlush}
                  multiline
                />
              ) : null}
            </Questionnaire.Item>
          ))}
          <Questionnaire.Footer style={{ flexWrap: "wrap", gap: space.xs }}>
            <Questionnaire.Back disabled={held}>{copy("Geri", "Back")}</Questionnaire.Back>
            <Questionnaire.Spacer />
            <Button
              label={questionDismissLabel(question, copy)}
              disabled={held}
              tone="quiet"
              density="compact"
              onPress={() => {
                void submit({ kind: "skipped" });
              }}
            />
            <Questionnaire.Next disabled={held || !currentItem || !questionComplete(currentItem, draft)}>{copy("Devam", "Continue")}</Questionnaire.Next>
            <Questionnaire.Submit
              disabled={held || !complete}
              loading={current.delivery === "sending"}
              onPress={answer}
            >
              {copy("Yanıtı gönder", "Send answer")}
            </Questionnaire.Submit>
          </Questionnaire.Footer>
        </Questionnaire>
      </View>
    </Card>
  );
}
