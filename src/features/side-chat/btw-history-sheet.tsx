import { View } from "react-native";
import { Body, Card, Disclosure, Sheet, Stack, StatusText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import type { BtwHistoryEntry } from "./btw-history-model";

/**
 * Saved side questions of this session (desktop BtwSheet threads), read-only. Each thread is one
 * disclosure titled by its first question; the newest starts open. Asking happens in Side question.
 */
export function BtwHistorySheet({
  visible,
  threads,
  onClose,
}: {
  visible: boolean;
  threads: readonly BtwHistoryEntry[];
  onClose: () => void;
}) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Yan sorular", "Side questions")} size="full" onClose={onClose}>
      {visible ? (
        <Stack style={{ gap: space.md }}>
          <Body muted>
            {copy(
              "Önceki turlar hakkında sorulmuş salt okunur sorular. Oturumu değiştirmediler.",
              "Read-only questions asked about earlier turns. They did not change the session.",
            )}
          </Body>
          {threads.map((thread, index) => (
            <Disclosure
              key={thread.id}
              label={thread.title || copy("Başlıksız", "Untitled")}
              detail={
                thread.status === "running"
                  ? copy("Çalışıyor", "Running")
                  : thread.status === "error"
                    ? copy("Başarısız", "Failed")
                    : undefined
              }
              tone={thread.status === "error" ? "danger" : undefined}
              defaultExpanded={index === threads.length - 1}
            >
              <View style={{ gap: space.sm }}>
                {thread.turnText ? (
                  <Body muted>{copy("Şu mesaj hakkında: {p0}", "About: {p0}", { p0: thread.turnText })}</Body>
                ) : null}
                {thread.messages.map((message) => (
                  <Card key={message.id}>
                    <View style={{ gap: space.xs }}>
                      <Body muted>{message.role === "user" ? copy("Sen", "You") : copy("Ajan", "Agent")}</Body>
                      <Body selectable>{message.text}</Body>
                    </View>
                  </Card>
                ))}
                {thread.status === "running" ? (
                  <StatusText label={copy("Bilgisayarda yanıtlanıyor", "Answering on the computer")} tone="live" />
                ) : thread.status === "error" ? (
                  <Body muted>{copy("Bu yan soru yanıtlanamadı.", "This side question could not be answered.")}</Body>
                ) : null}
              </View>
            </Disclosure>
          ))}
        </Stack>
      ) : null}
    </Sheet>
  );
}
