/**
 * Heights for a frame whose top edge sits `frameTop` below the window top: the content ends at the
 * hinge and the controls start below it. Null when the hinge is not inside the frame.
 */
export function tabletopFrameSplit(
  frameTop: number,
  frameHeight: number,
  hinge: { start: number; size: number },
): { contentHeight: number; hingeHeight: number } | null {
  const contentHeight = hinge.start - frameTop;
  if (!(contentHeight > 0) || contentHeight + hinge.size >= frameHeight) return null;
  return { contentHeight, hingeHeight: hinge.size };
}
