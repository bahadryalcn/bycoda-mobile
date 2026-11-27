import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { Empty, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { ProviderInboxBrowse } from "./provider-browse";
import { useInboxLocalScope } from "./inbox-local-scope";
import { inboxOriginKey } from "./provider-model";
import { pushOnce } from "@/ui/navigation";

export function ProviderInboxScreen({ embedded = false, openJira = false }: { embedded?: boolean; openJira?: boolean }) {
  const machine = useActiveMachine();
  const { projectId } = useInboxLocalScope();
  const copy = useCopy();

  if (!machine) {
    return (
      <Screen title={embedded ? undefined : copy("Servis gelen kutusu", "Provider inbox")} scroll={false}>
        <View style={{ flex: 1 }}>
          <Empty
            compact={false}
            illustration="connect-computer"
            title={copy("Bir bilgisayar seçin", "Choose a computer")}
            detail={copy("Servis gelen kutusunu görmek için bir bilgisayar bağla.", "Connect a computer to see its provider inbox.")}
            action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => pushOnce("/machines") }}
          />
        </View>
      </Screen>
    );
  }

  const origin = { machineId: machine.id, projectId };
  return <ProviderInboxBrowse key={inboxOriginKey(origin)} origin={origin} embedded={embedded} openJira={openJira} />;
}
