import { WeekHoursGrid, type WeekHoursRow } from "panelui-native/components/week-hours-grid";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import type { HourBlock } from "./week-hours-model";

export type { HourBlock } from "./week-hours-model";

const TICKS = [0, 6, 12, 18, 24];
// PanelUI draws tracks with --color-muted, which is nearly the panel color in dark mode; raise it locally.
const TRACK = (color: string) => ({ "--color-muted": color }) as object;

/**
 * Read-only 24-hour overview of days and the hours they are filled. It is a
 * visualization, not an input: its bars are shorter than 48dp, so every value
 * it shows must stay editable through the form fields beside it. Hours are
 * wall-clock; build blocks with `week-hours-model`.
 */
export function HoursOverview({ rows, tone = "primary" }: {
  rows: { key: string; label: string; blocks: HourBlock[]; accessibilityLabel?: string }[];
  tone?: "primary" | "muted" | "info";
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const mapped: WeekHoursRow[] = rows.map((row) => ({
    ...row, off: row.blocks.length === 0, blocks: row.blocks.map((block) => ({ ...block, tone })),
  }));
  return <WeekHoursGrid rows={mapped} from={0} to={24} ticks={TICKS} offLabel={copy("Kapalı", "Off")} style={TRACK(colors.border)} />;
}
