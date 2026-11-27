import { useState } from "react";
import History from "lucide-react-native/icons/history";
import { IconButton, NavigationGroup, NavigationRow, NoResults, SearchField, Sheet, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";

export type AssistantConversationOption = { value: string; label: string; detail?: string };

/** Above this many conversations the sheet offers a search field. */
const SEARCH_FROM = 8;

/**
 * The assistant's recent conversations, opened from the header. Each row is titled by what the
 * conversation is about, with its scope and time below; a long list is searchable. Choosing one opens
 * it; Back from it returns to the assistant's home. `onSelect` returns false when the choice no longer applies.
 */
export function AssistantConversationsButton({ options, selected, disabled, onSelect }: {
  options: AssistantConversationOption[]; selected?: string; disabled?: boolean;
  onSelect(id: string): boolean;
}) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const label = copy("Son konuşmalar", "Recent conversations");
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(needle)) : options;
  return <>
    <IconButton label={label} expanded={open} disabled={disabled} onPress={() => setOpen(true)}>
      <History size={iconSize.action} color={colors.text} />
    </IconButton>
    <Sheet visible={open} title={label} onClose={() => { setOpen(false); setQuery(""); }}>
      {open ? <>
        {options.length > SEARCH_FROM ? <SearchField label={copy("Konuşmalarda ara", "Search conversations")} value={query} onChangeText={setQuery} /> : null}
        {shown.length ? <NavigationGroup>
          {shown.map((option, index) => <NavigationRow key={option.value} label={option.label} labelLines={2} detail={option.detail}
            selected={option.value === selected} separator={index < shown.length - 1}
            onPress={() => { if (onSelect(option.value)) { setOpen(false); setQuery(""); } }} />)}
        </NavigationGroup> : needle ? <NoResults compact searching title={copy("Aramana uyan konuşma yok.", "No conversations match your search.")} onClearSearch={() => setQuery("")} />
          : <StateView size="compact" title={copy("Henüz konuşma yok.", "No conversations yet.")} />}
      </> : null}
    </Sheet>
  </>;
}
