import { useActiveMachine, useMachines } from "@/state/machines";
import { Empty, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { ProviderInboxBrowse } from "./provider-browse";
import { inboxOriginKey } from "./provider-model";

export function ProviderInboxScreen() {
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const copy = useCopy();

  if (!machine) {
    return (
      <Screen title={copy("Servis gelen kutusu", "Provider inbox")}>
        <Empty title={copy("Bir bilgisayar seçin", "Choose a computer")} />
      </Screen>
    );
  }

  const origin = { machineId: machine.id, projectId };
  return <ProviderInboxBrowse key={inboxOriginKey(origin)} origin={origin} />;
}
