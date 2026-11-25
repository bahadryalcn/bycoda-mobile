import { ButtonGroup } from "panelui-native/components/button-group";
import { Button } from "./buttons";

export type GroupAction = { id: string; label: string; onPress: () => void; disabled?: boolean; busy?: boolean };

/**
 * Peer actions on one subject (for example a text selection: Add, Quote, Translate, Copy), drawn as
 * one joined PanelUI button group that spans its container with equal segments.
 */
export function ActionGroup({ label, actions }: { label: string; actions: readonly GroupAction[] }) {
  return (
    <ButtonGroup accessibilityRole="toolbar" accessibilityLabel={label} fullWidth style={{ alignSelf: "stretch" }}>
      {actions.map((action) => (
        <Button
          key={action.id}
          label={action.label}
          tone="quiet"
          density="regular"
          disabled={action.disabled}
          busy={action.busy}
          onPress={action.onPress}
          style={{ flex: 1, borderRadius: 0 }}
        />
      ))}
    </ButtonGroup>
  );
}
