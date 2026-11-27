import type { ReactElement, ReactNode } from "react";
import { FilterChipRow } from "@/ui/filter-sheet";
import { SectionHeader, SegmentedControl, useCollapsibleSearch } from "@/ui/primitives";
import type { InputProps } from "@/ui/component-props";

type StatusFilter<T extends string> = {
  label: string;
  value: T;
  unfilteredValue: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** false when there is nothing to narrow: the trigger hides unless a filter is still applied. */
  filterable?: boolean;
};

/**
 * A management list's search and status filter, following the shared collection convention:
 * `actions` (search icon, then the filter icon with its dot) go in the page heading beside the
 * scope pills and before the create action; `sheet` is the one content-height sheet with the
 * search field and the status choices, applied live. No toolbar, chip or summary row sits in the
 * list. The project scope is the shared header pill, never a filter here.
 */
export function useManagementToolbar<T extends string>({ search, status, view, actions }: {
  search: ReactElement<InputProps>;
  status?: StatusFilter<T>;
  /** Live view choices (grouping, order) shown in the same sheet after the status filter. */
  view?: { label: string; filters: ReactNode; applied: number; onReset: () => void };
  /** Other list commands (a view-options trigger) that trail the search and filter icons. */
  actions?: ReactNode;
}): { actions: ReactNode; sheet: ReactNode } {
  const applied = !!status && status.value !== status.unfilteredValue;
  const statusShown = !!status && (status.filterable !== false || applied);
  const statusFilters = status && statusShown ? (
    <>
      <SectionHeader title={status.label} />
      {status.options.length <= 3 ? (
        <SegmentedControl hideLabel label={status.label} value={status.value} options={status.options} onChange={status.onChange} />
      ) : (
        <FilterChipRow wrap label={status.label} value={status.value} options={status.options} onChange={status.onChange} />
      )}
    </>
  ) : undefined;
  const filters = statusFilters || view ? <>{statusFilters}{view?.filters}</> : undefined;
  const collection = useCollapsibleSearch(search, {
    filters,
    // Search and status share one header control so the title and scope pills fit the top row.
    combined: true,
    filtersLabel: status?.label ?? view?.label,
    activeFilters: (applied ? 1 : 0) + (view?.applied ?? 0),
    onResetFilters: status || view ? () => {
      status?.onChange(status.unfilteredValue);
      view?.onReset();
    } : undefined,
  });
  return {
    actions: <>{collection.trigger}{collection.filterTrigger}{actions}</>,
    sheet: collection.sheet,
  };
}
