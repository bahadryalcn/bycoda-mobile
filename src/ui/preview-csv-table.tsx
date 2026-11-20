import { FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { useMemo, useRef, useState } from "react";
import { Body } from "./primitives";
import { useCopy } from "./copy";
import { csvDelimiterFor, csvVisibleColumns, parseCsvPreview, CSV_PREVIEW_MAX_ROWS } from "./preview-csv";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";

const COLUMN_WIDTH = metrics.rowHeightSession * 3;
const TABLE_MAX_HEIGHT = metrics.rowHeightSession * 9;

/**
 * CSV or TSV as a table: first rows only, a header that stays above the scrolling rows, columns scroll sideways.
 * Rows come from a windowed `FlatList` and each row mounts only the columns near the horizontal viewport,
 * so a 500 x 200 preview keeps a bounded number of cells mounted.
 */
export function CsvTable({ name, text }: { name: string; text: string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { width: windowWidth } = useWindowDimensions();
  const table = useMemo(() => parseCsvPreview(text, csvDelimiterFor(name)), [name, text]);
  const viewport = useRef({ offset: 0, width: windowWidth });
  // State holds only the mounted column range, so scrolling re-renders only when that range changes.
  const [shown, setShown] = useState(() => csvVisibleColumns(0, windowWidth, table.columns, COLUMN_WIDTH));
  const track = (patch: Partial<{ offset: number; width: number }>) => {
    viewport.current = { ...viewport.current, ...patch };
    const next = csvVisibleColumns(viewport.current.offset, viewport.current.width, table.columns, COLUMN_WIDTH);
    setShown((current) => (current.start === next.start && current.end === next.end ? current : next));
  };
  if (table.columns === 0) return <Body muted>{copy("Dosya boş.", "The file is empty.")}</Body>;
  // A new file can have fewer columns than the range left by the previous one.
  const start = Math.min(shown.start, table.columns - 1);
  const cells = (values: string[], head: boolean) => (
    <View style={{ flexDirection: "row", paddingLeft: start * COLUMN_WIDTH }}>
      {values.slice(start, shown.end).map((value, offset) => (
        <View key={start + offset}
          style={{ width: COLUMN_WIDTH, padding: space.sm, borderRightWidth: 1, borderRightColor: colors.separator }}>
          <Body numberOfLines={head ? 2 : 4} style={head ? { fontWeight: "600" } : undefined}>{value}</Body>
        </View>
      ))}
    </View>
  );
  return (
    <View style={{ gap: space.xs }}>
      <ScrollView horizontal nestedScrollEnabled accessibilityLabel={name} scrollEventThrottle={32}
        onLayout={(event) => track({ width: event.nativeEvent.layout.width })}
        onScroll={(event) => track({ offset: event.nativeEvent.contentOffset.x })}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: space.md }}>
        <View style={{ width: COLUMN_WIDTH * table.columns }}>
          <View style={{ backgroundColor: colors.raised, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {cells(table.header, true)}
          </View>
          <FlatList
            data={table.rows}
            extraData={shown}
            nestedScrollEnabled
            keyExtractor={(_, index) => String(index)}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            style={{ maxHeight: TABLE_MAX_HEIGHT }}
            renderItem={({ item }) => (
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}>{cells(item, false)}</View>
            )}
          />
        </View>
      </ScrollView>
      {table.truncated ? (
        <Body muted>{copy("İlk {p0} satır gösteriliyor.", "Showing the first {p0} rows.", { p0: CSV_PREVIEW_MAX_ROWS })}</Body>
      ) : null}
    </View>
  );
}
