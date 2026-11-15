import { useState } from "react";
import { Text, View } from "react-native";
import { Body, PressableCard } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import { ModelPicker, type ModelPickerProps } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";

/** Form field that shows the current provider, model and effort and opens the model picker sheet. */
export function ModelPickerField(props: Omit<ModelPickerProps, "visible" | "onClose">) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const { choice, models, model, settings, disabled } = props;
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const name = selected?.name ?? (model || copy("Model seç…", "Select model…"));
  const summary = settingsSummary(selected, settings, settingLabels(copy));
  const second = [choice ? [choice.label, choice.detail].filter(Boolean).join(" · ") : "", summary]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={uiStyles.field}>
      <Text style={uiStyles.fieldLabel}>{copy("Model", "Model")}</Text>
      <PressableCard
        role="combobox"
        label={`${copy("Model", "Model")}: ${name}${second ? `, ${second}` : ""}`}
        expanded={open}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          uiStyles.input,
          open && { borderColor: colors.accent },
          {
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            minHeight: metrics.touchTarget,
            marginHorizontal: 0,
          },
        ]}
      >
        {choice ? (
          <ProviderAccountMark provider={choice.provider} color={choice.color} size={22} />
        ) : null}
        <View style={uiStyles.grow}>
          <Body numberOfLines={1} selectable={false}>
            {name}
          </Body>
          {second ? (
            <Body muted numberOfLines={1} selectable={false} style={uiStyles.caption}>
              {second}
            </Body>
          ) : null}
        </View>
        <DisclosureChevron
          expanded={open}
          size={16}
          color={colors.muted}
          closedAngle={90}
          openAngle={270}
        />
      </PressableCard>
      <ModelPicker {...props} visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}
