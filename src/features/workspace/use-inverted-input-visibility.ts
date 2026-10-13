import { useCallback, useEffect, useRef } from "react";
import { findNodeHandle } from "react-native";
import {
  KeyboardController,
  KeyboardControllerNative,
  useFocusedInputHandler,
  useGenericKeyboardHandler,
  useReanimatedFocusedInput,
} from "react-native-keyboard-controller";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { space } from "@/ui/tokens";
import { invertedInputOffset } from "./inverted-input-offset";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";
import type { FocusedInputSelectionChangedEvent } from "react-native-keyboard-controller";

/** Reveal only the focused input belonging to this inverted list, above its fixed composer. */
export function useInvertedInputVisibility<Item>() {
  const listRef = useRef<FlatList<Item>>(null);
  const viewportRef = useRef<View>(null);
  const { input } = useReanimatedFocusedInput();
  const selection = useRef<FocusedInputSelectionChangedEvent | null>(null);
  const position = useRef(0);
  const contentHeight = useRef(0);
  const insets = useRef({ top: 0, bottom: 0 });
  const keyboardVisible = useRef(KeyboardController.isVisible());
  const dragging = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const frame = useRef<number | null>(null);

  const cancelReveal = useCallback(() => {
    generation.current += 1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const reveal = useCallback(async () => {
    if (
      !mounted.current ||
      !keyboardVisible.current ||
      dragging.current ||
      process.env.EXPO_OS === "web"
    )
      return;
    const focused = input.value;
    const scrollTarget = findNodeHandle(listRef.current?.getNativeScrollRef() ?? null);
    const viewportTarget = findNodeHandle(viewportRef.current);
    // The composer and settings sheets must never move the transcript.
    if (
      !focused ||
      scrollTarget === null ||
      viewportTarget === null ||
      focused.parentScrollViewTarget !== scrollTarget
    )
      return;
    const currentGeneration = generation.current;

    try {
      // An outer, untransformed view gives the true viewport of an inverted FlatList.
      const [viewport, focusedFrame] = await Promise.all([
        KeyboardControllerNative.viewPositionInWindow(viewportTarget),
        KeyboardControllerNative.viewPositionInWindow(focused.target),
      ]);
      if (
        !mounted.current ||
        currentGeneration !== generation.current ||
        !keyboardVisible.current ||
        input.value?.target !== focused.target
      )
        return;
      const caret =
        selection.current?.target === focused.target ? selection.current.selection : undefined;
      const nextOffset = invertedInputOffset({
        offset: position.current,
        contentHeight: contentHeight.current,
        viewport,
        input: focusedFrame,
        caret: caret ? { startY: caret.start.y, endY: caret.end.y } : undefined,
        gap: space.sm,
        insetTop: insets.current.top,
        insetBottom: insets.current.bottom,
      });
      if (Math.abs(nextOffset - position.current) < 1) return;
      position.current = nextOffset;
      listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    } catch {
      // The field can unmount when its question is answered during measurement.
    }
  }, [input]);

  const scheduleReveal = useCallback(() => {
    if (!mounted.current) return;
    generation.current += 1;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      void reveal();
    });
  }, [reveal]);

  const keyboardChanged = useCallback(
    (visible: boolean) => {
      keyboardVisible.current = visible;
      if (visible) scheduleReveal();
      else cancelReveal();
    },
    [cancelReveal, scheduleReveal],
  );

  useGenericKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        scheduleOnRN(keyboardChanged, event.height > 0);
      },
      onEnd: (event) => {
        "worklet";
        scheduleOnRN(keyboardChanged, event.height > 0);
      },
    },
    [keyboardChanged],
  );

  useAnimatedReaction(
    () =>
      input.value
        ? {
            target: input.value.target,
            parent: input.value.parentScrollViewTarget,
            height: input.value.layout.height,
            width: input.value.layout.width,
          }
        : null,
    (focused, previous) => {
      if (
        focused?.target !== previous?.target ||
        focused?.parent !== previous?.parent ||
        focused?.height !== previous?.height ||
        focused?.width !== previous?.width
      ) {
        // Do not react to absoluteY updates caused by our own scroll or a manual drag.
        scheduleOnRN(scheduleReveal);
      }
    },
    [input, scheduleReveal],
  );

  const selectionChanged = useCallback(
    (event: FocusedInputSelectionChangedEvent) => {
      selection.current = event;
      scheduleReveal();
    },
    [scheduleReveal],
  );

  useFocusedInputHandler(
    {
      onSelectionChange: (event) => {
        "worklet";
        scheduleOnRN(selectionChanged, event);
      },
      onChangeText: () => {
        "worklet";
        scheduleOnRN(scheduleReveal);
      },
    },
    [scheduleReveal, selectionChanged],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelReveal();
    };
  }, [cancelReveal]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const native = event.nativeEvent;
    position.current = native.contentOffset.y;
    contentHeight.current = native.contentSize.height;
    insets.current = {
      top: native.contentInset?.top ?? 0,
      bottom: native.contentInset?.bottom ?? 0,
    };
    // Any pending native measurements predate this scroll position.
    generation.current += 1;
  }, []);

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      scheduleReveal();
    },
    [scheduleReveal],
  );

  const onScrollBeginDrag = useCallback(() => {
    dragging.current = true;
    cancelReveal();
  }, [cancelReveal]);

  const onScrollEndDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  return {
    listRef,
    viewportRef,
    onViewportLayout: scheduleReveal,
    onScroll,
    onContentSizeChange,
    onScrollBeginDrag,
    onScrollEndDrag,
  };
}
