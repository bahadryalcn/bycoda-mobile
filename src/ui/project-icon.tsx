import Folder from "lucide-react-native/icons/folder";
import Layers from "lucide-react-native/icons/layers";
import { useId, useState } from "react";
import { Image } from "expo-image";
import { View } from "react-native";
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import type { HostProjectAppearance } from "../../../src/features/connections/model/protocol";
import { useMobileTheme } from "./theme";
import { colors } from "./tokens";

/** Project identity only. Session activity belongs to a separate, labelled status. */
export function ProjectIcon({ appearance, group = false, size = 20 }: {
  appearance?: HostProjectAppearance;
  group?: boolean;
  size?: number;
}) {
  useMobileTheme();
  const clipId = `project-${useId().replace(/:/g, "")}`;
  const [failedLogo, setFailedLogo] = useState<string>();
  const color = appearance?.color ?? colors.muted;
  const logo = appearance?.logo;
  const Fallback = group ? Layers : Folder;
  return (
    <View accessible={false} style={{ width: 32, height: 32, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      {logo && failedLogo !== logo ? (
        <Image key={logo} source={{ uri: logo }} style={{ width: size, height: size }} contentFit="cover"
          recyclingKey={logo} onError={() => setFailedLogo(logo)} accessible={false} />
      ) : appearance?.icon ? (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
          <Defs>
            <ClipPath id={clipId}><Path d={appearance.icon.path} clipRule="evenodd" /></ClipPath>
            <LinearGradient id={`${clipId}-ink`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={color} />
              <Stop offset="0.5" stopColor={appearance.icon.highlight} />
              <Stop offset="1" stopColor={color} />
            </LinearGradient>
          </Defs>
          <Path d={appearance.icon.path} fill={color} fillOpacity={0.52} stroke={color} strokeWidth={0.9} fillRule="evenodd" />
          <G clipPath={`url(#${clipId})`} fill={`url(#${clipId}-ink)`}>
            {Array.from({ length: 19 }, (_, row) => (
              <SvgText key={row} x={row % 2 ? -0.3 : 0} y={1.3 + row * 1.25} fontFamily="monospace" fontSize={1.75} fontWeight="700">
                {["const<>();{}[]", "01=>let:{};/", "</>run(x);01"][row % 3].repeat(3)}
              </SvgText>
            ))}
          </G>
        </Svg>
      ) : <Fallback size={size} strokeWidth={1.8} color={color} />}
    </View>
  );
}
