import { useState } from "react";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { useAsyncAction } from "@/state/actions";
import { Body, Button, Heading, IdentifierField, MutationState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { MOBILE_PAIRING_MAX_BYTES } from "../../../../src/integrations/mobile-pairing";
import type { PairingPasteProps } from "./connection-types";

export function PairingPaste({ disabled, onCode, onCancel }: PairingPasteProps) {
  const copy = useCopy();
  const [text, setText] = useState("");
  const read = useAsyncAction();
  return (
    <View style={{ gap: space.lg }}>
      <Heading>{copy("Bağlantı kodunu yapıştır", "Paste pairing code")}</Heading>
      <Body muted>
        {copy(
          "Bilgisayarındaki Bycoda’dan bağlantı kodunu kopyalayıp buraya yapıştır.",
          "Copy the pairing code from Bycoda on your computer and paste it here.",
        )}
      </Body>
      <IdentifierField
        label={copy("Bağlantı kodu", "Pairing code")}
        value={text}
        onChangeText={setText}
        maxLength={MOBILE_PAIRING_MAX_BYTES}
        editable={!disabled && !read.isPending}
        autoComplete="off"
        multiline
      />
      <MutationState mutation={read} />
      <Button
        label={copy("Bilgisayarı göster", "Preview computer")}
        disabled={disabled || !text.trim()}
        busy={read.isPending}
        tone="primary"
        onPress={() => {
          void read.run(() => onCode(text));
        }}
      />
      <Button label={copy("Vazgeç", "Cancel")} tone="quiet" disabled={read.isPending} onPress={onCancel} />
    </View>
  );
}
