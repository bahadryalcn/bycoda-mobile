import { StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

export type UsageTab = "tokens" | "cost" | "limits";

/** The computer's bycoda does not serve this tab to the phone yet: the shared "Update needed" state. */
export function UsageUnavailable({ tab }: { tab: Exclude<UsageTab, "tokens"> }) {
  const copy = useCopy();
  return (
    <StateView
      size="compact"
      illustration="permission"
      title={copy("Güncelleme gerekiyor", "Update needed")}
      description={
        tab === "cost"
          ? copy(
              "Maliyeti görmek için bilgisayardaki bycoda’yı güncelle.",
              "Update bycoda on this computer to view cost.",
            )
          : copy(
              "Hesap limitlerini görmek için bilgisayardaki bycoda’yı güncelle.",
              "Update bycoda on this computer to view account limits.",
            )
      }
    />
  );
}
