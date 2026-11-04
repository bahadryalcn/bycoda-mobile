import { useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

/** Bounded batches for mixed section pages that already own a vertical scroller. */
export function PagedRows<T>({ items, renderItem, beforeRows }: { items: readonly T[]; renderItem: (item: T) => ReactNode; beforeRows?: (visible: readonly T[]) => ReactNode }) {
  const copy = useCopy();
  const [limit, setLimit] = useState(20);
  const visible = items.slice(0, limit);
  return <>
    {beforeRows?.(visible)}
    {visible.map(renderItem)}
    {items.length > limit && <Button tone="quiet" label={copy("Daha fazla göster", "Show more")} onPress={() => setLimit((value) => value + 20)} />}
  </>;
}
