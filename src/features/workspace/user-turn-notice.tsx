import { useState } from "react";
import { View } from "react-native";
import Bot from "lucide-react-native/icons/bot";
import { Body, Sheet } from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { MessageText } from "@/ui/message-text";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { TranscriptBlockProps } from "./session-types";
import type { UserTurn } from "./user-turn";

/**
 * A user-role turn nobody typed, shown as desktop does: a delegate's result or message is a
 * compact row with its text behind a sheet, and an app resume prompt is one quiet line.
 */
export function UserTurnNotice({
  turn,
  context,
}: {
  turn: Exclude<UserTurn, { kind: "message" }>;
  context: TranscriptBlockProps["context"];
}) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const [open, setOpen] = useState<number>();
  if (turn.kind === "resume")
    return (
      <Body muted style={[uiStyles.caption, { paddingVertical: space.xs }]}>
        {copy("Bu tur sürdürüldü", "Resumed this turn")}
      </Body>
    );
  const sections = turn.sections;
  const section = open === undefined ? undefined : sections[open];
  const sectionTitle = (value: (typeof sections)[number]) =>
    value.reason === "completion"
      ? copy("{p0} sonucu", "Result from {p0}", { p0: value.title })
      : copy("{p0} mesajı", "Message from {p0}", { p0: value.title });
  return (
    <View style={{ gap: space.xs }}>
      {sections.map((value, index) => (
        <ChatSummary
          key={`${value.runId}:${index}`}
          label={sectionTitle(value)}
          status={
            value.status === undefined
              ? undefined
              : value.status === "succeeded"
                ? copy("Tamamlandı", "Done")
                : value.status === "failed"
                  ? copy("Başarısız", "Failed")
                  : copy("Durduruldu", "Stopped")
          }
          color={value.status === "failed" ? colors.danger : colors.muted}
          icon={<Bot size={16} color={colors.muted} />}
          onPress={() => setOpen(index)}
        />
      ))}
      <Sheet
        visible={section !== undefined}
        title={section ? sectionTitle(section) : ""}
        size="full"
        onClose={() => setOpen(undefined)}
      >
        {section ? <MessageText text={section.body} context={context} role="assistant" /> : null}
      </Sheet>
    </View>
  );
}
