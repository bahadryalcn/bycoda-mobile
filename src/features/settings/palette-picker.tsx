import { View } from "react-native";
import { Body, PressableCard, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { ViewStyle } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import { PALETTES, radii, resolveMobilePalette, space, type PaletteId } from "@/ui/tokens";

const RING = 2;
const STRIP_HEIGHT = 20;
const layout = {
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: {
    // Three equal columns; a short last row keeps the card size instead of stretching.
    flexGrow: 0,
    flexBasis: "30%",
    minWidth: 96,
    minHeight: 0,
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

/** Seven palette cards with a canvas, surface, line and accent strip of that palette in the current mode. */
export function PalettePicker({ value, disabled, onChange }: Props) {
  const copy = useCopy();
  const { mode, colors } = useMobileTheme();
  return (
    <Stack>
    <Body style={{ marginTop: space.md }}>{copy("Renk paleti", "Color palette")}</Body>
    <View accessibilityRole="radiogroup" accessibilityLabel={copy("Renk paleti", "Color palette")} style={layout.grid}>
      {PALETTES.map((palette) => {
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
    </View>
    </Stack>
  );
}
