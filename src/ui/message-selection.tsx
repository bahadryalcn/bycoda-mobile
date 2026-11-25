import {
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  Pressable,
  StyleSheet,
  View,
  processColor,
  useWindowDimensions,
  type GestureResponderEvent,
  type HostInstance,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { NativeSelectableText } from "../../modules/bycoda-text-selection";
import type { MessageNode } from "./message-model";
import {
  isSelectionAction,
  proseAt,
  selectionSource,
  type ProseRect,
  type SelectionActionId,
  type SelectionSource,
} from "./message-selection-model";
import { PressableTextContext } from "./text-selection";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";

/** In-place selection needs the native module; web, tests and older builds use the selection sheet. */
export const inPlaceSelectionAvailable = !!NativeSelectableText;

// One paragraph in the whole app holds the native selection layer at a time.
type Active = { owner: string; prose: string; x: number; y: number; token: number };
let active: Active | null = null;
let nextToken = 0;
const listeners = new Set<() => void>();
const setActive = (next: Active | null) => {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

type Registry = {
  owner: string;
  actions: readonly SelectionActionId[];
  register: (id: string, measure: () => Promise<ProseRect | null>) => () => void;
  act: (action: SelectionActionId, text: string) => void;
};
const RegistryContext = createContext<Registry | null>(null);

/**
 * Long-press anywhere on a message selects text in place: the paragraph under the finger gets a
 * native selectable layer whose menu carries the app's actions. Where in-place selection is
 * impossible (no native module, a code block, a table, a formula) the owner's selection sheet opens.
 * Disabled, the message keeps the platform's default text selection.
 */
export function SelectableMessage({
  enabled,
  actions,
  onAction,
  onFallback,
  children,
}: PropsWithChildren<{
  enabled: boolean;
  actions: readonly SelectionActionId[];
  onAction: (action: SelectionActionId, text: string) => void;
  onFallback: () => void;
}>) {
  const owner = useId();
  const prose = useRef(new Map<string, () => Promise<ProseRect | null>>());
  const latest = useRef({ onAction, onFallback });
  latest.current = { onAction, onFallback };
  const actionKey = actions.join();
  const registry = useMemo<Registry>(
    () => ({
      owner,
      actions,
      register(id, measure) {
        prose.current.set(id, measure);
        return () => {
          prose.current.delete(id);
          if (active?.owner === owner && active.prose === id) setActive(null);
        };
      },
      act(action, text) {
        setActive(null);
        latest.current.onAction(action, text);
      },
    }),
    [owner, actionKey],
  );
  // Reason: a recycled or unmounted message must not leave a selection layer claimed.
  useEffect(() => () => { if (active?.owner === owner) setActive(null); }, [owner]);
  const selecting = useSyncExternalStore(subscribe, () => active?.owner === owner);
  if (!enabled) return children;
  const longPress = async (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    if (!NativeSelectableText) return latest.current.onFallback();
    const rects = await Promise.all(
      [...prose.current].map(async ([id, measure]) => ({ id, rect: await measure() })),
    );
    const hit = proseAt(rects, pageX, pageY);
    if (!hit) {
      if (active?.owner === owner) setActive(null);
      latest.current.onFallback();
      return;
    }
    setActive({ owner, prose: hit.id, x: hit.x, y: hit.y, token: ++nextToken });
  };
  return (
    <RegistryContext value={registry}>
      <PressableTextContext value>
        <Pressable
          accessible={false}
          onLongPress={(event) => void longPress(event)}
          onPress={selecting ? () => setActive(null) : undefined}
        >
          {children}
        </Pressable>
      </PressableTextContext>
    </RegistryContext>
  );
}

/**
 * One prose paragraph. Inside a `SelectableMessage` it can carry the native selection layer: a
 * transparent copy of the same text and fonts laid exactly over the visible text, which keeps
 * layout, links and list performance unchanged until a long-press selects in it.
 */
export function SelectableProse(props: {
  nodes?: readonly MessageNode[];
  text?: string;
  compactMedia?: boolean;
  mentions?: boolean;
  codeSize?: number;
  style: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const registry = use(RegistryContext);
  if (!registry || !NativeSelectableText) return props.children;
  return <ProseLayer registry={registry} {...props} />;
}

function ProseLayer({
  registry,
  nodes,
  text,
  compactMedia = false,
  mentions = false,
  codeSize = 12,
  style,
  children,
}: Parameters<typeof SelectableProse>[0] & { registry: Registry }) {
  const id = useId();
  const ref = useRef<HostInstance>(null);
  const source = useMemo<SelectionSource | null>(
    () =>
      text !== undefined
        ? { text, runs: [] }
        : nodes
          ? selectionSource(nodes, { compactMedia, mentions, codeSize })
          : null,
    [text, nodes, compactMedia, mentions, codeSize],
  );
  const selectable = !!source?.text.trim();
  // Reason: the message's long-press hit test measures only paragraphs that can be selected.
  useEffect(() => {
    if (!selectable) return;
    return registry.register(
      id,
      () =>
        new Promise((resolve) => {
          const view = ref.current as (HostInstance & { getBoundingClientRect?: () => ProseRect }) | null;
          if (!view) return resolve(null);
          // New architecture: a synchronous window rect. measureInWindow can stay unanswered for
          // views the list keeps off screen, so it is only the fallback and never blocks the press.
          if (typeof view.getBoundingClientRect === "function") {
            const rect = view.getBoundingClientRect();
            return resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          }
          const timer = setTimeout(() => resolve(null), 250);
          view.measureInWindow((x, y, width, height) => { clearTimeout(timer); resolve({ x, y, width, height }); });
        }),
    );
  }, [registry, id, selectable]);
  const start = useSyncExternalStore(subscribe, () =>
    active?.owner === registry.owner && active.prose === id ? active : null,
  );

  return (
    <View ref={ref} collapsable={false}>
      {children}
      {start && source && selectable ? (
        <SelectionLayer registry={registry} source={source} style={style} start={start} />
      ) : null}
    </View>
  );
}

function SelectionLayer({
  registry,
  source,
  style,
  start,
}: {
  registry: Registry;
  source: SelectionSource;
  style: StyleProp<TextStyle>;
  start: Active;
}) {
  const Native = NativeSelectableText!;
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const flat = StyleSheet.flatten(style) ?? {};
  const labels: Record<SelectionActionId, string> = {
    add: copy("Ekle", "Add"),
    quote: copy("Alıntıla", "Quote"),
    translate: copy("Çevir", "Translate"),
    copy: copy("Kopyala", "Copy"),
  };
  const selectionColor = processColor(colors.accent);
  return (
    <Native
      style={StyleSheet.absoluteFill}
      text={source.text}
      runs={source.runs}
      fontSize={flat.fontSize ?? 15}
      lineHeight={flat.lineHeight ?? 0}
      fontScale={fontScale}
      fontWeight={String(flat.fontWeight ?? "400")}
      selectionColor={typeof selectionColor === "number" ? selectionColor : undefined}
      actions={registry.actions.map((action) => ({ id: action, title: labels[action] }))}
      start={{ x: start.x, y: start.y, token: start.token }}
      onSelectionChange={({ nativeEvent }) => {
        if (!nativeEvent.hasSelection && active === start) setActive(null);
      }}
      onSelectionAction={({ nativeEvent }) => {
        if (isSelectionAction(nativeEvent.action) && nativeEvent.text.trim())
          registry.act(nativeEvent.action, nativeEvent.text);
      }}
    />
  );
}
