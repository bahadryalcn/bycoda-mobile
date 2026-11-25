import { useState } from "react";
import type { TextInputKeyPressEvent } from "react-native";
import { insertTemplate } from "@/features/management/templates/template-model";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { composerTokenAt, moveSuggestionSelection, replaceComposerToken } from "./composer-tokens";
import { useComposerCatalog, type ComposerSuggestion } from "./use-composer-catalog";
import type { useLocalDraft } from "./use-local-draft";
import type { HostSession } from "./wire";

type Selection = { start: number; end: number };

/** Owns the active token and applies a choice to the original draft and caret. */
export function useComposerSuggestions({
  session, prompt, selection, setSelection, setValue, focused, onSideQuestion,
}: {
  session: HostSession | undefined;
  prompt: string;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  setValue: ReturnType<typeof useLocalDraft<ComposerDraft>>["setValue"];
  focused: boolean;
  onSideQuestion: (question: string) => boolean;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const detected = focused ? composerTokenAt(prompt, selection) : null;
  const tokenId = detected ? `${detected.start}:${detected.trigger}:${detected.query}` : "";
  const token = tokenId && tokenId !== dismissed ? detected : null;
  const catalog = useComposerCatalog(session, token);
  const items = (catalog.data ?? []).filter((item) =>
    item.action !== "side-question" || (token && !prompt.slice(0, token.start).trim() && !prompt.slice(token.end).trim()),
  );
  const selectable = items.filter((item) => !item.unavailable);
  const [pick, setPick] = useState<{ tokenId: string; id?: string }>();
  const selected = pick?.tokenId === tokenId ? selectable.findIndex((item) => item.id === pick.id) : -1;
  const move = (direction: -1 | 1) => {
    const item = selectable[moveSuggestionSelection(selected, selectable.length, direction)];
    setPick({ tokenId, id: item?.id });
  };
  const choose = (item: ComposerSuggestion) => {
    if (!token || item.unavailable) return;
    const draft = valueForPick(prompt, token, item);
    if (item.action === "side-question") {
      const leading = !prompt.slice(0, token.start).trim();
      if (!leading || !onSideQuestion(prompt.slice(token.end).trimStart())) return;
    }
    setValue((current) => ({
      ...(current ?? emptyComposerDraft()),
      text: draft.text,
      ...((item.kind === "crew" || item.kind === "agent") && current?.crewIntent &&
        !current.crewIntent.targets.includes(item.id) ? { crewIntent: undefined } : {}),
      selectedMentionRefs: item.path
        ? [
            ...(current?.selectedMentionRefs ?? []).filter((ref) => ref.label !== item.label),
            { label: item.label, path: item.path },
          ]
        : (current?.selectedMentionRefs ?? []),
    }));
    setSelection(draft.selection);
    setPick(undefined);
    setDismissed(null);
  };
  const close = () => {
    setDismissed(tokenId);
    setPick(undefined);
  };
  const onKeyPress = (event: TextInputKeyPressEvent) => {
    if (!token) return;
    const { key } = event.nativeEvent;
    if (key === "Escape") {
      event.preventDefault();
      close();
    }
    if ((key === "ArrowDown" || key === "ArrowUp") && selectable.length) {
      event.preventDefault();
      move(key === "ArrowDown" ? 1 : -1);
    }
    const item = selectable[Math.max(0, selected)];
    if ((key === "Tab" || (key === "Enter" && selected >= 0)) && item) {
      event.preventDefault();
      choose(item);
    }
  };
  return {
    token, items, catalog, selected: selectable[selected]?.id, choose, move, onKeyPress, close,
    /** Typing or inserting text re-opens suggestions that were dismissed. */
    reopen: () => setDismissed(null),
  };
}

function valueForPick(prompt: string, token: NonNullable<ReturnType<typeof composerTokenAt>>, item: ComposerSuggestion) {
  if (item.template !== undefined) return insertTemplate(prompt, token, item.template);
  if (item.action === "side-question") return { text: "", selection: { start: 0, end: 0 } };
  const { text, cursor } = replaceComposerToken(prompt, token, item.label, item.action !== "scope");
  return { text, selection: { start: cursor, end: cursor } };
}
