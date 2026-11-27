import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, FlatList, View } from "react-native";
import type { RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
import { Stack as RouterStack } from "expo-router";
import { Badge, Body, Button, CodeText, Field, PressableCard, Screen, StateView } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { pendingByAnchor, prAnchorKey, splitPath, type PrDiffAnchor, type PrDiffFile, type PrDiffRow } from "./provider-pr-diff-model";
import { DiffStats, prFileStatusLabel } from "./provider-pr-review-summary";

/** Monospace advance as a fraction of font size; sizes the shared horizontal scroll width. */
const MONO_ADVANCE = 0.62;
/** Displayed characters per line; a longer (minified) line is shortened, never the review anchor. */
const LINE_LIMIT = 2000;
/** Code rows stay dense like every diff; the tap target is the whole row width. */
const ROW_HEIGHT = metrics.toolRowHeight;
const MARKER = { add: "+", remove: "−", context: " " } as const;

type LineRow = Extract<PrDiffRow, { type: "line" }>;
type Item =
  | PrDiffRow
  | { type: "pending"; id: string; anchor: PrDiffAnchor; index: number; comment: RemoteInboxReviewComment }
  | { type: "composer"; id: string; anchor: PrDiffAnchor; index?: number };
/** Which line is being commented and the text it opened with; typing lives in `LineComposer`. */
type Composer = { key: string; anchor: PrDiffAnchor; index?: number; text: string };

export const anchorLabel = (anchor: PrDiffAnchor, copy: ReturnType<typeof useCopy>) =>
  anchor.side === "LEFT" ? copy("Eski satır {p0}", "Old line {p0}", { p0: anchor.line }) : copy("Satır {p0}", "Line {p0}", { p0: anchor.line });

/**
 * One file's unified diff, a page pushed over the review: hunk headers, old/new line gutters and
 * add/remove tints in one virtualized list. Wide lines scroll sideways together; pending comments
 * and the composer stay pinned to the visible width under the line they belong to. Tapping a line
 * opens its composer; an unsaved line comment asks before Back leaves it.
 */
export function PrReviewFileView({
  file,
  comments,
  commenting,
  initialAnchor,
  onSave,
  onRemove,
  footer,
}: {
  file: PrDiffFile;
  comments: readonly RemoteInboxReviewComment[];
  /** Whether a line can take a comment now, and why not. */
  commenting: { enabled: boolean; reason?: string };
  initialAnchor?: PrDiffAnchor;
  onSave: (anchor: PrDiffAnchor, body: string, index?: number) => void;
  onRemove: (index: number) => void;
  onClose?: () => void;
  footer?: ReactNode;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const pending = useMemo(() => pendingByAnchor(comments, file.path), [comments, file.path]);
  const [composer, setComposer] = useState<Composer | null>(() => {
    if (!initialAnchor || !commenting.enabled) return null;
    const saved = pending.get(prAnchorKey(file.path, initialAnchor));
    return { key: prAnchorKey(file.path, initialAnchor), anchor: initialAnchor, index: saved?.index, text: saved?.comment.body ?? "" };
  });
  // Typing stays inside the composer row: only whether it holds text reaches this sheet (its dirty guard).
  const [composerDirty, setComposerDirty] = useState(() => !!composer?.text.trim());
  const [box, setBox] = useState({ width: 0, height: 0 });
  const scrollX = useRef(new Animated.Value(0)).current;
  const list = useRef<FlatList<Item>>(null);
  const { name, directory } = splitPath(file.path);
  const open = (anchor: PrDiffAnchor) => {
    if (!commenting.enabled) return;
    const key = prAnchorKey(file.path, anchor);
    if (composer?.key === key) return;
    const saved = pending.get(key);
    setComposer({ key, anchor, index: saved?.index, text: saved?.comment.body ?? "" });
    setComposerDirty(!!saved?.comment.body.trim());
  };
  const closeComposer = () => { setComposer(null); setComposerDirty(false); };
  useEffect(() => { if (!commenting.enabled) closeComposer(); }, [commenting.enabled]);
  const items = useMemo(() => {
    const result: Item[] = [];
    for (const row of file.rows) {
      result.push(row);
      if (row.type !== "line" || !row.anchor) continue;
      const key = prAnchorKey(file.path, row.anchor);
      if (composer?.key === key) result.push({ type: "composer", id: `composer:${key}`, anchor: row.anchor, index: composer.index });
      else {
        const saved = pending.get(key);
        if (saved) result.push({ type: "pending", id: `pending:${key}`, anchor: row.anchor, ...saved });
      }
    }
    return result;
  }, [file, pending, composer?.key, composer?.index]);
  const composerAt = composer ? items.findIndex((item) => item.type === "composer") : -1;
  useEffect(() => {
    if (composerAt < 0) return;
    // Wait for the keyboard to resize the sheet before bringing the line and its composer into view.
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: Math.max(0, composerAt - 1), viewPosition: 0.2, animated: true }), 280);
    return () => clearTimeout(timer);
  }, [composerAt]);
  // Measured once per file, not on every keystroke in the composer.
  const { digits, longest } = useMemo(() => ({
    digits: file.rows.reduce((width, row) => row.type === "line" ? Math.max(width, String(row.oldLine ?? "").length, String(row.newLine ?? "").length) : width, 1),
    longest: file.rows.reduce((width, row) => Math.max(width, Math.min(LINE_LIMIT, row.type === "line" ? row.text.length : row.header.length)), 0),
  }), [file.rows]);
  const numberWidth = Math.ceil(digits * fontSize.micro * MONO_ADVANCE) + space.sm * 2;
  const contentWidth = Math.max(box.width, numberWidth * 2 + Math.ceil((longest + 3) * fontSize.caption * MONO_ADVANCE) + space.md);
  const pinned = (child: ReactNode) => (
    <Animated.View style={{ width: box.width, transform: [{ translateX: scrollX }], paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.raised }}>
      {child}
    </Animated.View>
  );
  const renderLine = (row: LineRow) => {
    const key = row.anchor ? prAnchorKey(file.path, row.anchor) : undefined;
    const active = !!key && composer?.key === key;
    const tint = row.kind === "add" ? colors.diffAddBg : row.kind === "remove" ? colors.diffDelBg : undefined;
    const gutter = row.kind === "add" ? colors.diffAddGutter : row.kind === "remove" ? colors.diffDelGutter : undefined;
    const kindLabel = row.kind === "add" ? copy("eklendi", "added") : row.kind === "remove" ? copy("silindi", "removed") : copy("değişmedi", "unchanged");
    const tappable = commenting.enabled && !!row.anchor;
    const label = `${row.anchor ? `${anchorLabel(row.anchor, copy)}, ` : ""}${kindLabel}: ${row.text}`;
    const rowStyle = { flexDirection: "row" as const, height: ROW_HEIGHT, minHeight: ROW_HEIGHT, alignItems: "center" as const,
      paddingVertical: 0, paddingHorizontal: 0, marginHorizontal: 0, borderRadius: undefined, gap: 0, backgroundColor: active ? colors.selected : tint };
    const content = <>
      {[row.oldLine, row.newLine].map((value, column) => (
        <View key={column} style={{ width: numberWidth, alignSelf: "stretch", justifyContent: "center", backgroundColor: active ? undefined : gutter }}>
          <CodeText selectable={false} style={{ textAlign: "right", paddingEnd: space.sm, fontSize: fontSize.micro, lineHeight: lineHeight.micro, color: colors.subtle }}>
            {value === undefined ? "" : String(value)}
          </CodeText>
        </View>
      ))}
      <CodeText selectable={false} numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, paddingStart: space.xs, paddingEnd: space.md,
        color: row.kind === "add" ? colors.diffAddText : row.kind === "remove" ? colors.diffDelText : colors.text }}>
        {`${MARKER[row.kind]} ${row.text.length > LINE_LIMIT ? `${row.text.slice(0, LINE_LIMIT)}…` : row.text}`}
      </CodeText>
    </>;
    // Only a line that can take a comment is a button; the rest stay plain text rows.
    return tappable && row.anchor ? (
      <PressableCard label={`${label}. ${copy("Bu satıra yorum ekle", "Comment on this line")}`} selected={active}
        onPress={() => open(row.anchor!)} style={rowStyle}>{content}</PressableCard>
    ) : (
      <View accessible accessibilityLabel={label} style={rowStyle}>{content}</View>
    );
  };
  const renderItem = ({ item }: { item: Item }) => {
    if (item.type === "hunk") return (
      <View style={{ height: ROW_HEIGHT, justifyContent: "center", backgroundColor: colors.panel }}>
        <CodeText selectable={false} numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.muted, paddingStart: numberWidth * 2 + space.xs }}>{item.header}</CodeText>
      </View>
    );
    if (item.type === "line") return renderLine(item);
    if (item.type === "pending") return pinned(
      <PressableCard label={`${copy("Bekleyen yorum", "Pending comment")}, ${anchorLabel(item.anchor, copy)}: ${item.comment.body}`}
        disabled={!commenting.enabled} onPress={() => open(item.anchor)} style={{ gap: space.xxs, paddingVertical: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Badge label={copy("Bekliyor", "Pending")} tone="info" />
          <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>{anchorLabel(item.anchor, copy)}</Body>
        </View>
        <Body numberOfLines={4}>{item.comment.body}</Body>
      </PressableCard>,
    );
    if (!composer) return null;
    return pinned(
      <LineComposer key={composer.key} anchor={item.anchor} index={composer.index} initialText={composer.text}
        onDirtyChange={setComposerDirty}
        onRemove={(index) => { onRemove(index); closeComposer(); }}
        onCancel={closeComposer}
        onSave={(text) => { onSave(composer.anchor, text, composer.index); closeComposer(); }} />,
    );
  };
  const hasText = file.rows.length > 0;
  useSheetGuard({ dirty: !!composer && composerDirty });
  return (
    <Screen scroll={false} footer={footer}>
      <RouterStack.Screen options={{ title: name }} />
      <View style={{ flex: 1, gap: space.sm }}>
        <View style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            {file.status !== "modified" ? <Badge label={prFileStatusLabel(file.status, copy)} tone={file.status === "added" ? "success" : file.status === "deleted" ? "danger" : "default"} /> : null}
            <DiffStats additions={file.additions} deletions={file.deletions} />
          </View>
          {directory || file.previousPath ? (
            <Body muted mono selectable style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
              {file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
            </Body>
          ) : null}
          {hasText ? (
            <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>
              {commenting.enabled
                ? copy("Yorum eklemek için bir satıra dokun. Yorumlar incelemeyi gönderene kadar bekler.", "Tap a line to comment. Comments stay pending until you submit the review.")
                : commenting.reason}
            </Body>
          ) : null}
        </View>
        {!hasText ? (
          <StateView size="compact" title={copy("Gösterilecek metin farkı yok", "No text changes to show")}
            description={copy("Dosya ikili olabilir veya fark kısmi olabilir.", "The file may be binary, or the diff may be partial.")} />
        ) : (
          <View
            accessibilityLabel={copy("Dosya farkı", "File diff")}
            onLayout={(event) => setBox({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
            style={{ flex: 1, minWidth: 0, borderRadius: radii.control, backgroundColor: colors.fill, overflow: "hidden" }}
          >
            {box.height > 0 ? (
              <Animated.ScrollView
                horizontal
                nestedScrollEnabled
                bounces={false}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
              >
                <FlatList
                  ref={list}
                  data={items}
                  renderItem={renderItem}
                  keyExtractor={(item) => item.id}
                  extraData={composer ? `${composer.key}:${composer.index ?? ""}` : ""}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={{ width: contentWidth, height: box.height }}
                  contentContainerStyle={{ paddingVertical: space.xs }}
                  initialNumToRender={40}
                  windowSize={9}
                  onScrollToIndexFailed={({ averageItemLength, index }) =>
                    list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })}
                />
              </Animated.ScrollView>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

/** The open line comment: its text changes re-render only this row, never the whole diff. */
function LineComposer({ anchor, index, initialText, onDirtyChange, onRemove, onCancel, onSave }: {
  anchor: PrDiffAnchor; index?: number; initialText: string;
  onDirtyChange: (dirty: boolean) => void; onRemove: (index: number) => void; onCancel: () => void; onSave: (text: string) => void;
}) {
  const copy = useCopy();
  const [text, setText] = useState(initialText);
  const dirty = !!text.trim();
  const reported = useRef(dirty);
  useEffect(() => { if (reported.current !== dirty) { reported.current = dirty; onDirtyChange(dirty); } }, [dirty]);
  return (
    <View style={{ gap: space.sm }}>
      <Field
        label={anchor.side === "LEFT" ? copy("Eski satır {p0} için yorum", "Comment on old line {p0}", { p0: anchor.line }) : copy("Satır {p0} için yorum", "Comment on line {p0}", { p0: anchor.line })}
        value={text}
        multiline
        autoFocus
        maxLength={30_000}
        placeholder={copy("Bu satırda ne değişmeli?", "What should change on this line?")}
        onChangeText={setText}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.sm }}>
        {index !== undefined ? (
          <Button tone="danger" density="compact" label={copy("Yorumu sil", "Delete comment")} onPress={() => onRemove(index)} />
        ) : null}
        <Button tone="quiet" density="compact" label={copy("Vazgeç", "Cancel")} onPress={onCancel} />
        <Button tone="primary" density="compact" label={index === undefined ? copy("Yorumu ekle", "Add comment") : copy("Yorumu güncelle", "Update comment")}
          disabled={!dirty} onPress={() => onSave(text)} />
      </View>
    </View>
  );
}
