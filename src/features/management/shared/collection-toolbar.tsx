import { useState, type ReactNode } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { FilterButton } from "@/ui/filter-sheet";
import { ChoiceChip, SegmentedControl } from "@/ui/primitives";
import { space } from "@/ui/tokens";

type StatusFilter<T extends string> = {
  label: string;
  value: T;
  unfilteredValue: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function ManagementToolbar<T extends string>({
  project,
  search,
  actions,
  status,
}: {
  project: ReactNode;
  search: ReactNode;
  actions?: ReactNode;
  status?: StatusFilter<T>;
}) {
  const [showStatus, setShowStatus] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 112 * Math.max(1, fontScale), minWidth: 0 }}>
          {project}
        </View>
        <View style={{ flexGrow: 2, flexBasis: 136 * Math.max(1, fontScale), minWidth: 0 }}>
          {search}
        </View>
        {status ? (
          <FilterButton
            label={status.label}
            count={status.value === status.unfilteredValue ? 0 : 1}
            onPress={() => setShowStatus((current) => !current)}
          />
        ) : (
          actions
        )}
      </View>
      {status && showStatus ? (
        status.options.length <= 3 ? (
          <SegmentedControl
            hideLabel
            label={status.label}
            value={status.value}
            options={status.options}
            onChange={status.onChange}
          />
        ) : (
          <ScrollView
            horizontal
            accessibilityLabel={status.label}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ columnGap: space.sm, alignItems: "center" }}
          >
            {status.options.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                selected={status.value === option.value}
                onPress={() => status.onChange(option.value)}
              />
            ))}
          </ScrollView>
        )
      ) : null}
    </View>
  );
}
