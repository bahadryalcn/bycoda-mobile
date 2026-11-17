import { ScrollView, View } from "react-native";
import { useMemo } from "react";
import { Body } from "./primitives";
import { useCopy } from "./copy";
import { csvDelimiterFor, parseCsvPreview, CSV_PREVIEW_MAX_ROWS } from "./preview-csv";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";

const COLUMN_WIDTH = metrics.rowHeightSession * 3;
const TABLE_MAX_HEIGHT = metrics.rowHeightSession * 9;

/** CSV or TSV as a table: first rows only, a header that stays visible while rows scroll, columns scroll sideways. */
export function CsvTable({ name, text }: { name: string; text: string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const table = useMemo(() => parseCsvPreview(text, csvDelimiterFor(name)), [name, text]);
  if (table.columns === 0) return <Body muted>{copy("Dosya boş.", "The file is empty.")}</Body>;
  const cell = (value: string, key: number, head: boolean) => (
    <View key={key} style={{ width: COLUMN_WIDTH, padding: space.sm, borderRightWidth: 1, borderRightColor: colors.separator }}>
      <Body numberOfLines={head ? 2 : 4} style={head ? { fontWeight: "600" } : undefined}>{value}</Body>
    </View>
  );
  return (
    <View style={{ gap: space.xs }}>
      <ScrollView horizontal nestedScrollEnabled accessibilityLabel={name}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: space.md }}>
        <View style={{ width: COLUMN_WIDTH * table.columns }}>
          <ScrollView nestedScrollEnabled stickyHeaderIndices={[0]} style={{ maxHeight: TABLE_MAX_HEIGHT }}>
            <View style={{ flexDirection: "row", backgroundColor: colors.raised, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {table.header.map((value, index) => cell(value, index, true))}
            </View>
            {table.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.separator }}>
                {row.map((value, index) => cell(value, index, false))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
      {table.truncated ? (
        <Body muted>{copy("İlk {p0} satır gösteriliyor.", "Showing the first {p0} rows.", { p0: CSV_PREVIEW_MAX_ROWS })}</Body>
      ) : null}
    </View>
  );
}
