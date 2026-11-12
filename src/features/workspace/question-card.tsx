import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useFormDraft } from "@/state/form-draft";
import {
  Badge,
  Body,
  Button,
  Card,
  Disclosure,
  Field,
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
import { questionCardStates } from "./question-card-state";
import {
  CUSTOM_OPTION,
  buildReply,
  fromQuestionnaireAnswer,
  noteApplies,
  questionComplete,
  toQuestionnaireAnswers,
} from "./question-card-model";

const RETAINED = Symbol("retained");
type LocalDelivery = {
  value: NonNullable<QuestionCardProps["question"]["delivery"]>;
  base: QuestionCardProps["question"]["delivery"] | typeof RETAINED;
  version?: number;
};

export function QuestionCard({
  question,
  draftScope,
  deliveryVersion,
  disabled,
  onAnswer,
}: QuestionCardProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [retained] = useState(() => questionCardStates.read(draftScope, question));
  const form = useFormDraft<QuestionDraft>(() => retained?.draft ?? { answers: {}, custom: {} });
  const { answers, custom, notes = {} } = form.values;
  const submitting = useRef(
    !!retained?.delivery && questionSubmissionHeld({ ...question, delivery: retained.delivery }),
  );
  // A local latch belongs to the authoritative delivery it was set under. Once the host
  // reports a different delivery (or a new revision) the host value wins again.
  const [local, setLocal] = useState<LocalDelivery | undefined>(
    retained?.delivery ? { value: retained.delivery, base: RETAINED } : undefined,
  );
  const superseded =
    !!local &&
    !!question.delivery &&
    !(local.base === question.delivery && local.version === deliveryVersion);
  if (superseded) setLocal(undefined);
  const localDelivery = local && !superseded ? local.value : undefined;
  const setLocalDelivery = (value: NonNullable<QuestionCardProps["question"]["delivery"]>) =>
    setLocal({ value, base: question.delivery, version: deliveryVersion });
  useEffect(() => {
    if (question.delivery === "failed") submitting.current = false;
  }, [question.delivery, deliveryVersion]);
  useEffect(() => {
    questionCardStates.write(draftScope, question, {
      draft: form.values,
      delivery: localDelivery ?? (question.delivery === "failed" ? undefined : question.delivery),
    });
  }, [draftScope, question, form.values, localDelivery]);
  const current = localDelivery ? { ...question, delivery: localDelivery } : question;
  // A host command receipt is not provider delivery. Keep the latch until the
  // authoritative question resolves or explicitly reports an undelivered failure.
  const held = disabled || questionSubmissionHeld(current);
  const submit: QuestionCardProps["onAnswer"] = async (reply) => {
    if (held || submitting.current) return;
    submitting.current = true;
    setLocalDelivery("sending");
    questionCardStates.write(draftScope, question, { draft: form.values, delivery: "sending" });
    try {
      await onAnswer(reply);
    } catch {
      setLocalDelivery("unknown");
      questionCardStates.write(draftScope, question, { draft: form.values, delivery: "unknown" });
    }
  };
  const complete = question.questions.every((item) => questionComplete(item, form.values));
  const answer = () => {
    void submit(buildReply(question.questions, form.values));
  };
  const customField = (item: QuestionCardProps["question"]["questions"][number]) => (
    <Field
      label={item.options.length ? copy("Kendi yanıtın", "Your own answer") : copy("Yanıtın", "Your answer")}
      value={custom[item.id] ?? ""}
      editable={!held}
      onChangeText={(text) =>
        form.patch((current) => ({ custom: { ...current.custom, [item.id]: text } }))
      }
      multiline
    />
  );

  return (
    <Card
      style={{
        backgroundColor: colors.panel,
        // Prominent without a heavy box: a one-pixel edge that turns warm while it needs an answer.
        borderWidth: 1,
        borderColor: questionNeedsAttention(current) ? colors.warning : colors.border,
      }}
    >
      <View style={uiStyles.stack}>
        <Badge
          label={questionStatusLabel(current, copy)}
          tone={questionNeedsAttention(current) ? "warning" : "default"}
        />
        {current.error ? <Body accessibilityRole="alert">{current.error}</Body> : null}
        {current.delivery === "unknown" ? (
          <Body muted>
            {copy(
              "Yeniden denemeden önce konuşmayı kontrol et.",
              "Check the conversation before trying again.",
            )}
          </Body>
        ) : null}
        <Questionnaire
          frame={false}
          swipeable={false}
          answers={toQuestionnaireAnswers(question.questions, form.values)}
          onAnswersChange={(next) =>
            form.patch((current) => {
              const nextAnswers = { ...current.answers };
              for (const item of question.questions) {
                const ids = fromQuestionnaireAnswer(next[item.id]);
                if (ids.join("\u0000") !== (nextAnswers[item.id] ?? []).join("\u0000"))
                  nextAnswers[item.id] = ids;
              }
              return { answers: nextAnswers };
            })
          }
        >
          {question.questions.length > 1 ? <Questionnaire.Progress variant="count" /> : null}
          {question.questions.map((item) => (
            <Questionnaire.Item
              key={item.id}
              name={item.id}
              required
              multiple={!!item.multiSelect}
              invalid={(answers[item.id] ?? []).includes(CUSTOM_OPTION) && !custom[item.id]?.trim()}
            >
              <Questionnaire.Question>{item.prompt}</Questionnaire.Question>
              {item.options.length ? (
                <Questionnaire.Choices>
                  {item.options.map((option) => (
                    <Questionnaire.Choice
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
                !item.options.length || answers[item.id]?.includes(CUSTOM_OPTION) ? (
                  customField(item)
                ) : (
                  <Disclosure
                    label={copy("Kendi yanıtın", "Your own answer")}
                    defaultExpanded={!!custom[item.id]}
                  >
                    {customField(item)}
                  </Disclosure>
                )
              ) : null}
              {noteApplies(item, form.values) ? (
                <Field
                  label={copy("Ek not (isteğe bağlı)", "Additional note (optional)")}
                  value={notes[item.id] ?? ""}
                  editable={!held}
                  onChangeText={(text) =>
                    form.patch((current) => ({ notes: { ...current.notes, [item.id]: text } }))
                  }
                  multiline
                />
              ) : null}
            </Questionnaire.Item>
          ))}
          <Questionnaire.Footer>
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
            <Questionnaire.Next disabled={held}>{copy("Devam", "Continue")}</Questionnaire.Next>
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
