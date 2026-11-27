import { Button, SegmentedControl, SelectField, Section, Stack } from "@/ui/primitives";
import { SliderField } from "@/ui/slider-field";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useAppearance } from "@/state/appearance";
import {
  LINE_SPACING_RANGE,
  TEXT_SCALE_RANGE,
  fontFamilyOptions,
  fontWeightOptions,
  formatPercent,
  isDefaultTypography,
} from "./appearance-settings-model";

/**
 * General typography: text scale and line spacing sliders, font family and weight choices, and a
 * reset limited to these four values (theme, palette and message text size are untouched).
 * Changes persist through the shared appearance store and apply to the whole app at once.
 */
export function TypographySettings() {
  const copy = useCopy();
  const hydrated = useAppearance((state) => state.hydrated);
  const typography = useAppearance((state) => state.typography);
  const setTypography = useAppearance((state) => state.setTypography);
  const resetTypography = useAppearance((state) => state.resetTypography);
  return (
    <Section title={copy("Yazı tipi", "Typography")}>
      <Stack style={{ gap: space.lg }}>
        <SliderField
          label={copy("Uygulama yazı boyutu", "App text size")}
          {...TEXT_SCALE_RANGE}
          value={typography.scale}
          disabled={!hydrated}
          formatValue={formatPercent}
          lowLabel={copy("Küçük", "Smaller")}
          highLabel={copy("Büyük", "Larger")}
          onCommit={(scale) => { void setTypography({ scale }); }}
        />
        <SliderField
          label={copy("Satır aralığı", "Line spacing")}
          {...LINE_SPACING_RANGE}
          value={typography.lineSpacing}
          disabled={!hydrated}
          formatValue={formatPercent}
          lowLabel={copy("Sıkı", "Tight")}
          highLabel={copy("Geniş", "Relaxed")}
          onCommit={(lineSpacing) => { void setTypography({ lineSpacing }); }}
        />
        <SelectField
          label={copy("Yazı tipi ailesi", "Font family")}
          value={typography.fontFamily}
          disabled={!hydrated}
          options={fontFamilyOptions(copy)}
          onChange={(fontFamily) => { void setTypography({ fontFamily }); }}
        />
        <SegmentedControl
          label={copy("Yazı kalınlığı", "Font weight")}
          value={typography.weight}
          disabled={!hydrated}
          options={fontWeightOptions(copy)}
          onChange={(weight) => { void setTypography({ weight }); }}
        />
        <Button
          label={copy("Yazı ayarlarını sıfırla", "Reset typography")}
          tone="quiet"
          flush
          disabled={!hydrated || isDefaultTypography(typography)}
          onPress={() => { void resetTypography(); }}
        />
      </Stack>
    </Section>
  );
}
