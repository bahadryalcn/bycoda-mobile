import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { View } from "react-native";
import type { HostModelCatalog, RemoteProvider } from "@/domain/types";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Body, NavigationRow, QueryState, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { ScreenChromeProvider } from "@/ui/layout";
import type { QueryLike } from "@/ui/query-presentation";
import { metrics, space } from "@/ui/tokens";
import { normalizeSearch } from "@/ui/search-matching";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { agentModelChoices } from "./agent-model-selection";

/** One catalogue opening; the form owns the chosen model and defaults. */
export function AgentModelPicker({ catalog, harness, selected, disabled, query, onSelect, onClose, returnFocusRef }: {
  catalog?: HostModelCatalog;
  harness: RemoteProvider;
  selected: string;
  disabled?: boolean;
  query: QueryLike;
  onSelect: (model: string) => void;
  onClose: () => void;
  returnFocusRef: ComponentProps<typeof Sheet>["returnFocusRef"];
}) {
  const copy = useCopy(), locale = useLocale();
  const [openingHarness] = useState(harness);
  const [search, setSearch] = useState("");
  const retired = useRef(false), mounted = useRef(false);
  if (disabled || harness !== openingHarness) retired.current = true;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (retired.current) onClose(); }, [disabled, harness, onClose]);
  const choices = useMemo(() => agentModelChoices(catalog, harness, search, locale, selected), [catalog, harness, search, locale, selected]);
  const current = useRef({ choices, onSelect, onClose });
  current.current = { choices, onSelect, onClose };
  const active = () => mounted.current && !retired.current;
  const close = () => { if (!active()) return; retired.current = true; current.current.onClose(); };
  const filter = search.trim() ? JSON.stringify([locale, normalizeSearch(search, locale)]) : "";
  const position = useFilteredListScrollMemory<(typeof choices)[number]>(filter, !!catalog, choices.length, { suspended: !catalog });
  return <Sheet visible={!retired.current} title={copy("Model seç", "Choose model")} size="full" scroll={false}
    onClose={close} returnFocusRef={returnFocusRef}>
    <View style={{ width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center",
      paddingHorizontal: space.screen, paddingVertical: space.sm }}>
      <SearchField label={copy("Model ara", "Search models")} value={search}
        onChangeText={text => { if (active()) setSearch(text); }} />
    </View>
    <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
      <ScreenList {...position.listProps} grouped data={choices} keyExtractor={item => item.value}
        header={<QueryState query={query} loading="inline" />}
        ListEmptyComponent={catalog ? <Body muted>{search.trim()
          ? copy("Eşleşen model yok.", "No matching models.")
          : copy("Kullanılabilir model yok.", "No models available.")}</Body> : undefined}
        renderItem={({ item }) => <NavigationRow label={item.label} selected={item.selected}
          icon={<ProviderAccountMark provider={harness} size={18} />}
          onPress={() => {
            if (!active() || !current.current.choices.includes(item)) return;
            retired.current = true;
            if (!item.selected) current.current.onSelect(item.value);
            current.current.onClose();
          }} />}
      />
    </ScreenChromeProvider>
  </Sheet>;
}
