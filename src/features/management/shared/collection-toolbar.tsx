import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { AppliedFilters, FilterButton, FilterChipRow } from "@/ui/filter-sheet";
import { SegmentedControl, SearchToolbar } from "@/ui/primitives";
import { space } from "@/ui/tokens";

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
 * One compact row: the shared `SearchToolbar` folds search into an icon beside the status filter
 * until it is opened or a query is active, and names an applied status at the row's start. The
 * project scope is the shared header pill (`scopeControl`), never a field here. The status
 * choices open below only on request.
 */
export function ManagementToolbar<T extends string>({
  search,
  actions,
  status,
}: {
  search: ReactNode;
  actions?: ReactNode;
  status?: StatusFilter<T>;
}) {
  const [showStatus, setShowStatus] = useState(false);
  const applied = !!status && status.value !== status.unfilteredValue;
  const statusShown = !!status && (status.filterable !== false || applied);
  const appliedLabel = applied ? status.options.find((option) => option.value === status.value)?.label : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <SearchToolbar
        search={search}
        leading={appliedLabel && !showStatus ? <AppliedFilters filters={[`${status!.label}: ${appliedLabel}`]} /> : undefined}
        actions={statusShown ? (
          <FilterButton
            label={status.label}
            count={applied ? 1 : 0}
            onPress={() => setShowStatus((current) => !current)}
          />
        ) : status ? null : actions}
      />
      {status && statusShown && showStatus ? (
        status.options.length <= 3 ? (
          <SegmentedControl
            hideLabel
            label={status.label}
            value={status.value}
            options={status.options}
            onChange={status.onChange}
          />
        ) : (
          <FilterChipRow label={status.label} value={status.value} options={status.options} onChange={status.onChange} />
        )
      ) : null}
    </View>
  );
}
