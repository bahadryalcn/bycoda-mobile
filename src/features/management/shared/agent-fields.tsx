import { Cpu } from "@/ui/duotone-icon";
import { useCopy } from "@/ui/copy";
import { useRef, useState } from "react";
import type { HostInstance } from "react-native";
import { catalogProviders } from "@/features/workspace/catalog";
import { IntegerTextStepper } from "@/ui/limit-presets";
import { NavigationRow, QueryState, RowIcon, SelectField } from "@/ui/primitives";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentFieldsProps } from "./types";
import { providerSelectionOption } from "@/ui/provider-identity";
import { selectAgentModel, selectAgentProvider } from "./agent-model-selection";
import { AgentModelPicker } from "./agent-model-picker";
import { validAgentRunMinutes } from "../agent-model";

export function AgentFields({ part, ...props }: AgentFieldsProps) {
  return part === "settings" ? (
    <AgentSettingsFields {...props} />
  ) : (
    <AgentSelectionField {...props} />
  );
}

function AgentSelectionField({ value, onChange, projectId, disabled }: AgentFieldsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [choosingModel, setChoosingModel] = useState(false);
  const modelTrigger = useRef<HostInstance>(null);
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    {},
  );
  const available = models.data?.models[value.harness] ?? [];
  const options = catalogProviders(machine?.providers, models.data).map(providerSelectionOption);
  const providerLabel =
    options.find((option) => option.value === value.harness)?.label ?? value.harness;
  const modelLabel =
    available.find((model) => model.id === value.model || model.nativeId === value.model)?.name ||
    value.model;
  const label = copy("Ajan ve model", "Agent and model");
  return (
    <>
      <NavigationRow
        ref={modelTrigger}
        label={label}
        detail={[providerLabel, modelLabel || copy("Model seç", "Choose model")]
          .filter(Boolean)
          .join(" · ")}
        detailLines={2}
        icon={<RowIcon glyph={Cpu} />}
        disabled={disabled}
        onPress={() => setChoosingModel(true)}
      />
      {choosingModel ? (
        <AgentModelPicker
          key={value.harness}
          catalog={models.data}
          query={models}
          harness={value.harness}
          selected={value.model}
          disabled={disabled}
          returnFocusRef={modelTrigger}
          title={label}
          providerField={
            <SelectField
              label={copy("Ajan", "Agent")}
              value={value.harness}
              options={options}
              disabled={disabled || !options.length}
              onChange={(harness) => {
                if (harness !== value.harness)
                  onChange(selectAgentProvider(value, harness, models.data));
              }}
            />
          }
          onSelect={(model) => onChange(selectAgentModel(value, model, models.data))}
          onClose={() => setChoosingModel(false)}
        />
      ) : (
        <QueryState query={models} loading="inline" />
      )}
    </>
  );
}

function AgentSettingsFields({
  value,
  onChange,
  disabled,
  onValidityChange,
  showRunLimit = true,
}: AgentFieldsProps) {
  const copy = useCopy();
  const [minutes, setMinutes] = useState(String(value.maxRunMinutes));
  const minutesValid = validAgentRunMinutes(minutes);
  return (
    <>
      <SelectField
        label={copy("İzinler", "Permissions")}
        value={value.runtimeMode}
        options={[
          { value: "supervised", label: copy("Onay iste", "Ask for approval") },
          {
            value: "auto-accept-edits",
            label: copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits"),
          },
          { value: "auto", label: copy("Otomatik inceleme", "Automatic review") },
          { value: "full-access", label: copy("Tam erişim", "Full access") },
        ]}
        disabled={disabled}
        onChange={(runtimeMode) => onChange({ ...value, runtimeMode })}
      />
      {showRunLimit ? (
        <IntegerTextStepper
          label={copy("Süre sınırı (dakika)", "Run limit (minutes)")}
          help={copy("0 = sınırsız", "0 = no limit")}
          min={0}
          max={10080}
          value={minutes}
          error={
            !minutesValid
              ? copy("0 ile 10080 arasında dakika girin.", "Enter minutes from 0 to 10080.")
              : undefined
          }
          onChangeText={(text) => {
            setMinutes(text);
            const valid = validAgentRunMinutes(text);
            onValidityChange?.(valid);
            if (valid) onChange({ ...value, maxRunMinutes: Number(text) });
          }}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}
