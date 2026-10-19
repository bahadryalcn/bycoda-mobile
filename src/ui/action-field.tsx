import { View } from "react-native";
import { Input } from "./fields";
import { Button } from "./buttons";
import { Body } from "./typography";
import { uiStyles } from "./styles";
import { space } from "./tokens";
import { useMobileTheme } from "./theme";
import type { InputProps } from "./component-props";

/** An address/query and its command share a row, while labels can still grow. */
export function ActionField({ actionLabel, onAction, actionDisabled, actionBusy, ...input }: InputProps & {
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  actionBusy?: boolean;
}) {
  useMobileTheme();
  return <View style={uiStyles.field}>
    <Body style={uiStyles.fieldLabel}>{input.label}</Body>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      <Input {...input} style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 }, input.style]} />
      <Button label={actionLabel} tone="primary" disabled={actionDisabled} busy={actionBusy} onPress={onAction} />
    </View>
  </View>;
}
