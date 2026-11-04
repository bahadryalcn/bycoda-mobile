import { Badge, NavigationRow, Row } from "@/ui/primitives";

/** Issue identity owns the row width; workflow state wraps below it. */
export function IssueRecordRow({ label, detail, state, disabled, onPress }: {
  label: string;
  detail?: string;
  state: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return <NavigationRow label={label} detail={detail} detailLines={2}
    accessibilityLabel={[label, detail, state].filter(Boolean).join(". ")}
    supporting={state ? <Row><Badge label={state} /></Row> : undefined}
    disabled={disabled} onPress={onPress} />;
}
