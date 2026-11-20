import { Folder, Layers } from "./duotone-icon";
import LineFolder from "lucide-react-native/icons/folder";
import LineLayers from "lucide-react-native/icons/layers";
import { useId, useState } from "react";
import { Image } from "expo-image";
import { View } from "react-native";
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Pattern, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { HostProjectAppearance } from "../../../src/features/connections/model/protocol";
import { useMobileTheme } from "./theme";

const TEXTURE_LINES = ["const<>();{}[]", "01=>let:{};/", "</>run(x);01"];
const ROW_PITCH = 1.25;
// Rows 2 and 3 repeat every 6 rows, so one 6-row tile reproduces the 19-row texture
// with a fraction of the text nodes; each icon instance tiles it instead of mounting 19 texts.
const TILE_ROWS = 6;
const TILE_WIDTH = 48; // covers the 42-character line from x=-0.3 without a visible seam.
const TILE_HEIGHT = TILE_ROWS * ROW_PITCH;

/** Project identity only. Session activity belongs to a separate, labelled status. */
export function ProjectIcon({ appearance, group = false, size = 20, box = 32 }: {
  appearance?: HostProjectAppearance;
  group?: boolean;
  size?: number;
  /** Square footprint; rows that show the icon beside meta text use a smaller one. */
  box?: number;
}) {
  const { colors } = useMobileTheme();
  const clipId = `project-${useId().replace(/:/g, "")}`;
  const [failedLogo, setFailedLogo] = useState<string>();
  const color = appearance?.color ?? colors.muted;
  const logo = appearance?.logo;
  const textured = size >= 24;
  const Fallback = size < 20 ? (group ? LineLayers : LineFolder) : (group ? Layers : Folder);
  return (
    <View accessible={false} style={{ width: box, height: box, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      {logo && failedLogo !== logo ? (
        <Image key={logo} source={{ uri: logo }} style={{ width: size, height: size }} contentFit="cover"
          recyclingKey={logo} onError={() => setFailedLogo(logo)} accessible={false} />
      ) : appearance?.icon ? (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
          <Defs>
            {textured ? <ClipPath id={clipId}><Path d={appearance.icon.path} clipRule="evenodd" /></ClipPath> : null}
            <LinearGradient id={`${clipId}-ink`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={color} />
              <Stop offset="0.5" stopColor={appearance.icon.highlight} />
              <Stop offset="1" stopColor={color} />
            </LinearGradient>
            {textured ? <Pattern id={`${clipId}-texture`} x={-1} y={0} width={TILE_WIDTH} height={TILE_HEIGHT} patternUnits="userSpaceOnUse">
              {Array.from({ length: TILE_ROWS }, (_, row) => (
                <SvgText key={row} x={row % 2 ? -0.3 : 0} y={1.3 + row * ROW_PITCH} fontFamily="monospace" fontSize={1.75} fontWeight="700"
                  fill={`url(#${clipId}-ink)`}>
                  {TEXTURE_LINES[row % 3].repeat(3)}
                </SvgText>
              ))}
            </Pattern> : null}
          </Defs>
          <Path d={appearance.icon.path} fill={textured ? color : `url(#${clipId}-ink)`} fillOpacity={0.52} stroke={color} strokeWidth={0.9} fillRule="evenodd" />
          {textured ? <G clipPath={`url(#${clipId})`}>
            <Rect x={0} y={0} width={24} height={24} fill={`url(#${clipId}-texture)`} />
          </G> : null}
        </Svg>
      ) : <Fallback size={size} strokeWidth={1.8} color={color} />}
    </View>
  );
}
