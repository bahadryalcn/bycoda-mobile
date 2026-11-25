import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHostClient } from "@/state/queries";
import { useLocalDraft } from "@/features/workspace/use-local-draft";
import { RecordAccessUnavailable } from "@/features/workspace/unavailable-state";
import { Body, Card, ErrorText, Field, FormActions, Sheet, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { askSideQuestion } from "./side-chat-client";
import {
  canAskSideQuestion,
  decodeSideChatThread,
  emptySideChatThread,
  encodeSideChatThread,
  normalizeQuestion,
  SIDE_CHAT_MAX_QUESTION,
  sideChatKey,
  sideChatOutOfContextCount,
  type SideChatMessage,
  type SideChatThread,
} from "./side-chat-model";

type HostClient = NonNullable<ReturnType<typeof useHostClient>>;

/** A read-only question about this session. The answer never reaches the session or its agent. */
export function SideChatSheet({ visible, sessionId, onClose }: { visible: boolean; sessionId: string; onClose: () => void }) {
  const copy = useCopy();
  const client = useHostClient();
  return (
    <Sheet visible={visible} title={copy("Yan soru", "Side question")} size="full" onClose={onClose}>
      {visible ? (client
        ? <SideChatBody key={sideChatKey(client.machine.id, sessionId)} client={client} sessionId={sessionId} />
        : <RecordAccessUnavailable />) : null}
    </Sheet>
  );
}

/**
 * Mounted only while the sheet is open. The thread and its draft live in the saved-draft owner,
 * so closing the sheet keeps them; closing still abandons a pending answer, and its question stays in the draft.
 */
function SideChatBody({ client, sessionId }: { client: HostClient; sessionId: string }) {
  const copy = useCopy();
  const thread = useLocalDraft<SideChatThread>(sideChatKey(client.machine.id, sessionId), decodeSideChatThread, encodeSideChatThread);
  const { messages, draft } = thread.value ?? emptySideChatThread();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null);
  // Closing the sheet abandons a pending answer so it cannot land in a thread nobody sees.
  useEffect(() => () => controller.current?.abort(), []);
  const outOfContext = sideChatOutOfContextCount(messages);

  const setDraft = (text: string) => thread.setValue((current) => ({ ...(current ?? emptySideChatThread()), draft: text }));

  const send = async () => {
    const question = normalizeQuestion(draft);
    if (!thread.ready || !canAskSideQuestion(draft, busy)) return;
    const asked: SideChatMessage = { id: `u${messages.length}`, role: "user", text: question };
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    try {
      const answer = await askSideQuestion(client, { sessionId, question, history: messages }, abort.signal);
      if (abort.signal.aborted) return;
      thread.setValue((current) => {
        const saved = current ?? emptySideChatThread();
        return { messages: [...saved.messages, asked, { id: `a${saved.messages.length}`, role: "assistant", text: answer }], draft: "" };
      });
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure);
    } finally {
      if (controller.current === abort) controller.current = null;
      setBusy(false);
    }
  };

  return (
    <>
      <Stack style={{ gap: space.md }}>
        <Body muted>
          {copy("Bu soru yalnızca burada görünür.", "Asked read-only; the session is not affected.")}
        </Body>
        {messages.map((message, index) => (
          <Card key={message.id}>
            <View style={{ gap: space.xs }}>
              <Body muted>{message.role === "user" ? copy("Sen", "You") : copy("Ajan", "Agent")}</Body>
              {index < outOfContext ? (
                <Body muted>{copy("Ajan artık bu mesajı görmüyor", "No longer in the agent's context")}</Body>
              ) : null}
              <Body selectable>{message.text}</Body>
            </View>
          </Card>
        ))}
        <Field
          label={copy("Sorunuzu yazın", "Your question")}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={SIDE_CHAT_MAX_QUESTION}
          editable={!busy && thread.ready}
        />
        <ErrorText error={error ?? thread.error} />
      </Stack>
      <FormActions
        submitLabel={copy("Sor", "Ask")}
        onSubmit={() => void send()}
        disabled={!thread.ready || !canAskSideQuestion(draft, busy)}
        busy={busy}
      />
    </>
  );
}
