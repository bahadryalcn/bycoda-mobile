import { View } from "react-native";
import { useFormDraft } from "@/state/form-draft";
import { Badge, Button, Card, Field, MultiSelectField, SelectField, Row } from "@/ui/primitives";
import { semanticColors } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { workspaceStyles } from "./shared";
import type { QuestionCardProps, QuestionDraft } from "./session-types";

export function QuestionCard({ question, disabled, onAnswer }: QuestionCardProps) {
  const copy = useCopy();
  const form = useFormDraft<QuestionDraft>({ answers: {}, custom: {} });
  const { answers, custom } = form.values;
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
    for (const item of question.questions) {
      const text = item.preserveCustomWhitespace ? custom[item.id] : custom[item.id]?.trim();
      if (text) normalized[item.id] = text;
    }
    void onAnswer({ kind: "answered", answers, custom: normalized }).catch(() => {});
  };

  return (
    <Card
      style={{
        backgroundColor: semanticColors.warning.surface,
        borderColor: semanticColors.warning.border,
      }}
    >
      <View style={workspaceStyles.stack}>
        <Badge label={copy("Yanıtın bekleniyor", "Waiting for your answer")} tone="warning" />
        {question.questions.map((item) => (
          <View key={item.id} style={workspaceStyles.stack}>
            {item.multiSelect ? (
              <MultiSelectField
                label={item.prompt}
                values={answers[item.id] ?? []}
                disabled={disabled}
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
                disabled={disabled}
                options={item.options.map((option) => ({
                  value: option.id,
                  label: option.label,
                  detail: option.description,
                }))}
                onChange={(next) =>
                  form.patch((current) => ({ answers: { ...current.answers, [item.id]: [next] } }))
                }
              />
            )}
            {item.allowCustom ? (
              <Field
                label={copy("Kendi yanıtın", "Your own answer")}
                value={custom[item.id] ?? ""}
                onChangeText={(text) =>
                  form.patch((current) => ({
                    custom: { ...current.custom, [item.id]: text },
                  }))
                }
                multiline
              />
            ) : null}
          </View>
        ))}
        <Row>
          <Button
            label={copy("Yanıtla", "Answer")}
            tone="primary"
            disabled={disabled || !complete}
            onPress={answer}
          />
          <Button
            label={copy("Atla", "Skip")}
            disabled={disabled}
            onPress={() => {
              void onAnswer({ kind: "skipped" }).catch(() => {});
            }}
          />
        </Row>
      </View>
    </Card>
  );
}
