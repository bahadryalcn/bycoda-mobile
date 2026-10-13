type VerticalFrame = { y: number; height: number };
type Caret = { startY: number; endY: number };

export type InvertedInputOffsetOptions = {
  offset: number;
  contentHeight: number;
  viewport: VerticalFrame;
  input: VerticalFrame;
  caret?: Caret;
  gap: number;
  insetTop?: number;
  insetBottom?: number;
};

const clamp = (value: number, lower: number, upper: number) =>
  Math.min(Math.max(value, lower), upper);

/** Screen coordinates increase downward; an inverted list moves content down as its offset increases. */
export function invertedInputOffset({
  offset,
  contentHeight,
  viewport,
  input,
  caret,
  gap,
  insetTop = 0,
  insetBottom = 0,
}: InvertedInputOffsetOptions): number {
  if (viewport.height <= 0 || input.height <= 0) return offset;
  const padding = clamp(gap, 0, viewport.height / 4);
  const visibleTop = viewport.y + padding;
  const visibleBottom = viewport.y + viewport.height - padding;
  const availableHeight = visibleBottom - visibleTop;
  let focusTop = input.y;
  let focusBottom = input.y + input.height;

  if (caret) {
    focusTop = input.y + clamp(Math.min(caret.startY, caret.endY), 0, input.height);
    focusBottom = input.y + clamp(Math.max(caret.startY, caret.endY), 0, input.height);
    // A long selection cannot fit at once. Keep its active end visible.
    if (focusBottom - focusTop > availableHeight) focusTop = focusBottom;
  } else if (input.height > availableHeight) {
    // Until native selection arrives, reveal the end without alternating between both edges.
    focusTop = focusBottom;
  }

  const correction =
    focusTop < visibleTop
      ? visibleTop - focusTop
      : focusBottom > visibleBottom
        ? visibleBottom - focusBottom
        : 0;
  const minimum = 0 - insetTop;
  const maximum = Math.max(minimum, contentHeight - viewport.height + insetBottom);
  return clamp(offset + correction, minimum, maximum);
}
