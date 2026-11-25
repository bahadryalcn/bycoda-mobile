import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import FileText from "lucide-react-native/icons/file-text";
import { FileText as DuotoneFileText } from "./duotone-icon";
import X from "lucide-react-native/icons/x";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import { Attachment } from "panelui-native/components/attachment";
import { ChatMessage, ChatMessageContent, chatUserBubbleStyle } from "./chat";
import { ChatComposer } from "./chat-composer";
import { ChatActivity, ChatPlan } from "./chat-activity";
import { PlanSteps } from "./plan-steps";
import { MessageText } from "./message-text";
import { messageExample } from "./message-example";
import { ChatCircleAction, ChatToolbarAction } from "./chat-controls";
import { Button } from "./buttons";
import { Card, Row, Stack } from "./layout";
import { Body, Heading, CodeText } from "./typography";
import { Sheet } from "./dialogs";
import { Notice, Badge } from "./feedback";
import { haptic } from "./motion";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";

type Mode = "send" | "queue";

/**
 * Offline sample conversation. The gallery keeps the composer inline; the tour passes `layout` to put
 * the transcript in a Sheet body and the composer in the Sheet footer, as in a real session.
 */
export function GalleryChat({
  scenario = "gallery",
  layout,
}: {
  scenario?: "gallery" | "tour";
  layout?: (parts: { body: ReactNode; composer: ReactNode }) => ReactNode;
} = {}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const tour = scenario === "tour";
  const tourReply = copy(
    "## Kişisel web sitesi planı\n\nÖnce ziyaretçilerin seni ve çalışmalarını kolayca tanıyabileceği bir ana sayfa hazırlayabiliriz.\n\n1. Kısa bir tanıtım ve iletişim bağlantısı\n2. Seçtiğin çalışmalar için bir galeri\n3. Telefon ve bilgisayarda okunabilir bir düzen\n\nBu çevrimdışı örnekte hiçbir proje dosyası değişmez. Gerçek bir oturumda sonuçları ve dosya değişikliklerini bu konuşmadan inceleyebilirsin.",
    "## Personal website plan\n\nWe can start with a home page that helps visitors get to know you and your work.\n\n1. A short introduction and contact link\n2. A gallery of selected projects\n3. A readable layout on phones and computers\n\nThis offline example changes no project files. In a real session, you can inspect results and file changes in this conversation.",
  );
  const [prompt, setPrompt] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [result, setResult] = useState("");
  const [attached, setAttached] = useState(true);
  const [tourAnswer, setTourAnswer] = useState<"yes" | "no" | null>(null);
  const [preview, setPreview] = useState(false);
  const [queue, setQueue] = useState<{ id: number; text: string; file: boolean }[]>([]);
  const sequence = useRef(0);
  const sendDisabled = !prompt.trim();
  const submitSample = (text: string, mode: Mode = "send") => {
    const value = text.trim();
    if (!value) return;
    haptic.success();
    if (mode === "queue")
      setQueue((items) => [...items, { id: ++sequence.current, text: value, file: attached }]);
    else setResult(value);
    setPrompt("");
    setAttached(false);
  };
  const inlineComposer = (
    <ChatComposer
      value={prompt}
      onValueChange={setPrompt}
      leading={
        tour ? null : (
          <ChatCircleAction
            label={copy("Dosya ekle", "Attach file")}
            onPress={() => setAttached(true)}
          >
            <Plus size={19} strokeWidth={2.4} color={colors.text} />
          </ChatCircleAction>
        )
      }
      field={{
        accessibilityLabel: copy("Mesaj", "Message"),
        placeholder: copy("Bir mesaj yaz", "Write a message"),
      }}
      submit={
        <ChatCircleAction
          label={copy("Gönder", "Send")}
          hint={tour ? undefined : copy("Basılı tut: Sıraya al", "Press and hold to queue")}
          active={!sendDisabled}
          disabled={sendDisabled}
          onPress={() => submitSample(prompt)}
          onLongPress={tour ? undefined : () => submitSample(prompt, "queue")}
          longPressLabel={tour ? undefined : copy("Sıraya al", "Queue")}
        >
          <ArrowUp
            size={20}
            strokeWidth={2.4}
            color={sendDisabled ? colors.muted : colors.primaryText}
          />
        </ChatCircleAction>
      }
    />
  );
  const body = (
    <Stack>
      <Card>
        {tour ? null : (
          <>
            <Heading>{copy("Sohbet ve dosyalar", "Chat and files")}</Heading>
            <Badge label={copy("Çevrimdışı örnek", "Offline example")} />
          </>
        )}
        <ChatMessage role="user" style={chatUserBubbleStyle(colors)}>
          <ChatMessageContent>
            <Body>{tour ? copy("Kişisel web sitem için bir plan hazırla.", "Plan a personal website for me.") : copy("Mobil konuşmayı sadeleştir.", "Simplify the mobile conversation.")}</Body>
          </ChatMessageContent>
        </ChatMessage>
        <ChatMessage role="assistant" style={{ backgroundColor: "transparent", padding: 0 }}>
          <ChatMessageContent>
            <MessageText text={tour ? tourReply : messageExample} compactMedia />
          </ChatMessageContent>
        </ChatMessage>
        <Attachment
          className="border-0 bg-fill rounded-[16px]"
          onPress={() => setPreview(true)}
          accessibilityLabel={copy("Örnek dosyayı aç", "Open sample file")}
        >
          <Attachment.Media variant="icon">
            <DuotoneFileText size={20} color={colors.muted} />
          </Attachment.Media>
          <Attachment.Content>
            <Attachment.Title>{tour ? "plan.md" : "mobile-plan.md"}</Attachment.Title>
            <Attachment.Description>
              {tour
                ? copy("Yeni dosya · açmak için dokun", "New file · tap to open")
                : copy("Örnek belge · açmak için dokun", "Sample document · tap to open")}
            </Attachment.Description>
          </Attachment.Content>
        </Attachment>
        <ChatActivity title={tour ? copy("Gerekçe", "Why") : copy("Örnek gerekçe", "Sample rationale")} reasoning status="complete">
          <Body>
            {tour ? copy("Önce ziyaretçinin ihtiyaçlarını ve proje kapsamını netleştiriyoruz.", "We start by clarifying visitor needs and the project scope.") : copy(
              "Mesajlar, dosyalar ve kuyruk aynı ortak bileşenlerle gösterilir.",
              "Messages, files and the queue use the same shared components.",
            )}
          </Body>
        </ChatActivity>
        <ChatActivity title={copy("Çalışma ayrıntıları", "Work details")} status="complete">
          <MessageText text={tour ? copy("Kapsam: tanıtım, çalışmalar ve iletişim. plan.md oluşturuldu.", "Scope: introduction, selected work and contact. plan.md was created.") : "```tsx\nconst ready = true;\n```"} />
        </ChatActivity>
        {tour ? (
          tourAnswer ? (
            <Notice
              tone="success"
              message={tourAnswer === "yes" ? copy("Onayladın. Ajan devam ediyor.", "You approved. The agent is continuing.") : copy("Reddettin. Ajan durdu.", "You declined. The agent stopped.")}
            />
          ) : (
            <Stack>
              <Body>{copy("Ajan soruyor: Tasarım bölümünü başlatayım mı?", "The agent asks: Should I start on the design section?")}</Body>
              <Row>
                <Button label={copy("Onayla", "Approve")} tone="primary" onPress={() => setTourAnswer("yes")} />
                <Button label={copy("Reddet", "Decline")} tone="quiet" onPress={() => setTourAnswer("no")} />
              </Row>
            </Stack>
          )
        ) : null}
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
        {tour ? null : attached ? (
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
        {layout ? null : inlineComposer}
        {result ? (
          <Notice
            tone="success"
            message={copy("Örnekte işlendi: {p0}", "Handled in this sample: {p0}", { p0: result })}
          />
        ) : null}
      </Card>
      <ChatPlan title={tour ? copy("Plan", "Plan") : copy("Örnek uygulama planı", "Sample implementation plan")} status="1 / 2">
        <PlanSteps
          steps={[
            {
              id: "shared",
              title: tour ? copy("Sayfa kapsamını belirle", "Define the page scope") : copy("Ortak bileşenleri kur", "Set up shared components"),
              status: "done",
            },
            {
              id: "device",
              title: tour ? copy("Tanıtım ve çalışmalar bölümünü tasarla", "Design the introduction and work sections") : copy("Konuşmayı cihazda doğrula", "Verify the conversation on a device"),
              status: "pending",
            },
          ]}
        />
      </ChatPlan>
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
      <Sheet visible={preview} title={tour ? "plan.md" : "mobile-plan.md"} onClose={() => setPreview(false)}>
        <Heading>{tour ? copy("Kişisel web sitesi planı", "Personal website plan") : copy("Örnek belge", "Sample document")}</Heading>
        <Body>
          {tour
            ? copy("Tanıtım ve iletişim bağlantısı, seçili çalışmalar galerisi, telefonda okunabilir düzen.", "Introduction and contact link, gallery of selected work, a layout readable on phones.")
            : copy(
                "Konuşma, dosya önizleme, sıraya alma ve yönlendirme.",
                "Conversation, file preview, queuing and steering.",
              )}
        </Body>
        {tour ? null : (
          <Body muted>
            {copy(
              "Bu belge tur içindeki örnek içeriktir.",
              "This document is sample content within the tour.",
            )}
          </Body>
        )}
      </Sheet>
    </Stack>
  );
  return layout ? <>{layout({ body, composer: inlineComposer })}</> : body;
}

/**
 * The tour's sample session laid out like the real conversation: the transcript scrolls in the
 * Sheet body and the composer sits in the Sheet footer, outside the scroller, so it rides the
 * keyboard and the focused field stays visible.
 */
export function TourSampleSheet({ onClose }: { onClose: () => void }) {
  const copy = useCopy();
  return (
    <GalleryChat
      scenario="tour"
      layout={({ body, composer }) => (
        <Sheet visible title={copy("Kişisel web sitesi", "Personal website")} onClose={onClose} footer={composer}>
          {body}
        </Sheet>
      )}
    />
  );
}
