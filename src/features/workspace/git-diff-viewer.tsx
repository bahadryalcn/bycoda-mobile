import { useMobileTheme } from "@/ui/theme";
import { useCallback, useState } from "react";
import { FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { CodeText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space, fontSize, lineHeight, radii } from "@/ui/tokens";
import type { DiffLine } from "./wire-types";

/** Monospace advance as a fraction of font size; sizes the shared horizontal scroll width. */
const MONO_ADVANCE = 0.62;
const MARKER = { add: "+ ", remove: "− ", context: "  " } as const;

/**
 * One horizontal scroll owner wraps a virtualized vertical list, so wide lines scroll together
 * and long diffs only mount the visible rows.
 */
export function GitDiffViewer({ lines }: { lines: readonly DiffLine[] }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const { height } = useWindowDimensions();
  const [viewport, setViewport] = useState(0);
  const digits = lines.reduce(
    (width, line) => Math.max(width, String(line.oldLine ?? "").length, String(line.newLine ?? "").length),
    1,
  );
  const longest = lines.reduce((width, line) => Math.max(width, line.text.length), 0);
  const numberWidth = Math.ceil(digits * fontSize.micro * MONO_ADVANCE) + space.sm * 2;
  const textWidth = Math.ceil((longest + 2) * fontSize.caption * MONO_ADVANCE) + space.md;
  const contentWidth = Math.max(viewport, numberWidth * 2 + textWidth);
  const boxHeight = Math.min(
    lines.length * lineHeight.heading + space.xs * 2,
    Math.max(160, Math.min(360, height * 0.42)),
  );
  const numberLabel = (value: number | undefined) => String(value ?? "").padStart(digits, " ");
  const renderItem = useCallback(
    ({ item }: { item: DiffLine }) => (
      <View
        style={{
          flexDirection: "row",
          height: lineHeight.heading,
          backgroundColor:
            item.kind === "add"
              ? colors.diffAddBg
              : item.kind === "remove"
                ? colors.diffDelBg
                : item.kind === "context"
                  ? colors.raised
                  : colors.panel,
        }}
      >
        {[item.oldLine, item.newLine].map((value, column) => (
          <View
            key={column}
            style={{
              width: numberWidth,
              backgroundColor:
                item.kind === "add"
                  ? colors.diffAddGutter
                  : item.kind === "remove"
                    ? colors.diffDelGutter
                    : undefined,
            }}
          >
            <CodeText
              selectable={false}
              style={{
                textAlign: "right",
                paddingEnd: space.sm,
                fontSize: fontSize.micro,
                lineHeight: lineHeight.heading,
                color: colors.subtle,
              }}
            >
              {numberLabel(value)}
            </CodeText>
          </View>
        ))}
        <CodeText
          numberOfLines={1}
          style={{
            fontSize: fontSize.caption,
            lineHeight: lineHeight.heading,
            paddingEnd: space.md,
            color:
              item.kind === "add"
                ? colors.diffAddText
                : item.kind === "remove"
                  ? colors.diffDelText
                  : item.kind === "context"
                    ? colors.muted
                    : colors.text,
          }}
        >
          {`${MARKER[item.kind as keyof typeof MARKER] ?? MARKER.context}${item.text}`}
        </CodeText>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numberLabel closes over digits only
    [colors, numberWidth, digits],
  );
  return (
    <View
      accessibilityLabel={copy("Dosya farkı", "File diff")}
      onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
      style={{
        minWidth: 0,
        height: boxHeight,
        borderRadius: radii.control,
        backgroundColor: colors.fill,
        overflow: "hidden",
      }}
    >
      <ScrollView horizontal nestedScrollEnabled style={{ height: boxHeight }}>
        <FlatList
          data={lines}
          renderItem={renderItem}
          keyExtractor={(_, position) => String(position)}
          nestedScrollEnabled
          style={{ width: contentWidth, height: boxHeight }}
          contentContainerStyle={{ paddingVertical: space.xs }}
          getItemLayout={(_, position) => ({
            length: lineHeight.heading,
            offset: lineHeight.heading * position,
            index: position,
          })}
          initialNumToRender={40}
          windowSize={7}
        />
      </ScrollView>
    </View>
  );
}
