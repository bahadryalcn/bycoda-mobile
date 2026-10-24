import { useEffect, useState } from "react";
import { diffLinesAsync } from "./git-diff-preview";
import type { DiffPreview } from "./wire-types";

/** Current input identity owns the result; a replaced file cannot show an old preview. */
export function useDiffPreview(original?: string, current?: string) {
  const [result, setResult] = useState<{ original: string; current: string; preview: DiffPreview }>();
  useEffect(() => {
    if (original === undefined || current === undefined) return;
    const controller = new AbortController();
    void diffLinesAsync(original, current, controller.signal).then((preview) => {
      if (!controller.signal.aborted) setResult({ original, current, preview });
    }, () => {});
    return () => controller.abort();
  }, [original, current]);
  return result?.original === original && result?.current === current ? result?.preview : undefined;
}
