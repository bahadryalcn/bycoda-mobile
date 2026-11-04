import type { ReactNode } from "react";
import { Body, Button, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { PagedRows } from "../shared/paged-rows";
import { pageNavigation } from "./workspace-query-model";
import type { SocialCollectionPage } from "./types";

/** A host page is already bounded; never apply a second local slice. */
export function CollectionRows<T>({ items, renderItem, page, beforeRows }: {
  items: readonly T[];
  renderItem(item: T): ReactNode;
  page?: SocialCollectionPage;
  beforeRows?: (visible: readonly T[]) => ReactNode;
}) {
  const copy = useCopy();
  if (!page) return <PagedRows items={items} renderItem={renderItem} beforeRows={beforeRows} />;
  const navigation = page.page && pageNavigation(page.page);
  return <>
    {beforeRows?.(page.loading ? [] : items)}
    {!page.loading && items.map(renderItem)}
    {navigation && !page.loading ? <>
      <Body muted>{copy("{p0}–{p1} / {p2}", "{p0}–{p1} / {p2}", { p0: navigation.first, p1: navigation.last, p2: page.page!.total })}</Body>
      {(navigation.hasPrevious || navigation.hasNext) ? <Row>
        <Button tone="quiet" label={copy("Önceki sayfa", "Previous page")} disabled={page.busy || !navigation.hasPrevious}
          onPress={() => page.onOffset(navigation.previous)} />
        <Button tone="quiet" label={copy("Sonraki sayfa", "Next page")} disabled={page.busy || !navigation.hasNext}
          onPress={() => page.onOffset(navigation.next)} />
      </Row> : null}
    </> : null}
  </>;
}
