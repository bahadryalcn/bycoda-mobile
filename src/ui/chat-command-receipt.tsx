import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Check from "lucide-react-native/icons/check";
import { Body } from "./typography";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { space } from "./tokens";

/** Brief, neutral acknowledgement. Mount once per accepted command; errors stay with their owner. */
export function ChatCommandReceipt({ onExpire }: { onExpire?: () => void }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [visible, setVisible] = useState(true);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  // Streaming rerenders can replace the callback; they must never restart this acknowledgement.
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      expire.current?.();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }}>
      <Check size={14} color={colors.muted} />
      <Body muted style={[uiStyles.caption, { flexShrink: 1 }]}>
        {copy("Komut bilgisayara ulaştı.", "The computer accepted the command.")}
      </Body>
    </View>
  );
}
