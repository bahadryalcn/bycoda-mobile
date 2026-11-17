import { useEffect, useState } from "react";
import { nativeFold, type FoldState } from "../../modules/bycoda-fold";

/** Live hinge state on Android foldables; null on a cover screen, iOS, web or without the module. */
export function useFoldState(): FoldState | null {
  const [state, setState] = useState<FoldState | null>(() => {
    try {
      return nativeFold()?.getFoldState() ?? null;
    } catch {
      return null;
    }
  });
  // Subscribe to native hinge changes (posture or unfold) for the screen's lifetime.
  useEffect(() => {
    let sub: { remove(): void } | undefined;
    try {
      sub = nativeFold()?.addListener("onFoldChange", (event) => setState(event.state ?? null));
    } catch {
      sub = undefined;
    }
    return () => sub?.remove();
  }, []);
  return state;
}
