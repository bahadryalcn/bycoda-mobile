import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ViewToken } from "react-native";

/** Wait for current measurements; initial virtualized extents are not a final clamp.
 * Explicit suspension preserves position across concealment, unlike ordinary query loading.
 */
type ListMemory = { scroll(offset: number): void; readEnd?(): boolean; markEnd?(value: boolean): void };
export function useListScrollMemory<T>(memory: ListMemory | null, offset: number, ready: boolean, rowCount: number, { suspended = false }: { suspended?: boolean } = {}) {
  const ref = useRef<FlatList<T>>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const events = useMemo(() => ({ active: false }), [ready, suspended, memory]);
  useLayoutEffect(() => { events.active = true; return () => { events.active = false; }; }, [events]);
  const pending = useRef(!!memory && offset > 0);
  const needsScrollProof = useRef(false);
  const geometry = useRef({ viewport: 0, content: 0, actual: 0, lastVisible: false, rowCount });
  if (geometry.current.rowCount !== rowCount) {
    geometry.current.rowCount = rowCount;
    geometry.current.lastVisible = false;
  }
  const attempt = useRef("");
  const endTarget = useRef(memory?.readEnd?.() ?? false), endRows = useRef(rowCount);
  const target = useRef(offset), wasSuspended = useRef(suspended), suspendedNow = useRef(suspended);
  const previousMemory = useRef(memory);
  if (previousMemory.current !== memory) {
    previousMemory.current = memory;
    target.current = offset;
    pending.current = !!memory;
    needsScrollProof.current = !!memory;
    endTarget.current = memory?.readEnd?.() ?? false;
    endRows.current = rowCount;
    geometry.current.lastVisible = false;
    attempt.current = "";
  } else if (endRows.current !== rowCount && ready && !suspended) {
    endRows.current = rowCount;
    endTarget.current = false;
    memory?.markEnd?.(false);
  }
  suspendedNow.current = suspended;
  if (!wasSuspended.current && suspended) {
    endTarget.current = memory?.readEnd?.() ?? false;
    if (!pending.current) target.current = geometry.current.actual;
    // Concealment removes rows before native/web scroll notifications necessarily
    // arrive. The old visible offset cannot prove that a later restore succeeded.
    geometry.current.actual = 0;
    geometry.current.lastVisible = false;
    pending.current = !!memory && (target.current > 0 || endTarget.current);
    attempt.current = "";
  }
  if (wasSuspended.current && !suspended) attempt.current = "";
  wasSuspended.current = suspended;
  const restore = useCallback(() => {
    const state = geometry.current;
    if (!mounted.current || !events.active || !pending.current && !endTarget.current || !ready || !ref.current || !state.viewport || !state.content) return;
    const maximum = Math.max(0, state.content - state.viewport);
    if (endTarget.current) {
      if (state.actual >= maximum - 1) {
        pending.current = false;
        memory?.scroll(state.actual);
        memory?.markEnd?.(true);
      } else {
        const measure = `end:${state.viewport}:${state.content}`;
        if (attempt.current !== measure) {
          attempt.current = measure;
          // FlatList.scrollToEnd estimates row heights; use the measured viewport.
          ref.current.scrollToOffset({ offset: maximum, animated: false });
        }
      }
      return;
    }
    const reached = Math.abs(state.actual - target.current) < 1;
    const atEnd = (state.rowCount === 0 || state.lastVisible) && state.actual >= maximum - 1;
    // A prior filter's delayed native event cannot prove this filter starts here.
    if (reached && !needsScrollProof.current) {
      pending.current = false;
      memory?.scroll(state.actual);
      return;
    }
    if (atEnd && maximum < target.current) {
      // A visible final row can still move as estimated virtual rows are measured.
      // Remember today's limit while retaining the original target for later growth.
      memory?.scroll(maximum);
      return;
    }
    const measure = `${state.viewport}:${state.content}`;
    if (attempt.current === measure) return;
    attempt.current = measure;
    ref.current.scrollToOffset({ offset: target.current, animated: false });
  }, [memory, offset, ready, events]);
  const restoreCurrent = useRef(restore);
  restoreCurrent.current = restore;
  const rememberEnd = useCallback(() => {
    if (pending.current || endTarget.current || suspendedNow.current || !ready) return;
    const state = geometry.current, maximum = Math.max(0, state.content - state.viewport);
    memory?.markEnd?.(state.lastVisible && maximum - state.actual <= state.viewport);
  }, [memory, ready]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    if (!mounted.current || !events.active) return;
    const height = event.nativeEvent.layout.height;
    if (Number.isFinite(height) && height > 0) geometry.current.viewport = height;
    restore();
    rememberEnd();
  }, [restore, rememberEnd]);
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    if (!mounted.current || !events.active) return;
    if (Number.isFinite(height) && height > 0) geometry.current.content = height;
    restore();
    rememberEnd();
  }, [restore, rememberEnd]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!mounted.current || !events.active || suspendedNow.current) return;
    const next = event.nativeEvent.contentOffset.y;
    if (!Number.isFinite(next)) return;
    const height = event.nativeEvent.contentSize?.height;
    const viewport = event.nativeEvent.layoutMeasurement?.height;
    if (Number.isFinite(height) && height > 0) geometry.current.content = height;
    if (Number.isFinite(viewport) && viewport > 0) geometry.current.viewport = viewport;
    geometry.current.actual = Math.max(0, next);
    needsScrollProof.current = false;
    if (pending.current || endTarget.current) restoreCurrent.current();
    else if (!suspendedNow.current) memory?.scroll(geometry.current.actual);
  }, [memory, events]);
  const cancelRestore = useCallback(() => {
    if (!mounted.current || !events.active || suspendedNow.current) return;
    pending.current = false;
    endTarget.current = false;
    geometry.current.lastVisible = false;
    memory?.markEnd?.(false);
    memory?.scroll(geometry.current.actual);
  }, [memory, events]);
  const onScrollBeginDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!mounted.current || !events.active || suspendedNow.current) return;
    pending.current = false;
    endTarget.current = false;
    geometry.current.lastVisible = false;
    memory?.markEnd?.(false);
    memory?.scroll(event.nativeEvent.contentOffset.y);
  }, [memory, events]);
  useEffect(() => {
    if (process.env.EXPO_OS !== "web" || !ready || suspended) return;
    const node = ref.current?.getScrollableNode?.();
    if (!node?.addEventListener) return;
    // Web wheel intent is explicit; native drags use onScrollBeginDrag above.
    node.addEventListener("wheel", cancelRestore, { passive: true });
    return () => node.removeEventListener("wheel", cancelRestore);
  }, [cancelRestore, ready, suspended]);
  // FlatList requires a stable viewability callback across data/filter changes.
  const memoryNow = useRef(memory); memoryNow.current = memory;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
    if (!mounted.current || suspendedNow.current) return;
    geometry.current.lastVisible = viewableItems.some(item => item.index === geometry.current.rowCount - 1 && item.isViewable);
    if (!pending.current && !endTarget.current) {
      const state = geometry.current, maximum = Math.max(0, state.content - state.viewport);
      memoryNow.current?.markEnd?.(state.lastVisible && maximum - state.actual <= state.viewport);
    }
    restoreCurrent.current();
  }, []);
  useEffect(restore, [restore]);
  return { listProps: memory ? { ref, onLayout, onContentSizeChange, onScroll, onScrollBeginDrag, onViewableItemsChanged, scrollEventThrottle: 16 } : {}, cancelRestore };
}

/** Local filter positions survive detail concealment without remounting the input/list. */
export function useFilteredListScrollMemory<T>(filter: string, ready: boolean, rowCount: number, options: { suspended?: boolean } = {}) {
  const positions = useRef(new Map<string, { offset: number; end: boolean }>());
  const memory = useMemo(() => {
    const remember = (offset: number, end = positions.current.get(filter)?.end ?? false) => {
      positions.current.delete(filter);
      positions.current.set(filter, { offset, end });
      // Bound ephemeral searches while retaining the unfiltered reading position.
      if (positions.current.size > 16) {
        const oldest = [...positions.current.keys()].find(key => key !== "" && key !== filter);
        if (oldest !== undefined) positions.current.delete(oldest);
      }
    };
    return { scroll: remember, readEnd: () => positions.current.get(filter)?.end ?? false, markEnd: (end: boolean) => remember(positions.current.get(filter)?.offset ?? 0, end) };
  }, [filter]);
  return useListScrollMemory<T>(memory, positions.current.get(filter)?.offset ?? 0, ready, rowCount, options);
}
