import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useCopy } from "@/ui/copy";
import { Body, Button, ErrorNotice, Field, NavigationGroup, NavigationRow, Notice, Row, SectionHeader, Separator } from "@/ui/primitives";
import { SelectionMark } from "@/ui/selection-mark";
import { space } from "@/ui/tokens";
import type { AssistantOwnerQuestion } from "../../../../src/shared/model/assistantOwnerQuestions";
import type { AssistantMobileClient, AssistantQuestionIntent } from "./assistant-client";
import {
  buildAnswerIntent,
  buildSnoozeIntent,
  emptyQuestionSelection,
  questionAnswerReady,
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
    <View style={{ gap: space.sm }}>
      <SectionHeader title={copy("Seni bekleyen sorular", "Questions waiting for you")} count={questions.length} />
      {questions.map((question, index) => (
        <View key={questionIntentKey(machineId, environmentId, question)} style={{ gap: space.md }}>
        {index ? <Separator /> : null}
        <QuestionCard
          client={client}
          question={question}
          storageKey={questionIntentKey(machineId, environmentId, question)}
          current={current}
          enabled={enabled}
          onChanged={onChanged}
        />
        </View>
      ))}
    </View>
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
  const answerable = questionAnswerReady(question, selection);
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
          {/* Choice rows: a check for one answer, a box per option when several can be chosen. */}
          <NavigationGroup>
            {item.options.map((option) => {
              const chosen = (selection.answers[item.id] ?? []).includes(option.id);
              return (
                <NavigationRow
                  key={option.id}
                  intent="select"
                  label={option.label}
                  detail={option.description || undefined}
                  selected={chosen}
                  tintSelected={false}
                  icon={item.multiSelect ? <SelectionMark selected={chosen} multiple /> : undefined}
                  trailing={item.multiSelect ? undefined : <SelectionMark selected={chosen} />}
                  disabled={locked || unconfirmed}
                  onPress={() => setSelection(toggleQuestionOption(selection, item, option.id))}
                />
              );
            })}
          </NavigationGroup>
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
            {/* One primary action per screen: each card's Send is a secondary button, enabled once every question is answered. */}
            <Button
              label={copy("Yanıtı gönder", "Send answer")}
              busy={busy === "answer"}
              disabled={locked || !answerable}
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
