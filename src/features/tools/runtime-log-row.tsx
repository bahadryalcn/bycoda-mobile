import { memo } from "react";
import { NavigationRow, StatusText } from "@/ui/primitives";
import { stamp } from "../management/shared/format";
import { logLevelTone } from "./runtime-log-presentation";
import type { RuntimeLogEntry } from "./types";

type RuntimeLogRowProps = {
  entry: RuntimeLogEntry;
  sourceLabel: string;
  levelLabel: string;
  onSelect: (entry: RuntimeLogEntry) => void;
};

/** Props are an unchanged entry plus plain labels, so a poll or keystroke leaves existing rows alone. */
export const RuntimeLogRow = memo(function RuntimeLogRow({ entry, sourceLabel, levelLabel, onSelect }: RuntimeLogRowProps) {
  const time = stamp(entry.timestamp);
  return (
    <NavigationRow
      label={entry.message}
      labelLines={2}
      detail={sourceLabel}
      metadata={time}
      accessibilityLabel={[entry.message, levelLabel, time, sourceLabel].filter(Boolean).join(". ")}
      supporting={<StatusText label={levelLabel} tone={logLevelTone(entry.level)} />}
      onPress={() => onSelect(entry)}
    />
  );
});
