import { useMobileTheme } from "@/ui/theme";
import { FlatList, View } from "react-native";
import { Body, Button, ErrorText, Loading, PressableCard, Row } from "@/ui/primitives";
import { colors, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { uiStyles } from "@/ui/styles";
import type { ComposerSuggestion } from "./use-composer-catalog";

export function ComposerSuggestions({ items, loading, error, trigger, selected, onPick, onRetry, onClose }: { items: ComposerSuggestion[]; loading: boolean; error: unknown; trigger: string; selected: number; onPick: (item: ComposerSuggestion) => void; onRetry: () => void; onClose: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  return <View style={{ maxHeight: 230, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, borderRadius: radii.control, padding: space.sm, gap: space.xs }}>
    <Row style={{ justifyContent: "space-between" }}><Body muted style={uiStyles.caption}>{trigger === "@" ? copy("Proje dosyaları", "Project files") : trigger === "$" ? copy("Beceriler", "Skills") : copy("Komutlar", "Commands")}</Body><Button tone="quiet" density="compact" label={copy("Kapat", "Close")} onPress={onClose} /></Row>
    {loading ? <Loading /> : null}<ErrorText error={error} />{error ? <Button label={copy("Yeniden dene", "Retry")} onPress={onRetry} /> : null}
    {!loading && !error && !items.length ? <Body muted>{copy("Eşleşme yok", "No matches")}</Body> : null}
    <FlatList data={items} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="always" renderItem={({ item, index }) => <PressableCard label={`${trigger}${item.name}`} selected={index === selected} onPress={() => onPick(item)} style={{ padding: space.sm, borderWidth: 0 }}><Body numberOfLines={1}>{trigger}{item.name}</Body>{item.detail ? <Body muted numberOfLines={1} style={uiStyles.caption}>{item.detail}</Body> : null}</PressableCard>} />
  </View>;
}
