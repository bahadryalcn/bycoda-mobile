import { useCopy } from "@/ui/copy";
import { useRef, useState, type ComponentRef } from "react";
import { ErrorText } from "@/ui/primitives";
import { Body, Button, Disclosure, Field, IdentifierField, NavigationRow, QueryState, ScreenList, SearchField, SelectField, Sheet } from "@/ui/primitives";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentFieldsProps } from "./types";
import { providerSelectionOption } from "@/ui/provider-identity";
import { agentModelChoices, selectAgentModel, selectAgentProvider } from "./agent-model-selection";

export function AgentFields({ value, onChange, projectId, disabled, onValidityChange, showRunLimit = true }: AgentFieldsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [minutes, setMinutes] = useState(String(value.maxRunMinutes));
  const modelInput = useRef<ComponentRef<typeof IdentifierField>>(null);
  const [choosingModel, setChoosingModel] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const minutesValid = /^\d+$/.test(minutes) && Number(minutes) <= 10080;
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    { enabled: !!projectId },
  );
  const available = models.data?.models[value.harness] ?? [];
  const choices = agentModelChoices(models.data, value.harness, modelSearch);
  return (
    <>
      <SelectField
        label={copy("Ajan", "Agent")}
        value={value.harness}
        options={(machine?.providers ?? []).map(providerSelectionOption)}
        disabled={disabled}
        onChange={(harness) => {
          if (harness !== value.harness)
            onChange(selectAgentProvider(value, harness, models.data));
        }}
      />
      {!machine?.providers?.length && (
        <Body muted>
          {copy(
            "Bu bilgisayardaki ajanlar henüz alınamadı. Bağlantıyı yenileyin.",
            "Available agents on this computer have not been loaded. Refresh the connection.",
          )}
        </Body>
      )}
      <IdentifierField
          ref={modelInput}
          label={copy("Model", "Model")}
          value={value.model}
          onChangeText={(model) => onChange(selectAgentModel(value, model, models.data))}
          editable={!disabled}
          placeholder={copy("Bilgisayardaki model kimliği", "Model ID on the computer")}
          hint={copy("Model kimliği girin veya katalogdan seçin. Özel model kimlikleri kullanılabilir.", "Enter a model ID or choose from the catalogue. Custom model IDs are supported.")}
        />
      <Button
        tone="quiet"
        label={copy("Katalogdan seç", "Choose from catalogue")}
        disabled={disabled || !available.length}
        onPress={() => { setModelSearch(""); setChoosingModel(true); }}
      />
      <Sheet visible={choosingModel} title={copy("Model seç", "Choose model")} size="full" scroll={false}
        onClose={() => setChoosingModel(false)} returnFocusRef={modelInput}>
        <ScreenList
          data={choices}
          keyExtractor={(item) => item.value}
          header={<SearchField label={copy("Model ara", "Search models")} value={modelSearch} onChangeText={setModelSearch} />}
          ListEmptyComponent={<Body muted>{copy("Eşleşen model yok. Model kimliğini doğrudan girmek için bu listeyi kapatın.", "No matching models. Close this list to enter a model ID directly.")}</Body>}
          renderItem={({ item }) => <NavigationRow label={item.label} detail={item.detail} selected={value.model === item.value}
            disabled={disabled} onPress={() => {
              if (disabled) return;
              onChange(selectAgentModel(value, item.value, models.data));
              setChoosingModel(false);
            }} />}
        />
      </Sheet>
      <Disclosure label={copy("Ajan ayarları", "Agent settings")}>
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
        {showRunLimit ? <><Field
          label={copy(
            "Çalışma sınırı (dakika, 0 = sınırsız)",
            "Run limit (minutes, 0 = unlimited)",
          )}
          value={minutes}
          onChangeText={(text) => {
            setMinutes(text);
            const valid = /^\d+$/.test(text) && Number(text) <= 10080;
            onValidityChange?.(valid);
            if (valid) onChange({ ...value, maxRunMinutes: Number(text) });
          }}
          editable={!disabled}
          keyboardType="number-pad"
        />
        {!minutesValid && <ErrorText error={copy("0 ile 10080 arasında dakika girin.", "Enter minutes from 0 to 10080.")} />}</> : null}
      </Disclosure>
      <QueryState query={models} loading="inline" />
    </>
  );
}
