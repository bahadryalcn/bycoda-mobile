import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import { CodeText, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { iconSize, space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { filterTerminalOutput } from "./terminal-output-view-model";
import { terminalDisplayOutput } from "./terminal-model";
import { TerminalAnsiText } from "./terminal-ansi-text";

/** One scrolling owner for the transcript. Stop following while reading history. */
export function TerminalOutputView({ output, query = "", waiting = false }: {
  output: string; query?: string; waiting?: boolean;
}) {
  const copy = useCopy();
  // The reader follows the app appearance like the live terminal it covers.
  const { mode, colors } = useMobileTheme();
  const reader = useRef<ComponentRef<typeof ScrollView>>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const filtered = !!query.trim();
  // One pass over the (up to 64 KB) output serves both the filter and the blank check.
  const display = useMemo(() => terminalDisplayOutput(output), [output]);
  const shown = useMemo(() => filtered ? filterTerminalOutput(display, query) : null, [display, filtered, query]);
  const scrollToEnd = () => {
    if (followingRef.current && !filtered) reader.current?.scrollToEnd({ animated: false });
  };
  // Clearing a search can keep the same content size, so it needs its own follow update.
  useEffect(() => {
    if (!filtered && followingRef.current) reader.current?.scrollToEnd({ animated: false });
  }, [filtered]);
  const blank = !display;
  const empty = shown ? !shown.matches : blank;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
    <ScrollView ref={reader} style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{ padding: space.md, flexGrow: 1, justifyContent: empty ? "center" : "flex-start" }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={false} contentInsetAdjustmentBehavior="never"
      scrollEventThrottle={32}
      onScroll={({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }) => {
        if (filtered) return;
        const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - space.xl;
        followingRef.current = atEnd;
        setFollowing(atEnd);
      }}
      onLayout={scrollToEnd} onContentSizeChange={scrollToEnd}>
      {empty ? waiting ? null : <CodeText style={{ color: colors.muted, textAlign: "center" }}>
        {filtered ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz çıktı yok.", "No output yet.")}
      </CodeText> : shown ? <CodeText selectable style={{ color: colors.text }}>{shown.text}</CodeText>
        : <TerminalAnsiText output={output} mode={mode} />}
    </ScrollView>
    {!following && !filtered ? <View style={{ alignSelf: "flex-end", paddingHorizontal: space.sm, paddingBottom: space.xs }}>
      <IconButton label={copy("Son çıktıyı izle", "Follow latest output")} reserveTouchTarget
        onPress={() => { followingRef.current = true; setFollowing(true); scrollToEnd(); }}>
        <ArrowDownToLine size={iconSize.action} color={colors.text} />
      </IconButton>
    </View> : null}
  </View>;
}
