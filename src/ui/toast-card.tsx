import { StyleSheet, View } from "react-native";
import { Toast } from "panelui-native/components/toast";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Info from "lucide-react-native/icons/info";
import { Button } from "./buttons";
import { useMobileTheme } from "./theme";
import { metrics, space, type SemanticTone } from "./tokens";
import { Body } from "./typography";

export type ToastTone = SemanticTone | "neutral";
export type ToastAction = { label: string; onPress: () => void };

export type ToastCardProps = {
  tone?: ToastTone;
  message: string;
  description?: string;
  action?: ToastAction;
  secondaryAction?: ToastAction;
};

const variants = { neutral: "default", info: "info", success: "success", warning: "warning", danger: "destructive" } as const;
const icons = { neutral: Info, info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/** Shared PanelUI toast with readable text and wrapping, full-size actions. */
export function ToastCard({ tone = "neutral", message, description, action, secondaryAction }: ToastCardProps) {
  const { colors, semanticColors } = useMobileTheme();
  const Icon = icons[tone];
  const color = tone === "neutral" ? colors.muted : semanticColors[tone].text;
  return (
    <Toast variant={variants[tone]} style={styles.card}>
      <View style={styles.message}>
        <View style={styles.indicator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon size={18} strokeWidth={2} color={color} />
        </View>
        <View style={styles.text}>
          <Body selectable={false} style={styles.title}>{message}</Body>
          {description ? <Body muted selectable={false}>{description}</Body> : null}
        </View>
      </View>
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {secondaryAction ? <Button {...secondaryAction} tone="quiet" reserveTouchTarget /> : null}
          {action ? <Button {...action} tone="secondary" reserveTouchTarget /> : null}
        </View>
      ) : null}
    </Toast>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center", width: "100%", maxWidth: metrics.entryWidth, flexDirection: "column",
    alignItems: "stretch", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  message: {
    minHeight: metrics.compactControlHeight, flexDirection: "row", alignItems: "center", gap: space.row,
  },
  indicator: { flexShrink: 0 },
  text: { flex: 1, minWidth: 0 },
  title: { fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.row },
});
