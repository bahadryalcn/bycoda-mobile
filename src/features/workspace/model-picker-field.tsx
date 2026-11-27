import { useState } from "react";
import { Text, View } from "react-native";
import { Body, NavigationRow, PressableCard } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { ModelPicker, type ModelPickerProps } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";

/** Form field that shows the current provider, model and effort and opens the model picker sheet. */
export function ModelPickerField({ hideLabel, label, variant = "field", ...props }: Omit<ModelPickerProps, "visible" | "onClose"> & {
  /** The compact picker trigger keeps its accessible label without a separate caption. */
  hideLabel?: boolean;
  /** The field's name when "Model" alone is ambiguous, such as the assistant's reply model. */
  label?: string;
  /** "row" is a settings row like `SelectField variant="row"`, for use inside NavigationGroup. */
  variant?: "field" | "row";
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const fieldLabel = label ?? copy("Model", "Model");
  const [open, setOpen] = useState(false);
  const { choice, models, model, settings, disabled } = props;
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const name = selected?.name ?? (model || copy("Model seç…", "Select model…"));
  const summary = settingsSummary(selected, settings, settingLabels(copy));
  const second = [choice ? [choice.label, choice.detail].filter(Boolean).join(" · ") : "", summary]
    .filter(Boolean)
    .join(" · ");
  if (variant === "row") return <ModelPickerRow label={fieldLabel} name={name} second={second} open={open}
    onOpen={() => setOpen(true)} {...props} onClose={() => setOpen(false)} />;
  return (
    <View style={uiStyles.field}>
      {hideLabel ? null : <Text style={uiStyles.fieldLabel}>{fieldLabel}</Text>}
      <PressableCard
        role="combobox"
        label={`${fieldLabel}: ${name}${second ? `, ${second}` : ""}`}
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
            <Body muted selectable={false} style={uiStyles.caption}>
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

/** The settings-row form: label and current model on one line, provider and effort beneath the label. */
function ModelPickerRow({ label, name, second, open, onOpen, onClose, ...props }: Omit<ModelPickerProps, "visible"> & {
  label: string; name: string; second: string; open: boolean; onOpen(): void;
}) {
  const { colors } = useMobileTheme();
  const { choice, disabled } = props;
  return (
    <>
      <NavigationRow
        label={label}
        detail={second || undefined}
        accessibilityLabel={`${label}: ${name}${second ? `, ${second}` : ""}`}
        intent="command"
        disabled={disabled}
        onPress={onOpen}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {choice ? <ProviderAccountMark provider={choice.provider} color={choice.color} size={18} /> : null}
            <Body muted selectable={false} style={{ flexShrink: 1 }}>{name}</Body>
            <ChevronsUpDown size={16} strokeWidth={2} color={colors.tertiary} />
          </View>
        }
      />
      <ModelPicker {...props} visible={open} onClose={onClose} />
    </>
  );
}
