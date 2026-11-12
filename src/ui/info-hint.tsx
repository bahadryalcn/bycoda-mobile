import { useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type TextStyle } from "react-native";
import Animated from "react-native-reanimated";
import Info from "lucide-react-native/icons/info";
import { Body } from "./typography";
import { reveal } from "./motion";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { hitSlopFor, space } from "./tokens";
import { SectionHeader } from "./layout";

/** Visible glyph size; the touch target stays 48dp through hitSlop. */
const GLYPH = 18;
const slop = hitSlopFor(GLYPH);

/** A short unit-like hint ("0 = unlimited", "0–59") stays visible; a sentence goes behind the icon. */
export const isUnitHint = (text?: string): text is string => !!text && text.length <= 28 && !/[.!?:]$/.test(text);

/** Caption for a unit-like hint, placed under the control. Sentences never render here. */
export function UnitHint({ hint }: { hint?: string }) {
  const { uiStyles } = useMobileTheme();
  return isUnitHint(hint) ? <Body muted style={uiStyles.caption}>{hint}</Body> : null;
}

/** Explanations stay out of the layout until asked for: this is the icon that asks. */
export function InfoHint({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy("Bilgi", "Info")}: ${text}`}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      hitSlop={slop}
      onPress={onToggle}
      style={{ width: GLYPH, height: GLYPH, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <Info size={GLYPH} strokeWidth={2} color={open ? colors.accent : colors.muted} />
    </Pressable>
  );
}

/** The revealed explanation, shown inline directly below the label row. */
export function InfoPanel({ text, open }: { text: string; open: boolean }) {
  const { uiStyles } = useMobileTheme();
  if (!open) return null;
  return (
    <Animated.View entering={reveal}>
      <Body muted style={uiStyles.caption}>{text}</Body>
    </Animated.View>
  );
}

/** Pairs an icon (put it in a SectionHeader `trailing` slot or label row) with its inline panel. */
export function useInfoHint(text: string | undefined) {
  const [open, setOpen] = useState(false);
  return {
    button: text ? <InfoHint text={text} open={open} onToggle={() => setOpen((value) => !value)} /> : null,
    panel: text ? <InfoPanel text={text} open={open} /> : null,
  };
}

/** Field label with the info icon at its end and the explanation revealed beneath it. */
export function HintLabel({ label, help, style, trailing }: {
  label: string; help?: string; style?: StyleProp<TextStyle>; trailing?: ReactNode;
}) {
  const { uiStyles } = useMobileTheme();
  const info = useInfoHint(isUnitHint(help) ? undefined : help);
  return (
    <View style={{ gap: space.xxs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Body style={[style ?? uiStyles.fieldLabel, { flexShrink: 1 }]}>{label}</Body>
        {info.button}
        {trailing}
      </View>
      {info.panel}
    </View>
  );
}

/** A titled section whose explanation sits behind an info icon in the header. Children follow the panel. */
export function HintSection({ title, help, children }: { title: string; help?: string; children?: ReactNode }) {
  const info = useInfoHint(help);
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader flush title={title} trailing={info.button} />
      {info.panel}
      {children}
    </View>
  );
}
