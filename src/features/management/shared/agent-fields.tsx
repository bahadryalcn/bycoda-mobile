import { useCopy } from "@/ui/copy";
import { useState } from "react";
import { catalogProviders } from "@/features/workspace/catalog";
import { IntegerTextStepper } from "@/ui/limit-presets";
import { QueryState, SelectField } from "@/ui/primitives";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentFieldsProps } from "./types";
import { ModelSelectionField } from "@/features/workspace/model-selection/model-selection-field";
import { validAgentRunMinutes } from "../agent-model";

export function AgentFields({ part, ...props }: AgentFieldsProps) {
  return part === "settings" ? (
    <AgentSettingsFields {...props} />
  ) : (
    <AgentSelectionField {...props} />
  );
}

function AgentSelectionField({ value, onChange, projectId, disabled, routingRole }: AgentFieldsProps) {
  const machine = useActiveMachine();
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    {},
  );
  // The one model selection of the app: grouped provider/account/model picker with effort,
  // inside Use settings | Any model | Fixed where the computer supports model routing.
  return (
    <>
      <ModelSelectionField
        value={value}
        onChange={onChange}
        catalog={models.data}
        providers={catalogProviders(machine?.providers, models.data)}
        routingRole={routingRole}
        disabled={disabled}
      />
      <QueryState query={models} loading="inline" />
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
