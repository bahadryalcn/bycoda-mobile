import { useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import Copy from "lucide-react-native/icons/copy";
import Search from "lucide-react-native/icons/search";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import { Body, CodeText, ErrorNotice, IconButton, Row, SearchField } from "@/ui/primitives";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { filterTerminalOutput } from "./terminal-output-view-model";

/** The terminal owns its output viewport; typing and reader controls never write to the PTY. */
export function TerminalOutputView({ output }: { output: string }) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme();
  const reader = useRef<ComponentRef<typeof ScrollView>>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const shown = useMemo(() => filterTerminalOutput(output, searching ? query : ""), [output, searching, query]);
  const clipboard = useClipboardFeedback(output, !!output);
  const filtered = searching && !!query.trim();
  return <View style={{ flex: 1, minHeight: 0, gap: space.xs }}>
    <Row style={{ justifyContent: "space-between", flexShrink: 0 }}>
      <Body muted style={uiStyles.caption}>{filtered
        ? copy("Eşleşen satır: {p0}", "Matching lines: {p0}", { p0: shown.matches })
        : copy("Çıktı", "Output")}</Body>
      <Row>
        <IconButton label={copy("Çıktıda ara", "Search output")} expanded={searching} onPress={() => setSearching(value => !value)}>
          <Search size={18} color={searching ? colors.accent : colors.muted} />
        </IconButton>
        <IconButton label={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Çıktıyı kopyala", "Copy output")}
          disabled={!output} busy={clipboard.busy} onPress={clipboard.copy}><Copy size={18} color={colors.muted} /></IconButton>
        <IconButton label={copy("Son çıktıyı izle", "Follow latest output")} disabled={filtered}
          tone={following && !filtered ? "primary" : "default"}
          onPress={() => { setFollowing(true); reader.current?.scrollToEnd({ animated: false }); }}>
          <ArrowDownToLine size={18} color={following && !filtered ? colors.accent : colors.muted} />
        </IconButton>
      </Row>
    </Row>
    {searching ? <SearchField label={copy("Çıktıda ara", "Search output")} value={query} maxLength={200} onChangeText={setQuery} /> : null}
    <ErrorNotice error={clipboard.error} />
    <ScrollView ref={reader} style={{ flex: 1, minHeight: 0, backgroundColor: colors.panel, borderRadius: radii.control }}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false} contentInsetAdjustmentBehavior="never"
      scrollEventThrottle={100}
      onScroll={({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }) => {
        if (!filtered) setFollowing(contentOffset.y + layoutMeasurement.height >= contentSize.height - space.xl);
      }}
      onContentSizeChange={() => { if (following && !filtered) reader.current?.scrollToEnd({ animated: false }); }}>
      <CodeText selectable>{shown.text || (filtered ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz çıktı yok.", "No output yet."))}</CodeText>
    </ScrollView>
  </View>;
}
