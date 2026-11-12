import { View } from "react-native";
import X from "lucide-react-native/icons/x";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { Body, Button, Disclosure, IconButton, Row, SearchField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { TranscriptFindResult } from "./transcript-find-model";

export function TranscriptFindControls({
  open,
  onToggle,
  query,
  onQuery,
  count,
  active,
  activeIndex,
  hasEarlier,
  busy,
  searching = false,
  onEarlier,
  onNavigate,
  failed,
  onRetry,
  onInspect,
}: {
  open: boolean;
  onToggle: () => void;
  query: string;
  onQuery: (value: string) => void;
  count: number;
  active?: TranscriptFindResult;
  activeIndex: number;
  hasEarlier: boolean;
  busy: boolean;
  searching?: boolean;
  onEarlier: () => void;
  onNavigate: (direction: 1 | -1) => void;
  failed: boolean;
  onRetry: () => void;
  onInspect?: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  if (!open) return null;
  return (
    <View style={{ gap: space.xs, paddingBottom: space.xs }}>
      {open ? (
        <>
          <Row style={{ flexWrap: "nowrap" }}>
            <View style={uiStyles.grow}>
              <SearchField
                label={copy("Yüklenen metinde bul", "Find in loaded text")}
                value={query}
                onChangeText={onQuery}
                maxLength={200}
              />
            </View>
            <IconButton label={copy("Aramayı kapat", "Close find")} onPress={onToggle}>
              <X size={18} color={colors.muted} />
            </IconButton>
          </Row>
          <Row>
            <IconButton
              label={copy("Önceki sonuç", "Previous result")}
              disabled={!count}
              onPress={() => onNavigate(-1)}
            >
              <ChevronUp size={18} color={colors.muted} />
            </IconButton>
            <IconButton
              label={copy("Sonraki sonuç", "Next result")}
              disabled={!count}
              onPress={() => onNavigate(1)}
            >
              <ChevronDown size={18} color={colors.muted} />
            </IconButton>
            <Body style={[uiStyles.caption, uiStyles.grow]} accessibilityLiveRegion="polite">
              {!query.trim()
                ? copy("Aranacak metni gir", "Enter text to find")
                : searching
                  ? copy("İşleniyor…", "Working…")
                  : count
                    ? copy("{p1}/{p2} sonuç", "{p1}/{p2} results", {
                        p1: active ? activeIndex + 1 : 0,
                        p2: count,
                      })
                    : copy("Yüklenen görünümde sonuç yok", "No results in the loaded view")}
            </Body>
            {hasEarlier ? (
              <Button
                tone="quiet"
                label={copy("Önceki mesajları yükle", "Load earlier messages")}
                busy={busy}
                onPress={onEarlier}
              />
            ) : null}
          </Row>
          <Disclosure
            label={copy("Yüklenen görünüm · yalnızca önizlemeler", "Loaded view · previews only")}
          >
            <Body muted style={uiStyles.caption}>
              {copy(
                "Yalnızca bu görünümde yüklenen metin ve önizlemeler aranır; eşleşen her mesaj için bir sonuç gösterilir. Gizli ayrıntılar, yüklenmemiş eski mesajlar ve tam uzak çıktılar dahil değildir.",
                "Search covers loaded text and previews in this view, with one result per matching block. Hidden details, older unloaded messages and full remote outputs are excluded.",
              )}
            </Body>
          </Disclosure>
          {active ? (
            <Body selectable numberOfLines={3} style={uiStyles.caption}>
              {active.snippet}
            </Body>
          ) : null}
          {active && onInspect ? (
            <Button
              tone="quiet"
              label={copy("Eşleşen etkinliği aç", "Open matching activity")}
              onPress={onInspect}
            />
          ) : null}
          {failed ? (
            <Button
              tone="quiet"
              label={copy("Sonuca kaydırmayı tekrar dene", "Retry scrolling to result")}
              onPress={onRetry}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
