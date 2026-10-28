import { useState } from "react";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Button, ErrorText, Notice, SearchField } from "@/ui/primitives";
import { matchesSearch } from "../shared/search";
import type { SocialCollectionPage } from "./types";

/** Filters the host's existing scoped collection without adding a scroll owner. */
export function useCollectionSearch<T>(items: readonly T[], text: (item: T) => string, page?: SocialCollectionPage) {
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const visible = page ? (page.loading ? [] : [...items]) : items.filter((item) => matchesSearch(text(item), search, locale));
  return { search: page?.search ?? search, setSearch: page?.setSearch ?? setSearch, visible,
    total: page?.page?.total ?? items.length, loading: page?.loading, invalidSearch: page?.invalidSearch, remote: !!page };
}

export function CollectionSearch({ search, setSearch, total, visible, loading, invalidSearch, remote }: {
  search: string;
  setSearch: (value: string) => void;
  total: number;
  visible: readonly unknown[];
  loading?: boolean;
  invalidSearch?: boolean;
  remote?: boolean;
}) {
  const copy = useCopy();
  if (!total && !search) return null;
  return <>
    <SearchField label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />
    {invalidSearch ? <ErrorText error={copy("Aramayı 1000 karakter veya daha az olacak şekilde kısaltın.", "Shorten the search to 1000 characters or fewer.")} /> : null}
    {!!search.trim() && !visible.length && !loading && !invalidSearch && (total || remote ? <Notice tone="info" message={copy("Eşleşen sonuç yok", "No matching results")}>
      <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} />
    </Notice> : <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} />)}
  </>;
}
