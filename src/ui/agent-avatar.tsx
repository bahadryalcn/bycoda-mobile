import { useMobileTheme } from "./theme";
import { Image } from "expo-image";
import { View } from "react-native";
import UserRound from "lucide-react-native/icons/user-round";
import { radii } from "./tokens";
import { ProviderIcon } from "./provider-identity";
import type { RemoteProvider } from "@/domain/types";

const providers = {
  codex: require("../../../src/assets/providers/codex.svg"),
  claude: require("../../../src/assets/providers/claude.svg"),
};
const mark = require("../../../public/brand/bycoda/mark-white.png");

export function AgentAvatar({
  author,
  user = false,
  size = 30,
}: {
  author?: string;
  user?: boolean;
  size?: number;
}) {
  const { colors } = useMobileTheme();
  const provider = author?.toLowerCase().split(/[\s·/]/)[0];
  const providerSource = providers[provider as keyof typeof providers];
  const source = providerSource ?? mark;
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.control,
        backgroundColor: user ? colors.selected : colors.raised,
        borderWidth: 1,
        borderColor: colors.separator,
      }}
    >
      {user ? (
        <UserRound size={size * 0.57} color={colors.text} />
      ) : (
        <Image
          source={source}
          tintColor={providerSource ? undefined : colors.brand}
          contentFit="contain"
          style={{ width: size * 0.77, height: size * 0.77 }}
        />
      )}
    </View>
  );
}

/**
 * Provider glyph with the account colour as a small badge, so accounts of one provider stay
 * distinguishable. Decorative: always beside the provider or account name.
 */
export function ProviderAccountMark({ provider, color, size = 20 }: { provider: RemoteProvider; color?: string; size?: number }) {
  const { colors } = useMobileTheme();
  const dot = Math.max(7, Math.round(size * 0.42));
  return (
    <View accessible={false} style={{ width: size, height: size, flexShrink: 0 }}>
      <ProviderIcon provider={provider} size={size} />
      {color ? (
        <View
          style={{
            position: "absolute",
            right: -dot * 0.3,
            bottom: -dot * 0.3,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: colors.raised,
          }}
        />
      ) : null}
    </View>
  );
}
