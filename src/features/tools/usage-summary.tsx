import { StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

export type UsageTab = "tokens" | "cost" | "limits";

/** Cost and limits come from provider accounts on the desktop; this Host does not serve them to the phone yet. */
export function UsageUnavailable({ tab }: { tab: Exclude<UsageTab, "tokens"> }) {
  const copy = useCopy();
  return (
    <StateView
      illustration="permission"
      title={tab === "cost" ? copy("Maliyet henüz telefona gelmiyor", "Cost is not available on mobile yet") : copy("Limitler henüz telefona gelmiyor", "Limits are not available on mobile yet")}
      description={tab === "cost"
        ? copy("Bilgisayardaki bycoda maliyeti hesaplıyor ancak ana makine bu değeri telefona henüz sunmuyor. Güncelleme gerekir.", "bycoda on the computer prices usage, but the Host does not serve cost to the phone yet. A Host update is needed.")
        : copy("Hesap limitleri ve sıfırlanma süreleri bilgisayardaki bycoda’da görünür; ana makine bunları telefona henüz sunmuyor. Güncelleme gerekir.", "Account limits and reset times are shown in bycoda on the computer; the Host does not serve them to the phone yet. A Host update is needed.")}
    />
  );
}
