import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHostClient } from "@/state/queries";
import { Body, Card, ErrorText, Field, FormActions, Sheet, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { askSideQuestion } from "./side-chat-client";
import { canAskSideQuestion, normalizeQuestion, SIDE_CHAT_MAX_QUESTION, type SideChatMessage } from "./side-chat-model";

/** A read-only question about this session. The answer never reaches the session or its agent. */
export function SideChatSheet({ visible, sessionId, onClose }: { visible: boolean; sessionId: string; onClose: () => void }) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Yan soru", "Side question")} size="full" onClose={onClose}>
      {visible ? <SideChatBody key={sessionId} sessionId={sessionId} /> : null}
    </Sheet>
  );
}

function SideChatBody({ sessionId }: { sessionId: string }) {
  const copy = useCopy();
  const client = useHostClient();
  const [messages, setMessages] = useState<SideChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null);
  // Closing the sheet abandons a pending answer so it cannot land in a thread nobody sees.
  useEffect(() => () => controller.current?.abort(), []);

  const send = async () => {
    const question = normalizeQuestion(draft);
    if (!client || !canAskSideQuestion(draft, busy)) return;
    const asked: SideChatMessage = { id: `u${messages.length}`, role: "user", text: question };
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    try {
      const answer = await askSideQuestion(client, { sessionId, question, history: messages }, abort.signal);
      if (abort.signal.aborted) return;
      setMessages((current) => [...current, asked, { id: `a${current.length}`, role: "assistant", text: answer }]);
      setDraft("");
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
          {copy("Oturumu etkilemeden, yalnızca okuma amaçlı sorulur.", "Asked read-only; the session is not affected.")}
        </Body>
        {messages.map((message) => (
          <Card key={message.id}>
            <View style={{ gap: space.xs }}>
              <Body muted>{message.role === "user" ? copy("Sen", "You") : copy("Agent", "Agent")}</Body>
              <Body selectable>{message.text}</Body>
            </View>
          </Card>
        ))}
        <Field
          label={copy("Sorun", "Your question")}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={SIDE_CHAT_MAX_QUESTION}
          editable={!busy}
        />
        <ErrorText error={error} />
      </Stack>
      <FormActions
        submitLabel={copy("Sor", "Ask")}
        onSubmit={() => void send()}
        disabled={!client || !canAskSideQuestion(draft, busy)}
        busy={busy}
      />
    </>
  );
}
