import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import { CodeText, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { darkColors, iconSize, space } from "@/ui/tokens";
import { filterTerminalOutput } from "./terminal-output-view-model";
import { terminalDisplayOutput } from "./terminal-model";
import { terminalColorRuns } from "./terminal-output-ansi";

/** One scrolling owner for the transcript. Stop following while reading history. */
export function TerminalOutputView({ output, query = "", waiting = false }: {
  output: string; query?: string; waiting?: boolean;
}) {
  const copy = useCopy();
  const reader = useRef<ComponentRef<typeof ScrollView>>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const filtered = !!query.trim();
  const shown = useMemo(() => filtered ? filterTerminalOutput(terminalDisplayOutput(output), query) : null, [output, filtered, query]);
  const runs = useMemo(() => terminalColorRuns(output), [output]);
  const scrollToEnd = () => {
    if (followingRef.current && !filtered) reader.current?.scrollToEnd({ animated: false });
  };
  // Clearing a search can keep the same content size, so it needs its own follow update.
  useEffect(() => {
    if (!filtered && followingRef.current) reader.current?.scrollToEnd({ animated: false });
  }, [filtered]);
  const empty = shown ? !shown.matches : !runs.length;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: darkColors.background }}>
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
      {empty ? waiting ? null : <CodeText style={{ color: darkColors.muted, textAlign: "center" }}>
        {filtered ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz çıktı yok.", "No output yet.")}
      </CodeText> : <CodeText selectable style={{ color: darkColors.text }}>
        {shown?.text ?? runs.map((run, index) => run.foreground || run.background
          ? <CodeText key={index} style={{ color: run.foreground, backgroundColor: run.background }}>{run.text}</CodeText>
          : run.text)}
      </CodeText>}
    </ScrollView>
    {!following && !filtered ? <View style={{ alignSelf: "flex-end", paddingHorizontal: space.sm, paddingBottom: space.xs }}>
      <IconButton label={copy("Son çıktıyı izle", "Follow latest output")} reserveTouchTarget
        onPress={() => { followingRef.current = true; setFollowing(true); scrollToEnd(); }}>
        <ArrowDownToLine size={iconSize.action} color={darkColors.text} />
      </IconButton>
    </View> : null}
  </View>;
}
