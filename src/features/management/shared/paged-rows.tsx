import { useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

/** Bounded batches for mixed section pages that already own a vertical scroller. */
export function PagedRows<T>({ items, renderItem }: { items: readonly T[]; renderItem: (item: T) => ReactNode }) {
  const copy = useCopy();
  const [limit, setLimit] = useState(20);
  return <>
    {items.slice(0, limit).map(renderItem)}
    {items.length > limit && <Button label={copy("Daha fazla göster", "Show more")} onPress={() => setLimit((value) => value + 20)} />}
  </>;
}
