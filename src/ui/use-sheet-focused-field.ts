import { useCallback, useEffect, useRef, type RefObject } from "react";
import { Keyboard, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";

/** Space kept between a focused field and the edge of the visible sheet body. */
export const FOCUSED_FIELD_MARGIN = 16;

type Span = { top: number; bottom: number };

/**
 * How far the body must scroll so the focused field sits inside the visible body with a margin;
 * 0 when it already does. A field taller than the body keeps its top (label and first line) in view.
 */
export function focusedFieldScrollDelta(field: Span, view: Span, margin = FOCUSED_FIELD_MARGIN): number {
  const room = view.bottom - view.top - 2 * margin;
  if (field.bottom > view.bottom - margin)
    return field.bottom - field.top > room ? field.top - (view.top + margin) : field.bottom - (view.bottom - margin);
  if (field.top < view.top + margin) return field.top - (view.top + margin);
  return 0;
}

type Measurable = {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
  measureLayout(relativeTo: unknown, onSuccess: () => void, onFail?: () => void): void;
};

/**
 * Sheets own keyboard geometry with one KeyboardAvoidingView, so their plain body scroller does not
 * follow the caret. Once the keyboard has settled, the sheet whose body contains the focused field
 * scrolls it into view. Returns the body's `onScroll` handler (pass `scrollEventThrottle`).
 */
export function useKeepFocusedFieldVisible(scroll: RefObject<ScrollViewInstance | null>, enabled: boolean) {
  const offset = useRef(0);
  useEffect(() => {
    if (!enabled || process.env.EXPO_OS === "web") return;
    let frame: number | undefined;
    const reveal = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const view = scroll.current;
        const input = TextInput.State?.currentlyFocusedInput?.() as Measurable | null | undefined;
        if (!view || !input) return;
        const host = ((view as { getNativeScrollRef?: () => unknown }).getNativeScrollRef?.() ?? view) as Measurable;
        // Only the sheet that contains the field reacts; a parent or sibling sheet fails this check.
        input.measureLayout(host, () => {
          host.measureInWindow((_x, viewY, _width, viewHeight) => {
            input.measureInWindow((_ix, inputY, _iw, inputHeight) => {
              const delta = focusedFieldScrollDelta(
                { top: inputY, bottom: inputY + inputHeight },
                { top: viewY, bottom: viewY + viewHeight },
              );
              if (delta) view.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
            });
          });
        }, () => undefined);
      });
    };
    // iOS repeats keyboardDidShow when focus moves between fields, so switching fields reveals too.
    const shown = Keyboard.addListener("keyboardDidShow", reveal);
    return () => {
      shown.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [enabled, scroll]);
  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);
}
