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
  MultiSelectField,
  SelectField,
  Row,
} from "@/ui/primitives";
import { colors } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { workspaceStyles } from "./shared";
import type { QuestionCardProps, QuestionDraft } from "./session-types";
import {
  questionDismissLabel,
  questionNeedsAttention,
  questionStatusLabel,
  questionSubmissionHeld,
} from "./question-status";
import { questionCardStates } from "./question-card-state";

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
  useMobileTheme();
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
  const complete = question.questions.every((item) => {
    const selected = answers[item.id] ?? [];
    const text = item.preserveCustomWhitespace ? custom[item.id] : custom[item.id]?.trim();
    if (selected.includes("__custom__") && !text) return false;
    return (
      (selected.length > 0 && (item.multiSelect || selected.length === 1)) ||
      (item.allowCustom && !!text)
    );
  });

  const answer = () => {
    const normalized: Record<string, string> = {};
    const normalizedNotes: Record<string, string> = {};
    for (const item of question.questions) {
      const text = item.preserveCustomWhitespace ? custom[item.id] : custom[item.id]?.trim();
      if (text) normalized[item.id] = text;
      const note = notes[item.id]?.trim();
      if (
        note &&
        item.allowCustom &&
        !item.preserveCustomWhitespace &&
        item.options.some(
          (option) =>
            option.id !== "__custom__" &&
            (option.literal === true || !/^other$/i.test(option.label.trim())) &&
            answers[item.id]?.includes(option.id),
        )
      )
        normalizedNotes[item.id] = note;
    }
    void submit({
      kind: "answered",
      answers,
      custom: normalized,
      ...(Object.keys(normalizedNotes).length ? { notes: normalizedNotes } : {}),
    });
  };
  const customField = (item: QuestionCardProps["question"]["questions"][number]) => (
    <Field
      label={item.options.length ? copy("Kendi yanıtın", "Your own answer") : item.prompt}
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
        borderWidth: 0,
      }}
    >
      <View style={workspaceStyles.stack}>
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
        {question.questions.map((item) => (
          <View key={item.id} style={workspaceStyles.stack}>
            {item.options.length || !item.allowCustom ? (
              item.multiSelect ? (
                <MultiSelectField
                  label={item.prompt}
                  values={answers[item.id] ?? []}
                  disabled={held}
                  options={item.options.map((option) => ({
                    value: option.id,
                    label: option.label,
                    detail: option.description,
                  }))}
                  onChange={(next) =>
                    form.patch((current) => ({ answers: { ...current.answers, [item.id]: next } }))
                  }
                />
              ) : (
                <SelectField
                  label={item.prompt}
                  value={answers[item.id]?.[0]}
                  disabled={held}
                  options={item.options.map((option) => ({
                    value: option.id,
                    label: option.label,
                    detail: option.description,
                  }))}
                  onChange={(next) =>
                    form.patch((current) => ({
                      answers: { ...current.answers, [item.id]: [next] },
                    }))
                  }
                />
              )
            ) : null}
            {item.allowCustom ? (
              !item.options.length || answers[item.id]?.includes("__custom__") ? (
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
            {item.allowCustom &&
            !item.preserveCustomWhitespace &&
            item.options.some(
              (option) =>
                option.id !== "__custom__" &&
                (option.literal === true || !/^other$/i.test(option.label.trim())) &&
                answers[item.id]?.includes(option.id),
            ) ? (
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
          </View>
        ))}
        <Row style={{ justifyContent: "flex-end" }}>
          <Button
            label={questionDismissLabel(question, copy)}
            disabled={held}
            tone="quiet"
            density="compact"
            onPress={() => {
              void submit({ kind: "skipped" });
            }}
          />
          <Button
            label={copy("Yanıtı gönder", "Send answer")}
            tone="primary"
            disabled={held || !complete}
            busy={current.delivery === "sending"}
            density="compact"
            onPress={answer}
          />
        </Row>
      </View>
    </Card>
  );
}
