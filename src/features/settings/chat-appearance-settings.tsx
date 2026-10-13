import { View } from "react-native";
import { Body, Notice, SegmentedControl } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { chatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";

export function ChatAppearanceSettings() {
  const copy = useCopy();
  const size = useChatAppearance((state) => state.textSize);
  const hydrated = useChatAppearance((state) => state.hydrated);
  const setTextSize = useChatAppearance((state) => state.setTextSize);
  const storageError = useChatAppearance((state) => state.storageError);
  const text = chatTextStyles(size);
  return (
    <View style={{ gap: space.lg }}>
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
      <Body muted style={uiStyles.caption}>
        {copy(
          "Bu tercih tüm sohbetlerde kullanılır.",
          "This preference applies to every conversation.",
        )}
      </Body>
      {storageError ? (
        <Notice
          tone="warning"
          message={copy(
            "Yazı boyutu değişti, ancak tercih bu telefona kaydedilemedi. Yeniden seçerek dene.",
            "Text size changed, but the preference could not be saved on this phone. Select it again to retry.",
          )}
        />
      ) : null}
      <Body muted style={uiStyles.sectionLabel}>
        {copy("Önizleme", "Preview")}
      </Body>
      <View
        style={{
          alignSelf: "flex-end",
          maxWidth: "88%",
          gap: space.xs,
          padding: space.md,
          backgroundColor: colors.userMessage,
          borderRadius: radii.card,
          borderBottomEndRadius: radii.control,
        }}
      >
        <Body style={[text.author, { color: colors.muted }]}>{copy("Sen", "You")}</Body>
        <Body style={text.user}>
          {copy("Bu projedeki değişiklikleri özetle.", "Summarize the changes in this project.")}
        </Body>
      </View>
      <View
        style={{
          alignSelf: "stretch",
          gap: space.xs,
          padding: space.md,
          backgroundColor: "transparent",
          borderRadius: radii.card,
        }}
      >
        <Body style={[text.author, { color: colors.muted }]}>{copy("Asistan", "Assistant")}</Body>
        <Body style={text.assistant}>
          {copy(
            "Değişiklikleri inceledim. Dosya listesi ve sonraki adımlar aşağıda.",
            "I reviewed the changes. The file list and next steps are below.",
          )}
        </Body>
      </View>
    </View>
  );
}
