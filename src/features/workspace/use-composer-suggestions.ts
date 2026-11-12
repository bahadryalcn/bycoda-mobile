import { useMemo, useState } from "react";
import type { TextInputKeyPressEvent } from "react-native";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { composerTokenAt, moveSuggestionSelection, replaceComposerToken } from "./composer-tokens";
import { useComposerCatalog, type ComposerSuggestion } from "./use-composer-catalog";
import type { useLocalDraft } from "./use-local-draft";
import type { HostSession } from "./wire";

type Selection = { start: number; end: number };

/** Owns @/slash token detection, the suggestion list and its keyboard selection. */
export function useComposerSuggestions({
  session,
  prompt,
  selection,
  setSelection,
  setValue,
}: {
  session: HostSession | undefined;
  prompt: string;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  setValue: ReturnType<typeof useLocalDraft<ComposerDraft>>["setValue"];
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const detected = composerTokenAt(prompt, selection);
  const tokenId = detected ? `${detected.start}:${detected.trigger}:${detected.query}` : "";
  const token = tokenId && tokenId !== dismissed ? detected : null;
  const catalog = useComposerCatalog(session, token);
  const items = useMemo(() => {
    const needle = token?.query.toLocaleLowerCase() ?? "";
    return (catalog.data ?? [])
      .filter(
        (item) => !needle || `${item.name} ${item.detail}`.toLocaleLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.name.toLocaleLowerCase().startsWith(needle)) -
          Number(a.name.toLocaleLowerCase().startsWith(needle)),
      )
      .slice(0, 30);
  }, [catalog.data, token?.query]);
  // The highlighted row belongs to one token; a different token starts unselected.
  const [pick, setPick] = useState({ tokenId, index: -1 });
  if (pick.tokenId !== tokenId) setPick({ tokenId, index: -1 });
  const selected = pick.tokenId === tokenId ? pick.index : -1;
  const move = (direction: -1 | 1) =>
    setPick((current) => ({
      tokenId,
      index: moveSuggestionSelection(
        current.tokenId === tokenId ? current.index : -1,
        items.length,
        direction,
      ),
    }));
  const choose = (item: ComposerSuggestion) => {
    if (!token) return;
    const replacement = replaceComposerToken(prompt, token, item.label);
    setValue((current) => ({
      ...(current ?? emptyComposerDraft()),
      text: replacement.text,
      selectedMentionRefs: item.path
        ? [
            ...(current?.selectedMentionRefs ?? []).filter((ref) => ref.label !== item.label),
            { label: item.label, path: item.path },
          ]
        : (current?.selectedMentionRefs ?? []),
    }));
    setSelection({ start: replacement.cursor, end: replacement.cursor });
    setDismissed(null);
  };
  const onKeyPress = (event: TextInputKeyPressEvent) => {
    if (!token) return;
    const key = event.nativeEvent.key;
    if (key === "Escape") {
      event.preventDefault();
      setDismissed(tokenId);
    }
    if (key === "ArrowDown" && items.length) {
      event.preventDefault();
      move(1);
    }
    if (key === "ArrowUp" && items.length) {
      event.preventDefault();
      move(-1);
    }
    if ((key === "Tab" || (key === "Enter" && selected >= 0)) && items[Math.max(0, selected)]) {
      event.preventDefault();
      choose(items[Math.max(0, selected)]!);
    }
  };
  return {
    token,
    items,
    catalog,
    selected,
    choose,
    onKeyPress,
    close: () => setDismissed(tokenId),
    /** Typing or inserting text re-opens suggestions that were dismissed. */
    reopen: () => setDismissed(null),
  };
}
