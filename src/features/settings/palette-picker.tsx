import { PlatformColor, Platform, View } from "react-native";
import { Body, PressableCard, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { ViewStyle } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import { DEFAULT_PALETTE, PALETTES, metrics, radii, resolveMobilePalette, space, type PaletteId } from "@/ui/tokens";
import { materialYouAvailable } from "@/ui/palettes";

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

/** Android system tones for the Material You swatch strip; resolved natively, so they are never read as hex. */
const SYSTEM_SWATCHES = [
  "@android:color/system_neutral1_10",
  "@android:color/system_neutral1_100",
  "@android:color/system_accent1_200",
  "@android:color/system_accent1_500",
];

/** Palette cards in rows of three equal-width choices; Material You appears only on Android 12+. */
export function PalettePicker({ value, disabled, onChange }: Props) {
  const copy = useCopy();
  const { mode, colors } = useMobileTheme();
  const materialAvailable = materialYouAvailable(Platform.OS, Platform.Version);
  const options = PALETTES.filter((palette) => !palette.dynamic || materialAvailable);
  // An unavailable Material You choice (synced from another device) shows the classic card as selected.
  const selectedId = value === "material" && !materialAvailable ? DEFAULT_PALETTE : value;
  const rows: (typeof options)[] = [];
  for (let start = 0; start < options.length; start += 3) rows.push(options.slice(start, start + 3));
  return (
    <Stack>
    <View accessibilityRole="radiogroup" accessibilityLabel={copy("Renk paleti", "Color palette")} style={layout.grid}>
      {rows.map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: "row", gap: space.md, width: "100%" }}>
      {row.map((palette) => {
        const tones = resolveMobilePalette(palette.id, mode).colors;
        const selected = palette.id === selectedId;
        const name = copy(palette.nameTr, palette.name);
        const strip = palette.dynamic
          ? SYSTEM_SWATCHES.map((token) => PlatformColor(token))
          : [tones.background, tones.panel, tones.border, tones.accent];
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
              {strip.map((color, index) => (
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
