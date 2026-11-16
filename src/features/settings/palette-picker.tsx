import { View } from "react-native";
import { Body, PressableCard, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { ViewStyle } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import { PALETTES, metrics, radii, resolveMobilePalette, space, type PaletteId } from "@/ui/tokens";

const RING = 2;
const STRIP_HEIGHT = 20;
const layout = {
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: {
    // Each row owns exactly three equal columns, including narrow sheets.
    flex: 1,
    minWidth: 0,
    minHeight: metrics.touchTarget,
    marginHorizontal: 0,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.sm,
    borderWidth: RING,
    borderRadius: radii.card,
    borderCurve: "continuous",
  },
  strip: { flexDirection: "row", height: STRIP_HEIGHT, borderRadius: radii.badge, overflow: "hidden", borderCurve: "continuous" },
  swatch: { flex: 1 },
} satisfies Record<string, ViewStyle>;

type Props = {
  value: PaletteId;
  disabled?: boolean;
  onChange(value: PaletteId): void;
};

/** Nine palette cards with three equal-width choices per row. */
export function PalettePicker({ value, disabled, onChange }: Props) {
  const copy = useCopy();
  const { mode, colors } = useMobileTheme();
  return (
    <Stack>
    <View accessibilityRole="radiogroup" accessibilityLabel={copy("Renk paleti", "Color palette")} style={layout.grid}>
      {[0, 3, 6].map((start) => <View key={start} style={{ flexDirection: "row", gap: space.md, width: "100%" }}>
      {PALETTES.slice(start, start + 3).map((palette) => {
        const tones = resolveMobilePalette(palette.id, mode).colors;
        const selected = palette.id === value;
        const name = copy(palette.nameTr, palette.name);
        return (
          <PressableCard
            key={palette.id}
            role="radio"
            label={name}
            selected={selected}
            disabled={disabled}
            onPress={() => onChange(palette.id)}
            style={{ ...layout.card, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.selected : colors.panel }}
          >
            <View style={layout.strip}>
              {[tones.background, tones.panel, tones.border, tones.accent].map((color, index) => (
                <View key={index} style={[layout.swatch, { backgroundColor: color }]} />
              ))}
            </View>
            <Body>{name}</Body>
          </PressableCard>
        );
      })}
      </View>)}
    </View>
    </Stack>
  );
}
