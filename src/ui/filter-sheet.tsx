import type { PropsWithChildren } from "react";
import { View } from "react-native";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { Button, IconButton } from "./buttons";
import { radii, space } from "./tokens";
import { Row } from "./layout";
import { Sheet } from "./dialogs";
import { useCopy } from "./copy";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";

export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = copy("Filtreler", "Filters");
  // Icon only: the same sliders trigger on every list. A dot marks applied filters; the count is spoken.
  return (
    <View>
      <IconButton label={count ? `${label} · ${count}` : label} onPress={onPress}>
        <SlidersHorizontal size={18} color={count ? colors.accent : colors.muted} />
      </IconButton>
      {count ? (
        <View accessible={false} pointerEvents="none" style={{
          position: "absolute", top: space.sm, end: space.sm, width: space.sm + space.xxs, height: space.sm + space.xxs,
          borderRadius: radii.pill, backgroundColor: colors.accent,
        }} />
      ) : null}
    </View>
  );
}

/** Equal-width pair that wraps to two full-width rows at large text. */
const FOOTER_BUTTON = { flexGrow: 1, flexBasis: 140, alignSelf: "stretch" } as const;

/** Filter edits stay local until Apply; the action area never scrolls away. */
export function FilterSheet({ visible, onClose, onApply, onReset, applyDisabled = false, children }: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  applyDisabled?: boolean;
}>) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Filtreler", "Filters")} size="compact" onClose={onClose}
      footer={<Row>
        <Button label={copy("Sıfırla", "Reset")} tone="secondary" onPress={onReset} style={FOOTER_BUTTON} />
        <Button label={copy("Uygula", "Apply")} tone="primary" disabled={applyDisabled} onPress={onApply} style={FOOTER_BUTTON} />
      </Row>}>
      {children}
    </Sheet>
  );
}

/** Applied state only: staged choices stay inside the filter editor until Apply. */
export function AppliedFilters({ filters, result }: {
  filters: readonly (string | false | null | undefined)[];
  result?: string;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const labels = filters.filter((label): label is string => typeof label === "string" && !!label);
  const text = [result, ...labels].filter(Boolean).join(" · ");
  const spoken = [result, labels.length ? `${copy("Filtreler", "Filters")}: ${labels.join(" · ")}` : null].filter(Boolean).join(" · ");
  return text ? <Body muted accessibilityLabel={spoken} style={uiStyles.caption}>{text}</Body> : null;
}
