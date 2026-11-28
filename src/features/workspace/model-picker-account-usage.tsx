import { useUsageLimitsReport } from "../tools/usage-limits";
import { PickerAccountRows, type PickerAccountRowsProps } from "./model-picker-accounts";

/**
 * Account rows with the connected computer's quota report. Reads the Limits feature's cached
 * report without a poller of its own; mounted only while the rows are on screen.
 */
export function MachinePickerAccountRows(props: PickerAccountRowsProps) {
  const { query } = useUsageLimitsReport({ poll: false });
  // The raw report keeps every account id; the presented one may fold the default login away.
  return <PickerAccountRows {...props} usage={query.data} />;
}
