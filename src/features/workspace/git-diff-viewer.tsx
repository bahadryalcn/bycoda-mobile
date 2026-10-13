import { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Body, Button, CodeText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors, space, fontSize, radii, semanticColors } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { DiffLine } from "./wire-types";

/** A bounded two-axis diff viewport keeps file actions reachable on a phone. */
export function GitDiffViewer({ lines }: { lines: readonly DiffLine[] }) {
  const copy = useCopy();
  const { height } = useWindowDimensions();
  const [limit, setLimit] = useState(200);
  const visible = lines.slice(0, limit);
  const remaining = lines.length - visible.length;
  return (
    <View style={{ gap: space.sm, minWidth: 0 }}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={copy("Dosya farkı", "File diff")}
        style={{
          maxHeight: Math.max(160, Math.min(360, height * 0.42)),
          borderRadius: radii.control,
          borderWidth: 1,
          borderColor: colors.separator,
        }}
      >
        <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexGrow: 1, paddingVertical: space.xs }}>
            {visible.map((line, position) => (
              <View
                key={position}
                style={{
                  flexDirection: "row",
                  minHeight: 24,
                  backgroundColor:
                    line.kind === "add"
                      ? semanticColors.success.surface
                      : line.kind === "remove"
                        ? semanticColors.danger.surface
                        : line.kind === "context"
                          ? colors.raised
                          : colors.panel,
                }}
              >
                <CodeText
                  selectable={false}
                  style={{
                    width: 42,
                    textAlign: "right",
                    paddingEnd: space.sm,
                    fontSize: fontSize.micro,
                    lineHeight: 24,
                    color: colors.subtle,
                  }}
                >
                  {line.oldLine ?? ""}
                </CodeText>
                <CodeText
                  selectable={false}
                  style={{
                    width: 42,
                    textAlign: "right",
                    paddingEnd: space.sm,
                    fontSize: fontSize.micro,
                    lineHeight: 24,
                    color: colors.subtle,
                  }}
                >
                  {line.newLine ?? ""}
                </CodeText>
                <CodeText
                  style={{
                    fontSize: fontSize.caption,
                    lineHeight: 24,
                    paddingEnd: space.md,
                    color:
                      line.kind === "add"
                        ? colors.success
                        : line.kind === "remove"
                          ? colors.danger
                          : colors.muted,
                  }}
                >
                  {`${line.kind === "add" ? "+ " : line.kind === "remove" ? "− " : "  "}${line.text}`}
                </CodeText>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
      {remaining > 0 ? (
        <>
          <Body muted style={uiStyles.caption}>
            {copy("{p0} / {p1} diff satırı", "{p0} / {p1} diff lines", {
              p0: visible.length,
              p1: lines.length,
            })}
          </Body>
          <Button
            density="compact"
            label={copy("Sonraki {p0} satırı göster", "Show next {p0} lines", {
              p0: Math.min(200, remaining),
            })}
            onPress={() => setLimit((current) => current + 200)}
            style={{ alignSelf: "flex-start" }}
          />
        </>
      ) : null}
    </View>
  );
}
