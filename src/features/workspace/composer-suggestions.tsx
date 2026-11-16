import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef } from "react";
import { FlatList, View, useWindowDimensions } from "react-native";
import { Item } from "panelui-native/components/item";
import { Body, Button, ErrorText, Loading, Row } from "@/ui/primitives";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { ComposerSuggestion } from "./use-composer-catalog";

export function ComposerSuggestions({ items, loading, error, trigger, selected, onPick, onRetry, onClose, maximumHeight, compact }: { maximumHeight: number; compact: boolean; items: ComposerSuggestion[]; loading: boolean; error: unknown; trigger: string; selected: number; onPick: (item: ComposerSuggestion) => void; onRetry: () => void; onClose: () => void }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const { fontScale } = useWindowDimensions();
  const list = useRef<FlatList<ComposerSuggestion>>(null);
  const revealRetried = useRef(false);
  const revealTarget = useRef({ selected, count: items.length });
  revealTarget.current = { selected, count: items.length };
  const title = trigger === "@" ? copy("Proje dosyaları", "Project files") : trigger === "$" ? copy("Beceriler", "Skills") : copy("Komutlar", "Commands");
  useEffect(() => {
    revealRetried.current = false;
    if (selected >= 0 && selected < items.length)
      list.current?.scrollToIndex({ index: selected, animated: false, viewPosition: 0 });
  }, [selected, items, maximumHeight, compact, fontScale]);
  return <View style={{ maxHeight: maximumHeight, minHeight: 0, flexShrink: 1, backgroundColor: colors.raised, borderRadius: radii.control, padding: compact ? space.xs : space.sm, gap: space.xs }}>
    {!compact ? <Row style={{ justifyContent: "space-between" }}><Body muted style={uiStyles.caption}>{title}</Body><Button tone="quiet" density="compact" label={copy("Kapat", "Close")} onPress={onClose} /></Row> : null}
    <FlatList ref={list} data={items} keyExtractor={(item) => item.id}
      accessibilityLabel={title}
      style={{ minHeight: 0, flexShrink: 1 }}
      ListHeaderComponent={<View style={{gap:space.xs}}>
        {loading && !error ? <Loading /> : null}<ErrorText error={error} />{error ? <Button label={copy("Yeniden dene", "Retry")} busy={loading} onPress={onRetry} /> : null}
        {!loading && !error && !items.length ? <Body muted>{copy("Eşleşme yok", "No matches")}</Body> : null}
      </View>}
      keyboardShouldPersistTaps="always"
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
        if (!revealRetried.current) {
          revealRetried.current = true;
          requestAnimationFrame(() => {
            if (revealTarget.current.selected === index && index < revealTarget.current.count)
              list.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
          });
        }
      }}
      renderItem={({ item, index }) => {
        const path = trigger === "@" ? item.name.replaceAll("\\", "/") : null;
        const label = path ? path.slice(path.lastIndexOf("/") + 1) : `${trigger}${item.name}`;
        const detail = path && path.includes("/") ? path : item.detail;
        return <Item size="sm" variant={index === selected ? "muted" : "default"} className="min-h-12 gap-1"
          accessibilityLabel={[`${trigger}${item.name}`, item.detail].filter(Boolean).join(". ")}
          aria-selected={index === selected} onPress={() => onPick(item)}>
          <Item.Content>
            <Item.Title numberOfLines={2}>{label}</Item.Title>
            {detail ? <Item.Description numberOfLines={2} ellipsizeMode="middle">{detail}</Item.Description> : null}
          </Item.Content>
        </Item>;
      }} />
  </View>;
}
