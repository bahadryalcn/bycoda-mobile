import { useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useAsyncAction } from "@/state/actions";
import { Body, Button, Card, IdentifierField, MutationState } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { MOBILE_PAIRING_MAX_BYTES } from "../../../../src/integrations/mobile-pairing";
import type { PairingPasteProps } from "./connection-types";

export function PairingPaste({ disabled, onCode, onCancel }: PairingPasteProps) {
  const copy = useCopy();
  const [text, setText] = useState("");
  const read = useAsyncAction();
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <Text
          selectable
          accessibilityRole="header"
          style={[uiStyles.heading, { textAlign: "center" }]}
        >
          {copy("Bağlantı kodunu yapıştır", "Paste pairing code")}
        </Text>
        <Body muted style={{ textAlign: "center" }}>
          {copy(
            "Bilgisayarındaki Bycoda’dan bağlantı kodunu kopyalayıp buraya yapıştır.",
            "Copy the pairing code from Bycoda on your computer and paste it here.",
          )}
        </Body>
      </View>
      <Card>
        <IdentifierField
          label={copy("Bağlantı kodu", "Pairing code")}
          value={text}
          onChangeText={setText}
          maxLength={MOBILE_PAIRING_MAX_BYTES}
          editable={!disabled && !read.isPending}
          autoComplete="off"
          multiline
        />
      </Card>
      <MutationState mutation={read} />
      <Button
        label={copy("Bilgisayarı göster", "Preview computer")}
        disabled={disabled || !text.trim()}
        busy={read.isPending}
        tone="primary"
        fullWidth
        onPress={() => {
          void read.run(() => onCode(text));
        }}
      />
      <Button
        label={copy("Vazgeç", "Cancel")}
        tone="quiet"
        disabled={read.isPending}
        onPress={onCancel}
        style={{ alignSelf: "center" }}
      />
    </Animated.View>
  );
}
