import { useRef, useState } from "react";
import { View } from "react-native";
import FileText from "lucide-react-native/icons/file-text";
import X from "lucide-react-native/icons/x";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import Check from "lucide-react-native/icons/check";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import { Attachment } from "panelui-native/components/attachment";
import { ChatMessage, ChatMessageContent, chatUserBubbleStyle } from "./chat";
import { ChatComposer } from "./chat-composer";
import { ChatActivity, ChatPlan } from "./chat-activity";
import { PlanSteps } from "./plan-steps";
import { MessageText } from "./message-text";
import { ChatCircleAction, ChatToolbarAction } from "./chat-controls";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { Button } from "./buttons";
import { Card, Row, Stack } from "./layout";
import { Body, Heading, CodeText } from "./typography";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Sheet } from "./dialogs";
import { Notice, Badge } from "./feedback";
import { colors } from "./tokens";
import { haptic } from "./motion";
import { useCopy } from "./copy";

type Mode = "send" | "queue" | "steer";

export function GalleryChat() {
  const copy = useCopy();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("send");
  const [modePicker, setModePicker] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [result, setResult] = useState("");
  const [attached, setAttached] = useState(true);
  const [preview, setPreview] = useState(false);
  const [queue, setQueue] = useState<{ id: number; text: string; file: boolean }[]>([]);
  const sequence = useRef(0);
  const modeOptions: { value: Mode; label: string }[] = [
    { value: "send", label: copy("Gönder", "Send") },
    { value: "queue", label: copy("Sıraya al", "Queue") },
    { value: "steer", label: copy("Yönlendir", "Steer") },
  ];
  const modeLabel = modeOptions.find((option) => option.value === mode)?.label ?? "";
  const sendDisabled = !prompt.trim();
  const submitSample = (text: string) => {
    const value = text.trim();
    if (!value) return;
    haptic.success();
    if (mode === "queue")
      setQueue((items) => [...items, { id: ++sequence.current, text: value, file: attached }]);
    else setResult(value);
    setPrompt("");
    setAttached(false);
  };
  return (
    <Stack>
      <Card>
        <Heading>{copy("Sohbet ve dosyalar", "Chat and files")}</Heading>
        <Badge label={copy("Çevrimdışı örnek", "Offline example")} />
        <ChatMessage role="user" style={chatUserBubbleStyle()}>
          <ChatMessageContent>
            <Body>{copy("Mobil konuşmayı sadeleştir.", "Simplify the mobile conversation.")}</Body>
          </ChatMessageContent>
        </ChatMessage>
        <ChatMessage role="assistant" style={{ backgroundColor: "transparent", padding: 0 }}>
          <ChatMessageContent>
            <Body>
              {copy(
                "Dosyaları konuşmadan açabilir ve sonraki mesajını sıraya alabilirsin.",
                "Open files from the conversation and queue your next message.",
              )}
            </Body>
          </ChatMessageContent>
        </ChatMessage>
        <Attachment
          className="border-0 bg-fill rounded-[16px]"
          onPress={() => setPreview(true)}
          accessibilityLabel={copy("Örnek dosyayı aç", "Open sample file")}
        >
          <Attachment.Media variant="icon">
            <FileText size={20} color={colors.muted} />
          </Attachment.Media>
          <Attachment.Content>
            <Attachment.Title>mobile-plan.md</Attachment.Title>
            <Attachment.Description>
              {copy("Örnek belge · açmak için dokun", "Sample document · tap to open")}
            </Attachment.Description>
          </Attachment.Content>
        </Attachment>
        <ChatActivity title={copy("Örnek gerekçe", "Sample rationale")} reasoning status="complete">
          <Body>
            {copy(
              "Mesajlar, dosyalar ve kuyruk aynı ortak bileşenlerle gösterilir.",
              "Messages, files and the queue use the same shared components.",
            )}
          </Body>
        </ChatActivity>
        <ChatActivity title={copy("Çalışma ayrıntıları", "Work details")} status="complete">
          <MessageText text={"```tsx\nconst ready = true;\n```"} />
        </ChatActivity>
        {queue.length ? (
          <View style={{ flexDirection: "row" }}>
            <ChatToolbarAction
              label={copy("{p0} sırada", "{p0} queued", { p0: queue.length })}
              onPress={() => setQueueOpen(true)}
            >
              <ListOrdered size={15} strokeWidth={2.2} color={colors.accent} />
            </ChatToolbarAction>
          </View>
        ) : null}
        {attached ? (
          <Attachment size="sm" className="border-0 bg-fill rounded-[14px]">
            <Attachment.Media variant="icon">
              <FileText size={18} color={colors.muted} />
            </Attachment.Media>
            <Attachment.Content>
              <Attachment.Title>mobile-plan.md</Attachment.Title>
            </Attachment.Content>
            <Attachment.Actions>
              <Attachment.Action
                accessibilityLabel={copy("Eki kaldır", "Remove attachment")}
                onPress={() => setAttached(false)}
              >
                <X size={18} color={colors.muted} />
              </Attachment.Action>
            </Attachment.Actions>
          </Attachment>
        ) : (
          <View style={{ flexDirection: "row" }}>
            <Button
              label={copy("Örnek dosya ekle", "Attach sample file")}
              tone="secondary"
              density="compact"
              onPress={() => setAttached(true)}
            />
          </View>
        )}
        <ChatComposer
          value={prompt}
          onValueChange={setPrompt}
          mode={
            <ChatToolbarAction
              label={modeLabel}
              onPress={() => setModePicker(true)}
            ><ChevronDown size={12} color={colors.muted} /></ChatToolbarAction>
          }
          leading={
            <ChatCircleAction
              label={copy("Dosya ekle", "Attach file")}
              onPress={() => setAttached(true)}
            >
              <Plus size={19} strokeWidth={2.4} color={colors.text} />
            </ChatCircleAction>
          }
          field={{
            accessibilityLabel: copy("Mesaj", "Message"),
            placeholder: copy("Bir mesaj yaz", "Write a message"),
          }}
          submit={
            <ChatCircleAction
              label={modeLabel}
              active={!sendDisabled}
              disabled={sendDisabled}
              onPress={() => submitSample(prompt)}
            >
              <ArrowUp
                size={20}
                strokeWidth={2.4}
                color={sendDisabled ? colors.muted : colors.primaryText}
              />
            </ChatCircleAction>
          }
        />
        {result ? (
          <Notice
            tone="success"
            message={copy("Örnekte işlendi: {p0}", "Handled in this sample: {p0}", { p0: result })}
          />
        ) : null}
      </Card>
      <ChatPlan title={copy("Örnek uygulama planı", "Sample implementation plan")} status="1 / 2">
        <PlanSteps
          steps={[
            {
              id: "shared",
              title: copy("Ortak bileşenleri kur", "Set up shared components"),
              status: "done",
            },
            {
              id: "device",
              title: copy("Konuşmayı cihazda doğrula", "Verify the conversation on a device"),
              status: "pending",
            },
          ]}
        />
      </ChatPlan>
      <Sheet
        visible={modePicker}
        title={copy("Gönderme biçimi", "Delivery mode")}
        size="compact"
        onClose={() => setModePicker(false)}
      >
        <NavigationGroup>
          {modeOptions.map((option) => (
            <NavigationRow
              key={option.value}
              label={option.label}
              trailing={
                option.value === mode ? (
                  <Check size={18} strokeWidth={2.4} color={colors.accent} />
                ) : undefined
              }
              onPress={() => {
                setMode(option.value);
                setModePicker(false);
              }}
            />
          ))}
        </NavigationGroup>
      </Sheet>
      <Sheet
        visible={queueOpen}
        title={copy("Mesaj sırası", "Message queue")}
        size="form"
        onClose={() => setQueueOpen(false)}
      >
        {queue.map((item) => (
          <Stack key={item.id}>
            <Body>{item.text}</Body>
            {item.file ? <CodeText>mobile-plan.md</CodeText> : null}
            <Row>
              <Button
                label={copy("Şimdi gönder", "Send now")}
                tone="secondary"
                onPress={() => {
                  setResult(item.text);
                  setQueue((items) => items.filter((entry) => entry.id !== item.id));
                }}
              />
              <Button
                label={copy("Kaldır", "Remove")}
                tone="quiet"
                onPress={() => setQueue((items) => items.filter((entry) => entry.id !== item.id))}
              />
            </Row>
          </Stack>
        ))}
      </Sheet>
      <Sheet visible={preview} title="mobile-plan.md" onClose={() => setPreview(false)}>
        <Heading>{copy("Örnek belge", "Sample document")}</Heading>
        <Body>
          {copy(
            "Konuşma, dosya önizleme, sıraya alma ve yönlendirme.",
            "Conversation, file preview, queuing and steering.",
          )}
        </Body>
        <Body muted>
          {copy(
            "Bu belge tur içindeki örnek içeriktir.",
            "This document is sample content within the tour.",
          )}
        </Body>
        <Button label={copy("Kapat", "Close")} onPress={() => setPreview(false)} />
      </Sheet>
    </Stack>
  );
}
