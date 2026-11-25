import { StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

export type UsageTab = "tokens" | "cost" | "limits";

/** Cost and limits come from provider accounts on the desktop; this Host does not serve them to the phone yet. */
export function UsageUnavailable({ tab }: { tab: Exclude<UsageTab, "tokens"> }) {
  const copy = useCopy();
  return (
    <StateView
      size="compact"
      illustration="permission"
      title={
        tab === "cost"
          ? copy("Bu bilgisayarda maliyet kullanılamıyor", "Cost is unavailable on this computer")
          : copy(
              "Bu bilgisayarda limitler kullanılamıyor",
              "Limits are unavailable on this computer",
            )
      }
      description={
        tab === "cost"
          ? copy(
              "Bilgisayardaki bycoda maliyeti hesaplıyor ancak ana makine bu değeri telefona henüz sunmuyor. Güncelleme gerekir.",
              "bycoda on the computer prices usage, but the Host does not serve cost to the phone yet. A Host update is needed.",
            )
          : copy(
              "Hesap limitleri ve sıfırlanma süreleri bilgisayardaki bycoda’da görünür; ana makine bunları telefona henüz sunmuyor. Güncelleme gerekir.",
              "Account limits and reset times are shown in bycoda on the computer; the Host does not serve them to the phone yet. A Host update is needed.",
            )
      }
    />
  );
}
