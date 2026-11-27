import { useMemo, useState, type ReactNode } from "react";
import { FlatList, ScrollView, View, useWindowDimensions, type TextStyle } from "react-native";
import Maximize from "lucide-react-native/icons/maximize-2";
import { decorativeSvgProps } from "./accessibility";
import { ChatToolbarAction } from "./chat-controls";
import { useCopy } from "./copy";
import type { MessageNode } from "./message-model";
import {
  messageTableMarkdown,
  tableDataColumnWidths,
  tablePreview,
  tableTextAlign,
  type MessageTableData,
  type TableAlign,
} from "./message-table-model";
import { Body, ErrorText, Row, Sheet } from "./primitives";
import { ReaderActions } from "./reader-actions";
import { useMobileTheme } from "./theme";
import { radii, space } from "./tokens";
import { useClipboardFeedback } from "./use-clipboard-feedback";

type RenderCell = (cell: MessageNode) => ReactNode;
const CELL_PADDING_X = space.row;
const CELL_PADDING_Y = space.sm + space.xxs;

/** Table cells read one step below the chat body (13 at the standard size), never below 12. */
function cellText(bodyStyle: TextStyle) {
  const fontSize = Math.max(12, (bodyStyle.fontSize ?? 15) - 2);
  return { fontSize, lineHeight: Math.round(fontSize * 1.4) };
}

