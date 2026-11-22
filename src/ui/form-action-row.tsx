import { use, useCallback, useState } from "react";
import { ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Button } from "./buttons";
import { FormActionBusy, FormActionScrollOwner } from "./form-action-context";
import { useCopy } from "./copy";
import { UnsavedBadge } from "./unsaved-badge";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";
import type { FormActionsProps } from "./component-props";

/** Presentation only: the editor keeps its values, guards and current callbacks. */
export function FormActionRow({
  feedback, submitLabel, submitRef, onSubmit, onCancel, cancelLabel, cancelDisabled, allowCancelWhileBusy = false,
  busy, disabled, tone = "primary", dirty, scrollFeedback,
  feedbackPlacement,
}: FormActionsProps & { scrollFeedback?: boolean; feedbackPlacement?: "before" | "after" }) {
  useMobileTheme();
  const copy = useCopy();
  const surroundingScroller = use(FormActionScrollOwner);
  const placement = feedbackPlacement ?? (surroundingScroller ? "after" : "before");
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
      {placement === "before" ? feedbackRegion : null}
      {dirty ? <View style={{ marginBottom: space.sm }}><UnsavedBadge /></View> : null}
      {/* Mobile action stack: full-width primary, centered quiet cancel below it. */}
      <View style={{ gap: space.xs, alignItems: "stretch" }}>
        <Button ref={submitRef} label={submitLabel} onPress={onSubmit} busy={busy} disabled={disabled} tone={tone} fullWidth />
        {onCancel ? <Button label={cancelLabel ?? copy("Vazgeç", "Cancel")} onPress={onCancel}
          disabled={cancelDisabled || busy && !allowCancelWhileBusy} tone="quiet"
          style={{ alignSelf: "center" }} /> : null}
      </View>
      {placement === "after" ? feedbackRegion : null}
    </View>
  );
}
