import { useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useAsyncAction } from "@/state/actions";
import { Body, FormActions, IdentifierField, MutationState } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { MOBILE_PAIRING_MAX_BYTES } from "../../../../src/integrations/mobile-pairing";
import type { PairingPasteProps } from "./connection-types";

export function PairingPaste({ disabled, onCode, onCancel }: PairingPasteProps) {
  const copy = useCopy();
  const [text, setText] = useState("");
  const read = useAsyncAction();
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text
          selectable
          accessibilityRole="header"
          style={uiStyles.heading}
        >
          {copy("Bağlantı kodunu yapıştır", "Paste pairing code")}
        </Text>
        <Body muted>
          {copy(
            "Bilgisayarındaki Bycoda’dan bağlantı kodunu kopyalayıp buraya yapıştır.",
            "Copy the pairing code from Bycoda on your computer and paste it here.",
          )}
        </Body>
      </View>
        <IdentifierField
          label={copy("Bağlantı kodu", "Pairing code")}
          value={text}
          onChangeText={value => { if (!active.current || read.isPending) return; setText(value); read.reset(); }}
          maxLength={MOBILE_PAIRING_MAX_BYTES}
          editable={!disabled && !read.isPending}
          autoComplete="off"
          multiline
        />
      <FormActions
        feedback={<MutationState mutation={read} />}
        submitLabel={copy("Bilgisayarı göster", "Preview computer")}
        disabled={disabled || !text.trim()}
        busy={read.isPending}
        onSubmit={() => {
          if (!active.current || disabled || !text.trim()) return;
          void read.run(async () => { if (active.current) await onCode(text); });
        }}
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={read.isPending}
        onCancel={() => { if (read.isPending || !active.current) return; active.current = false; onCancel(); }}
      />
    </Animated.View>
  );
}