function TableRow({
  cells,
  columns,
  widths,
  align,
  head,
  last,
  textStyle,
  renderCell,
  numberOfLines,
}: {
  cells: MessageNode[];
  columns: number;
  widths: number[];
  align: TableAlign[];
  head: boolean;
  last: boolean;
  textStyle: TextStyle;
  renderCell: RenderCell;
  numberOfLines?: number;
}) {
  const { colors } = useMobileTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: head ? colors.raised : undefined,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: head ? colors.border : colors.separator,
      }}
    >
      {Array.from({ length: columns }, (_, index) => {
        const cell = cells[index];
        return (
          <View
            key={index}
            style={{ width: (widths[index] ?? 0) + CELL_PADDING_X * 2, paddingHorizontal: CELL_PADDING_X, paddingVertical: CELL_PADDING_Y }}
          >
            <Body
              accessibilityRole={head ? "header" : undefined}
              numberOfLines={numberOfLines}
              style={[textStyle, { textAlign: tableTextAlign(align[index]) }, head && { fontWeight: "600" }]}
            >
              {cell ? renderCell(cell) : ""}
            </Body>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A Markdown table inside a message: bordered card, header row, sideways scroll, the first rows
 * only when long. Copy gives the table as Markdown; the full table opens in a both-axis viewer.
 */
export function MessageTable({
  table,
  bodyStyle,
  renderCell,
}: {
  table: MessageTableData;
  bodyStyle: TextStyle;
  renderCell: RenderCell;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const text = cellText(bodyStyle);
  const textStyle = { ...bodyStyle, ...text };
  const widths = useMemo(
    () => tableDataColumnWidths(table, text.fontSize, fontScale),
    [table, text.fontSize, fontScale],
  );
  const markdown = useMemo(() => messageTableMarkdown(table), [table]);
  const clipboard = useClipboardFeedback(markdown);
  const preview = tablePreview(table.rows);
  const copyLabel = clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Kopyala", "Copy");
  return (
    <View style={{ minWidth: 0, gap: space.xs }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.panel, overflow: "hidden" }}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          role="table"
          accessibilityLabel={copy("Tablo: {p0} sütun, {p1} satır.", "Table: {p0} columns, {p1} rows.", {
            p0: table.columns,
            p1: table.rows.length + 1,
          })}
        >
          <View>
            <TableRow cells={table.header} columns={table.columns} widths={widths} align={table.align} head last={!preview.rows.length}
              textStyle={textStyle} renderCell={renderCell} numberOfLines={3} />
            {preview.rows.map((cells, index) => (
              <TableRow key={index} cells={cells} columns={table.columns} widths={widths} align={table.align} head={false}
                last={index === preview.rows.length - 1} textStyle={textStyle} renderCell={renderCell} numberOfLines={6} />
            ))}
          </View>
        </ScrollView>
        <Row style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingHorizontal: space.xs, gap: space.xs }}>
          <Body muted style={{ flexGrow: 1, flexShrink: 1, fontSize: 12, lineHeight: 16, paddingStart: space.xs }}>
            {preview.hidden
              ? copy("{p0} satırdan {p1} tanesi", "{p1} of {p0} rows", { p0: table.rows.length, p1: preview.rows.length })
              : copy("{p0} satır · {p1} sütun", "{p0} rows · {p1} columns", { p0: table.rows.length, p1: table.columns })}
          </Body>
          <ChatToolbarAction
            label={copyLabel}
            accessibilityLabel={clipboard.copied ? copyLabel : copy("Tabloyu Markdown olarak kopyala", "Copy table as Markdown")}
            busy={clipboard.busy}
            onPress={clipboard.copy}
          />
          <ChatToolbarAction
            label={preview.hidden ? copy("Tümünü gör", "View all") : copy("Tam ekran", "Full screen")}
            accessibilityLabel={copy("Tabloyu tam ekran aç", "Open table full screen")}
            onPress={() => setOpen(true)}
          >
            <Maximize {...decorativeSvgProps} size={14} color={colors.muted} />
          </ChatToolbarAction>
        </Row>
      </View>
      <ErrorText error={clipboard.error} />
      {open ? (
        <TableViewer table={table} bodyStyle={bodyStyle} renderCell={renderCell} markdown={markdown} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}

/** Full table: header stays above the virtualized rows, both axes scroll, Markdown copy in the footer. */
function TableViewer({
  table,
  bodyStyle,
  renderCell,
  markdown,
  onClose,
}: {
  table: MessageTableData;
  bodyStyle: TextStyle;
  renderCell: RenderCell;
  markdown: string;
  onClose: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const { fontScale } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const clipboard = useClipboardFeedback(markdown);
  const text = { fontSize: bodyStyle.fontSize ?? 15, lineHeight: bodyStyle.lineHeight ?? 22 };
  const textStyle = { ...bodyStyle, ...text };
  const widths = useMemo(
    () => tableDataColumnWidths(table, text.fontSize, fontScale),
    [table, text.fontSize, fontScale],
  );
  const width = widths.reduce((sum, value) => sum + value + CELL_PADDING_X * 2, 0);
  return (
    <Sheet
      visible
      title={copy("Tablo", "Table")}
      size="full"
      scroll={false}
      onClose={onClose}
      footer={
        <ReaderActions
          page={0}
          pages={1}
          onPage={() => undefined}
          copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Markdown olarak kopyala", "Copy as Markdown")}
          onCopy={clipboard.copy}
          busy={clipboard.busy}
          error={clipboard.error}
          status={<Body muted>{copy("{p0} satır · {p1} sütun", "{p0} rows · {p1} columns", { p0: table.rows.length, p1: table.columns })}</Body>}
        />
      }
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        role="table"
        accessibilityLabel={copy("Tablo: {p0} sütun, {p1} satır.", "Table: {p0} columns, {p1} rows.", {
          p0: table.columns,
          p1: table.rows.length + 1,
        })}
        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card }}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        <View style={{ width, height: height || undefined }}>
          <TableRow cells={table.header} columns={table.columns} widths={widths} align={table.align} head last={false}
            textStyle={textStyle} renderCell={renderCell} />
          <FlatList
            data={table.rows}
            nestedScrollEnabled
            keyExtractor={(_, index) => String(index)}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={7}
            style={{ flex: 1 }}
            renderItem={({ item, index }) => (
              <TableRow cells={item} columns={table.columns} widths={widths} align={table.align} head={false}
                last={index === table.rows.length - 1} textStyle={textStyle} renderCell={renderCell} />
            )}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}
