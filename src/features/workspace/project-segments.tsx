import { SegmentedControl } from "@/ui/segmented-control";

/** Text-only segmented control for the project views: equal-width segments, the active one raised; large text falls back to the shared selector. */
export function ProjectSegments<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl
      label={label}
      hideLabel
      compact={false}
      value={value}
      options={options}
      disabled={disabled}
      onChange={(next) => { if (next !== value) onChange(next); }}
    />
  );
}
