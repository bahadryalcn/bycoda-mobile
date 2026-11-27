import { StateView } from "./state-view";
import { useCopy } from "./copy";

export type NoResultsProps = {
  /** A search is active (the trimmed query is not empty). */
  searching: boolean;
  /** Filters other than search narrow the collection. */
  filtered?: boolean;
  /** The list's own search wording, e.g. "No tools match your search."; defaults to "No matching results". */
  title?: string;
  /** The list's own filter wording, e.g. "No sessions match these filters."; defaults to "No items match these filters". */
  filtersTitle?: string;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  /** Inside a picker or small sheet: the quiet row form, without the mascot. */
  compact?: boolean;
};

/**
 * The one no-results state for every searchable or filtered collection: the search mascot, the
 * list's own "no … match" wording and the recovery as the primary action (Clear search while a
 * search is active, else Clear filters; with both, Clear filters is the quiet second action).
 * Pickers and small sheets use `compact`, the same wording and action without the mascot.
 */
export function NoResults({ searching, filtered = false, title, filtersTitle, onClearSearch, onClearFilters, compact = false }: NoResultsProps) {
  const copy = useCopy();
  const clearSearch = searching && onClearSearch ? { label: copy("Aramayı temizle", "Clear search"), onPress: onClearSearch } : undefined;
  const clearFilters = filtered && onClearFilters ? { label: copy("Filtreleri temizle", "Clear filters"), onPress: onClearFilters } : undefined;
  return (
    <StateView
      size={compact ? "compact" : "region"}
      illustration="search-empty"
      title={searching
        ? title ?? copy("Eşleşen sonuç yok", "No matching results")
        : filtersTitle ?? copy("Bu filtrede kayıt yok", "No items match these filters")}
      action={clearSearch ?? clearFilters}
      secondaryAction={clearSearch ? clearFilters : undefined}
    />
  );
}
