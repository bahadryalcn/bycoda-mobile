import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef } from "react";
import { FlatList, View, useWindowDimensions } from "react-native";
import { Body, Button, ErrorText, Loading, PressableCard, Row } from "@/ui/primitives";
import { colors, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { uiStyles } from "@/ui/styles";
import type { ComposerSuggestion } from "./use-composer-catalog";

export function ComposerSuggestions({ items, loading, error, trigger, selected, onPick, onRetry, onClose }: { items: ComposerSuggestion[]; loading: boolean; error: unknown; trigger: string; selected: number; onPick: (item: ComposerSuggestion) => void; onRetry: () => void; onClose: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  const list = useRef<FlatList<ComposerSuggestion>>(null);
  const revealRetried = useRef(false);
  const revealTarget = useRef({ selected, count: items.length });
  revealTarget.current = { selected, count: items.length };
  const { height } = useWindowDimensions();
  useEffect(() => {
    revealRetried.current = false;
    if (selected >= 0 && selected < items.length)
      list.current?.scrollToIndex({ index: selected, animated: false, viewPosition: 0.5 });
  }, [selected, items]);
  return <View style={{ maxHeight: Math.min(280, height * 0.4), backgroundColor: colors.raised, borderRadius: radii.control, padding: space.sm, gap: space.xs }}>
    <Row style={{ justifyContent: "space-between" }}><Body muted style={uiStyles.caption}>{trigger === "@" ? copy("Proje dosyaları", "Project files") : trigger === "$" ? copy("Beceriler", "Skills") : copy("Komutlar", "Commands")}</Body><Button tone="quiet" density="compact" label={copy("Kapat", "Close")} onPress={onClose} /></Row>
    {loading ? <Loading /> : null}<ErrorText error={error} />{error ? <Button label={copy("Yeniden dene", "Retry")} onPress={onRetry} /> : null}
    {!loading && !error && !items.length ? <Body muted>{copy("Eşleşme yok", "No matches")}</Body> : null}
    <FlatList ref={list} data={items} keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="always"
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
        if (!revealRetried.current) {
          revealRetried.current = true;
          requestAnimationFrame(() => {
            if (revealTarget.current.selected === index && index < revealTarget.current.count)
              list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
          });
        }
      }}
      renderItem={({ item, index }) => {
        const path = trigger === "@" ? item.name.replaceAll("\\", "/") : null;
        const label = path ? path.slice(path.lastIndexOf("/") + 1) : `${trigger}${item.name}`;
        const detail = path && path.includes("/") ? path : item.detail;
        return <PressableCard label={[`${trigger}${item.name}`, item.detail].filter(Boolean).join(". ")}
          selected={index === selected} onPress={() => onPick(item)}
          style={{ padding: space.sm, borderWidth: 0 }}>
          <Body numberOfLines={2}>{label}</Body>
          {detail ? <Body muted numberOfLines={2} ellipsizeMode="middle" style={uiStyles.caption}>{detail}</Body> : null}
        </PressableCard>;
      }} />
  </View>;
}
