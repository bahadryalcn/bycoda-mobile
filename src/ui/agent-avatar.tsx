import { Image } from "expo-image";
import { View } from "react-native";
import UserRound from "lucide-react-native/icons/user-round";
import { colors, radii } from "./tokens";

const providers = {
  codex: require("../../../src/assets/providers/codex.svg"),
  claude: require("../../../src/assets/providers/claude.svg"),
  gemini: require("../../../src/assets/providers/gemini.svg"),
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
  const provider = author?.toLowerCase().split(/[\s·/]/)[0];
  const source = providers[provider as keyof typeof providers] ?? mark;
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
          contentFit="contain"
          style={{ width: size * 0.77, height: size * 0.77 }}
        />
      )}
    </View>
  );
}
