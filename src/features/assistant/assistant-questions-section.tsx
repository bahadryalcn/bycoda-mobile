import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useCopy } from "@/ui/copy";
import { Body, Button, ErrorNotice, Field, Notice, Row, Section } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { AssistantOwnerQuestion } from "../../../../src/shared/model/assistantOwnerQuestions";
import type { AssistantMobileClient, AssistantQuestionIntent } from "./assistant-client";
import {
  buildAnswerIntent,
  buildSnoozeIntent,
  emptyQuestionSelection,
  questionIntentKey,
  readQuestionIntent,
  toggleQuestionOption,
  writeQuestionIntent,
  type QuestionSelection,
} from "./assistant-question";

/** Unsent choices survive leaving the screen for the rest of the app session. */
const selections = new Map<string, QuestionSelection>();

export function AssistantQuestionsSection({
  client,
  questions,
  machineId,
  environmentId,
  current,
  enabled,
  onChanged,
}: {
  client: AssistantMobileClient;
  questions: AssistantOwnerQuestion[];
  machineId: string;
  environmentId: string;
  current(): boolean;
  enabled: boolean;
  onChanged(): Promise<unknown>;
}) {
  const copy = useCopy();
  if (!questions.length) return null;
  return (
    <Section title={copy("Seni bekleyen sorular", "Questions waiting for you")}>
      {questions.map((question) => (
        <QuestionCard
          key={questionIntentKey(machineId, environmentId, question)}
          client={client}
          question={question}
          storageKey={questionIntentKey(machineId, environmentId, question)}
          current={current}
          enabled={enabled}
          onChanged={onChanged}
        />
      ))}
    </Section>
  );
}

function QuestionCard({
  client,
  question,
  storageKey,
  current,
  enabled,
  onChanged,
}: {
  client: AssistantMobileClient;
  question: AssistantOwnerQuestion;
  storageKey: string;
  current(): boolean;
  enabled: boolean;
  onChanged(): Promise<unknown>;
}) {
  const copy = useCopy();
  const pending = useRef(false);
  const [selection, setSelectionState] = useState(
    () => selections.get(storageKey) ?? emptyQuestionSelection(),
  );
  const [intent, setIntent] = useState<AssistantQuestionIntent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"answer" | "snooze" | "check" | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    readQuestionIntent(AsyncStorage, storageKey, question)
      .then((saved) => live && setIntent(saved))
      .catch((cause) => live && setError(cause))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
    // The saved intent belongs to this exact question version.
  }, [storageKey]);
  const setSelection = (next: QuestionSelection) => {
    selections.set(storageKey, next);
    setSelectionState(next);
  };
  const deliver = async (kind: "answer" | "snooze" | "check", build: () => AssistantQuestionIntent) => {
    if (pending.current || !current() || !enabled) return;
    pending.current = true;
    setBusy(kind);
    setError(null);
    try {
      const next = build();
      if (kind !== "check") {
        // Saved before dispatch so a lost reply is checked, never repeated under a new ID.
        await writeQuestionIntent(AsyncStorage, storageKey, next);
        if (current()) setIntent(next);
      }
      await client.deliverQuestion(question, next);
      await AsyncStorage.removeItem(storageKey).catch(() => {});
      selections.delete(storageKey);
      if (current()) setIntent(null);
    } catch (cause) {
      if (current()) setError(cause);
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
      await onChanged().catch(() => {});
    }
  };
  const locked = !enabled || !loaded || busy !== null;
  const unconfirmed = intent !== null;
  return (
    <View style={{ gap: space.sm }}>
      {question.prompt.title ? <Body>{question.prompt.title}</Body> : null}
      {question.status === "snoozed" ? (
        <Body muted>{copy("Ertelendi", "Postponed")}</Body>
      ) : null}
      {question.prompt.questions.map((item) => (
        <View key={item.id} style={{ gap: space.xs }}>
          {item.header ? <Body muted>{item.header}</Body> : null}
          <Body>{item.prompt}</Body>
          {item.options.map((option) => {
            const chosen = (selection.answers[item.id] ?? []).includes(option.id);
            return (
              <View key={option.id} style={{ gap: space.xxs }}>
                <Button
                  label={option.label}
                  selected={chosen}
                  disabled={locked || unconfirmed}
                  onPress={() => setSelection(toggleQuestionOption(selection, item, option.id))}
                />
                {option.description ? <Body muted>{option.description}</Body> : null}
              </View>
            );
          })}
          {item.allowCustom ? (
            <Field
              label={copy("Kendi yanıtın", "Your own answer")}
              value={selection.custom[item.id] ?? ""}
              editable={!locked && !unconfirmed}
              multiline
              maxLength={2000}
              onChangeText={(text) =>
                setSelection({
                  answers: item.multiSelect
                    ? selection.answers
                    : { ...selection.answers, [item.id]: text.trim() ? [] : selection.answers[item.id] ?? [] },
                  custom: { ...selection.custom, [item.id]: text },
                })
              }
            />
          ) : null}
        </View>
      ))}
      {unconfirmed ? (
        <Notice
          tone="warning"
          message={copy(
            "Bu işlemin sonucu doğrulanamadı. Aynı istek yeniden gönderilmeden önce durumu kontrol et.",
            "The result of this action could not be confirmed. Check its status before the same request is sent again.",
          )}
        />
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      <Row>
        {unconfirmed ? (
          <Button
            label={copy("Durumu kontrol et", "Check status")}
            tone="primary"
            busy={busy === "check"}
            disabled={!enabled || busy !== null}
            onPress={() => void deliver("check", () => intent)}
          />
        ) : (
          <>
            <Button
              label={copy("Yanıtı gönder", "Send answer")}
              tone="primary"
              busy={busy === "answer"}
              disabled={locked}
              onPress={() =>
                void deliver("answer", () => buildAnswerIntent(question, selection, randomUUID()))
              }
            />
            <Button
              label={copy("Sonra", "Later")}
              busy={busy === "snooze"}
              disabled={locked}
              onPress={() =>
                void deliver("snooze", () => buildSnoozeIntent(question, randomUUID(), Date.now()))
              }
            />
          </>
        )}
      </Row>
    </View>
  );
}
