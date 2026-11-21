import { useState } from "react";
import { View } from "react-native";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ScrollSectionsPosition } from "panelui-native/hooks/use-scroll-sections";
import { useLocale } from "../i18n";
import { Button, SelectRow } from "./buttons";
import { Sheet } from "./dialogs";
import { Stack } from "./layout";
import { useScreenContentInsets } from "./screen-content-insets";
import { readingProgressPercent } from "./section-progress-model";
import { metrics, space } from "./tokens";
import { Body } from "./typography";

export type SectionNavigatorItem = { id: string; title: string };

/**
 * The reading toolbar sits beside the document scroller. The shared sheet owns
 * back, dismissal, and scrolling through the jump list.
 */
export function SectionNavigator({ sections, active, scroll, onSelect, label }: {
  sections: readonly SectionNavigatorItem[];
  active: string | undefined;
  scroll: ScrollSectionsPosition;
  onSelect: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const locale = useLocale();
  const insets = useScreenContentInsets();
  const currentTitle = sections.find(({ id }) => id === active)?.title;
  const percent = new Intl.NumberFormat(locale, { style: "percent" }).format(progress / 100);
  const { offset, viewport, content } = scroll;
  useAnimatedReaction(
    () => readingProgressPercent(offset.value, viewport.value, content.value),
    (value, previous) => { if (value !== previous) scheduleOnRN(setProgress, value); },
  );
  return (
    <View style={{
      alignSelf: "center", width: "100%", maxWidth: metrics.contentWidth,
      paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: insets.bottom + space.xs,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm,
    }}>
      <Body
        muted numberOfLines={1}
        accessibilityElementsHidden importantForAccessibility="no"
        style={{ flex: 1, minWidth: 0 }}
      >
        {currentTitle ? `${percent} · ${currentTitle}` : percent}
      </Body>
      <Button
        label={label}
        accessibilityLabel={[label, currentTitle, percent].filter(Boolean).join(". ")}
        style={{ minHeight: metrics.touchTarget }}
        onPress={() => setOpen(true)}
      />
      <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
        <Stack>
          {sections.map(({ id, title }) => (
            <SelectRow key={id} label={title} selected={id === active} onPress={() => {
              setOpen(false);
              onSelect(id);
            }} />
          ))}
        </Stack>
      </Sheet>
    </View>
  );
}
