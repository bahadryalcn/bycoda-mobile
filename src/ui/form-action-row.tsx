import { use, useCallback, useState } from "react";
import { ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { Button } from "./buttons";
import { FormActionBusy, FormActionScrollOwner } from "./form-action-context";
import { useCopy } from "./copy";
import { UnsavedBadge } from "./unsaved-badge";
import { useMobileTheme } from "./theme";
import { metrics, radii, space } from "./tokens";
import type { FormActionsProps } from "./component-props";

/** Presentation only: the editor keeps its values, guards and current callbacks. */
export function FormActionRow({
  feedback, submitLabel, submitRef, onSubmit, onCancel, cancelLabel, cancelDisabled, allowCancelWhileBusy = false,
  busy, disabled, tone = "primary", dirty, scrollFeedback,
  feedbackPlacement,
}: FormActionsProps & { scrollFeedback?: boolean; feedbackPlacement?: "before" | "after" }) {
  const { semanticColors } = useMobileTheme();
  const copy = useCopy();
  // With the keyboard open the actions take one row so a long form keeps room for its fields.
  const compact = useKeyboardState((state) => state.isVisible);
  const surroundingScroller = use(FormActionScrollOwner);
  const placement = disabled && !busy ? "before" : feedbackPlacement ?? (surroundingScroller ? "after" : "before");
  const scrollsFeedback = scrollFeedback ?? !surroundingScroller;
  const { height } = useWindowDimensions();
  const [feedbackHeight, setFeedbackHeight] = useState(0);
  const measureFeedback = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (!Number.isFinite(layout.height) || layout.height < 0) return;
    setFeedbackHeight(current => Math.abs(current - layout.height) < 1 ? current : layout.height);
  }, []);
  const spacing = feedbackHeight > 0 ? space.sm : 0;
  const feedbackStyle = placement === "after" ? { marginTop: spacing } : { marginBottom: spacing };
  const feedbackContent = <View onLayout={measureFeedback} style={{ gap: space.sm }}>
    <FormActionBusy value={!!busy}>{feedback}</FormActionBusy>
  </View>;
  const feedbackRegion = feedback ? scrollsFeedback ? (
    <ScrollView
      style={{ maxHeight: Math.max(metrics.touchTarget, height * 0.25), flexShrink: 1, ...feedbackStyle }}
      keyboardShouldPersistTaps="handled"
    >{feedbackContent}</ScrollView>
  ) : <View style={feedbackStyle}>{feedbackContent}</View> : null;
  return (
    <View>
      {dirty && !compact ? <View style={{ marginBottom: space.sm }}><UnsavedBadge /></View> : null}
      {placement === "before" ? feedbackRegion : null}
      {/* Mobile action stack: full-width primary, centered quiet cancel below it. With the keyboard
          open: one row, quiet cancel left and primary right. The same nodes keep focus across both. */}
      <View style={compact
        ? { flexDirection: "row-reverse", alignItems: "center", gap: space.sm }
        : { flexDirection: "column", gap: space.xs, alignItems: "stretch" }}>
        <Button ref={submitRef} label={submitLabel} onPress={onSubmit} busy={busy} disabled={disabled} tone={tone}
          fullWidth={!compact} style={compact ? { flexGrow: 1, flexShrink: 1 } : undefined} />
        {onCancel ? <Button label={cancelLabel ?? copy("Vazgeç", "Cancel")} onPress={onCancel}
          disabled={cancelDisabled || busy && !allowCancelWhileBusy} tone="quiet"
          style={{ alignSelf: "center" }} /> : null}
        {dirty && compact ? (
          <View accessible accessibilityRole="text" accessibilityLabel={copy("Değişiklikler kaydedilmedi", "Unsaved changes")}
            style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: semanticColors.warning.text }} />
        ) : null}
      </View>
      {placement === "after" ? feedbackRegion : null}
    </View>
  );
}
