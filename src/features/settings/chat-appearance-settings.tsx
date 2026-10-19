import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Body, Card, Notice, Section, SegmentedControl } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { colors, radii, space } from "@/ui/tokens";
import { chatTextStyles } from "@/ui/chat-styles";
import { uiStyles } from "@/ui/styles";
import { useChatAppearance } from "@/state/chat-appearance";

export function ChatAppearanceSettings() {
  useMobileTheme();
  const copy = useCopy();
  const size = useChatAppearance((state) => state.textSize);
  const hydrated = useChatAppearance((state) => state.hydrated);
  const setTextSize = useChatAppearance((state) => state.setTextSize);
  const storageError = useChatAppearance((state) => state.storageError);
  const text = chatTextStyles(size);
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <Section title={copy("Mesaj yazı boyutu", "Message text size")}>
        <SegmentedControl
          label={copy("Mesaj yazı boyutu", "Message text size")}
          value={size}
          disabled={!hydrated}
          options={[
            { value: "compact", label: copy("Küçük", "Small") },
            { value: "standard", label: copy("Normal", "Standard") },
            { value: "large", label: copy("Büyük", "Large") },
          ]}
          onChange={(value) => {
            void setTextSize(value);
          }}
        />
      </Section>
      {storageError ? (
        <Notice
          tone="warning"
          message={copy(
            "Yazı boyutu değişti, ancak tercih bu telefona kaydedilemedi. Yeniden seçerek dene.",
            "Text size changed, but the preference could not be saved on this phone. Select it again to retry.",
          )}
        />
      ) : null}
      <Section title={copy("Önizleme", "Preview")}>
        <Card style={{ backgroundColor: colors.background, gap: space.md }}>
          <View
            style={{
              alignSelf: "flex-end",
              maxWidth: "88%",
              gap: space.xs,
              padding: space.md,
              backgroundColor: colors.userMessage,
              borderRadius: radii.card,
              borderCurve: "continuous",
              borderBottomEndRadius: radii.control,
            }}
          >
            <Body style={[text.author, { color: colors.muted }]}>{copy("Sen", "You")}</Body>
            <Body style={text.user}>
              {copy("Bu projedeki değişiklikleri özetle.", "Summarize the changes in this project.")}
            </Body>
          </View>
          <View style={{ alignSelf: "stretch", gap: space.xs, padding: space.xs }}>
            <Body style={[text.author, { color: colors.muted }]}>{copy("Asistan", "Assistant")}</Body>
            <Body style={text.assistant}>
              {copy(
                "Değişiklikleri inceledim. Dosya listesi ve sonraki adımlar aşağıda.",
                "I reviewed the changes. The file list and next steps are below.",
              )}
            </Body>
          </View>
        </Card>
      </Section>
    </Animated.View>
  );
}
