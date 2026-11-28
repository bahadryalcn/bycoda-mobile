import { View } from "react-native";
import { NavigationGroup, NavigationRow } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { GroupHeading } from "@/ui/group-heading";
import { useCopy } from "@/ui/copy";
import type { RecentPick } from "./recent-models";

/** Recently used models as one-tap rows above the provider rail; nothing when there are none. */
export function PickerRecents({ picks, disabled, onPick }: {
  picks: readonly RecentPick[];
  disabled?: boolean;
  onPick: (pick: RecentPick) => void;
}) {
  const copy = useCopy();
  if (!picks.length) return null;
  return (
    <View>
      <GroupHeading title={copy("Son kullanılanlar", "Recent")} />
      <NavigationGroup>
        {picks.map((pick) => (
          <NavigationRow
            key={pick.key}
            label={pick.label}
            detail={pick.detail}
            icon={<ProviderAccountMark provider={pick.account.choice.provider} color={pick.account.choice.color} />}
            intent="command"
            disabled={disabled}
            onPress={() => onPick(pick)}
          />
        ))}
      </NavigationGroup>
    </View>
  );
}
