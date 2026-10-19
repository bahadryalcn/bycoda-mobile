import { useRef, useState } from "react";
import { View } from "react-native";
import FileText from "lucide-react-native/icons/file-text";
import X from "lucide-react-native/icons/x";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import Check from "lucide-react-native/icons/check";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import { Attachment } from "panelui-native/components/attachment";
import { Plan } from "panelui-native/components/plan";
import { Reasoning } from "panelui-native/components/reasoning";
import { ChatMessage, ChatMessageContent, ChatComposerSurface, chatUserBubbleStyle } from "./chat";
import { ChatCircleAction } from "./chat-controls";
import { Button } from "./buttons";
import { Card, Row, Stack } from "./layout";
import { Body, Heading, CodeText } from "./typography";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Input } from "./fields";
import { Sheet } from "./dialogs";
import { Notice, Badge } from "./feedback";
import { colors, radii, space } from "./tokens";
import { haptic, resize } from "./motion";
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
        <Reasoning>
          <Reasoning.Trigger
            label={() => <Body muted>{copy("Örnek gerekçe", "Sample rationale")}</Body>}
          />
          <Reasoning.Content>
            {copy(
              "Mesajlar, dosyalar ve kuyruk aynı ortak bileşenlerle gösterilir.",
              "Messages, files and the queue use the same shared components.",
            )}
          </Reasoning.Content>
        </Reasoning>
        {queue.length ? (
          <View style={{ flexDirection: "row" }}>
            <Button
              label={copy("{p0} sırada", "{p0} queued", { p0: queue.length })}
              density="compact"
              tone="secondary"
              onPress={() => setQueueOpen(true)}
            >
              <ListOrdered size={15} strokeWidth={2.2} color={colors.accent} />
            </Button>
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
        <View style={{ flexDirection: "row" }}>
          <Button
            label={modeLabel}
            density="compact"
            tone="secondary"
            onPress={() => setModePicker(true)}
          />
        </View>
        <ChatComposerSurface
          layout={resize}
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: space.xs,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.separator,
            borderRadius: radii.preview,
            padding: space.xxs,
          }}
        >
          <ChatCircleAction
            label={copy("Dosya ekle", "Attach file")}
            onPress={() => setAttached(true)}
          >
            <Plus size={19} strokeWidth={2.4} color={colors.text} />
          </ChatCircleAction>
          <Input
            label={copy("Mesaj", "Message")}
            value={prompt}
            onChangeText={setPrompt}
            placeholder={copy("Bir mesaj yaz", "Write a message")}
            multiline
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              maxHeight: 140,
              borderWidth: 0,
              backgroundColor: "transparent",
              paddingVertical: space.sm + 2,
              paddingHorizontal: space.xs,
            }}
          />
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
        </ChatComposerSurface>
        {result ? (
          <Notice
            tone="success"
            message={copy("Örnekte işlendi: {p0}", "Handled in this sample: {p0}", { p0: result })}
          />
        ) : null}
      </Card>
      <Plan defaultOpen>
        <Plan.Header>
          <Plan.Title>{copy("Örnek uygulama planı", "Sample implementation plan")}</Plan.Title>
          <Plan.Action>
            <Body muted accessibilityLabel={copy("Örnek ilerleme", "Sample progress")}>
              1 / 2
            </Body>
            <Plan.Trigger accessibilityLabel={copy("Plan ayrıntıları", "Plan details")} />
          </Plan.Action>
        </Plan.Header>
        <Plan.Content>
          <Plan.Steps>
            <Plan.Step status="done">
              {copy("Ortak bileşenleri kur", "Set up shared components")}
            </Plan.Step>
            <Plan.Step status="pending">
              {copy("Konuşmayı cihazda doğrula", "Verify the conversation on a device")}
            </Plan.Step>
          </Plan.Steps>
        </Plan.Content>
      </Plan>
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
                option.value === mode ? <Check size={18} strokeWidth={2.4} color={colors.accent} /> : undefined
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
