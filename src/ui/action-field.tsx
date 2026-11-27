import type { ReactNode } from "react";
import { View } from "react-native";
import { Input } from "./fields";
import { Button, IconButton } from "./buttons";
import { HintLabel } from "./info-hint";
import { FieldError } from "./feedback";
import { space } from "./tokens";
import { useMobileTheme } from "./theme";
import type { InputProps } from "./component-props";

/**
 * An address/query and its command share a row, while labels can still grow. With `actionIcon`
 * it is one compact address bar: the command sits inside the field's trailing edge (named by
 * `actionLabel` for screen readers), the keyboard's Go key runs it, and `label` stays spoken only.
 */
export function ActionField({ actionLabel, onAction, actionDisabled, actionBusy, actionIcon, ...input }: InputProps & {
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  actionBusy?: boolean;
  actionIcon?: ReactNode;
}) {
  const { uiStyles } = useMobileTheme();
  if (actionIcon)
    return <View style={uiStyles.field}>
      <Input {...input} returnKeyType="go" enablesReturnKeyAutomatically
        onSubmitEditing={(event) => { input.onSubmitEditing?.(event); if (!actionDisabled && !actionBusy) onAction(); }}
        trailing={<IconButton label={actionLabel} disabled={actionDisabled} busy={actionBusy} onPress={onAction}>{actionIcon}</IconButton>} />
      {input.error ? <FieldError message={input.error} /> : null}
    </View>;
  // Same label and error presentation as Field: HintLabel above, FieldError below the row.
  return <View style={uiStyles.field}>
    {input.label ? <HintLabel label={input.label} help={input.hint} /> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      <Input {...input} style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 }, input.style]} />
      <Button label={actionLabel} tone="primary" disabled={actionDisabled} busy={actionBusy} onPress={onAction} />
    </View>
    {input.error ? <FieldError message={input.error} /> : null}
  </View>;
}
