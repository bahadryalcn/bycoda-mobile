import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Animated from "react-native-reanimated";
import { space } from "@/ui/tokens";
import { useAsyncAction } from "@/state/actions";
import { FormActions, IdentifierField, MutationState } from "@/ui/primitives";
import { HintLabel } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { MOBILE_PAIRING_MAX_BYTES } from "../../../../src/integrations/mobile-pairing";
import { parseMobilePairingCode } from "./pairing-code";
import type { PairingPasteProps } from "./connection-types";

/** The copied text when it is a valid, unexpired pairing code; anything else stays on the clipboard. */
export async function copiedPairingCode(): Promise<string | undefined> {
  if (!(await Clipboard.hasStringAsync())) return undefined;
  const value = (await Clipboard.getStringAsync()).trim();
  if (!value || value.length > MOBILE_PAIRING_MAX_BYTES) return undefined;
  try {
    parseMobilePairingCode(value);
    return value;
  } catch {
    return undefined;
  }
}

export function PairingPaste({ disabled, onCode, onCancel }: PairingPasteProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [text, setText] = useState("");
  const read = useAsyncAction();
  const active = useRef(true);
  // Reason: late clipboard and submit results must not change an abandoned entry.
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // Reason: a code already copied on this phone fills the empty field once, without overwriting typing.
  useEffect(() => {
    copiedPairingCode().then(
      (code) => { if (code && active.current) setText((current) => current || code); },
      () => undefined,
    );
  }, []);
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <HintLabel label={copy("Bağlantı kodunu yapıştır", "Paste pairing code")} style={uiStyles.heading} always help={copy(
            "Bilgisayarındaki bycoda’dan bağlantı kodunu kopyalayıp buraya yapıştır.",
            "Copy the pairing code from bycoda on your computer and paste it here.",
          )} />
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
