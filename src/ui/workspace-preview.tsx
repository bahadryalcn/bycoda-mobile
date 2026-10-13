import { Fragment } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import MonitorSmartphone from "lucide-react-native/icons/monitor-smartphone";
import { Body } from "./typography";
import { useCopy } from "./copy";
import { colors, fontSize, radii, space } from "./tokens";

/** A diagram of the companion workflow, with no sample account or live status. */
export function WorkspacePreview() {
  const copy = useCopy();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={copy(
        "Bilgisayarındaki projelere, yapay zekâ oturumlarına ve bekleyen onaylara telefonundan eriş.",
        "Access your computer’s projects, AI sessions and pending approvals from your phone.",
      )}
      style={{
        backgroundColor: colors.panel,
        borderWidth: 0,
        borderRadius: radii.preview,
        borderCurve: "continuous",
        padding: space.lg,
        gap: space.md,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <MonitorSmartphone size={16} color={colors.muted} />
        <Body muted style={{ fontSize: fontSize.small, lineHeight: 19 }}>
          {copy("Bilgisayarından telefonuna", "From your computer to your phone")}
        </Body>
      </View>
      <Svg
        width="100%"
        viewBox="0 0 340 190"
        style={{ width: "100%", aspectRatio: 340 / 190 }}
        accessible={false}
      >
        <Rect
          x="4"
          y="10"
          width="270"
          height="152"
          rx="8"
          fill={colors.background}
          stroke={colors.border}
        />
        <Line x1="4" y1="36" x2="274" y2="36" stroke={colors.border} />
        {[17, 27, 37].map((x) => (
          <Circle key={x} cx={x} cy="23" r="2.5" fill={colors.muted} opacity={0.5} />
        ))}
        <Rect x="101" y="20" width="69" height="5" rx="2.5" fill={colors.muted} opacity={0.25} />
        <Line x1="76" y1="36" x2="76" y2="162" stroke={colors.border} />
        {[54, 77, 100].map((y, index) => (
          <Fragment key={y}>
            <Path
              d={`M17 ${y}h8l2 3h11v11H17z`}
              stroke={index === 0 ? colors.text : colors.muted}
              fill="none"
              strokeWidth="1.4"
            />
            <Line
              x1="44"
              y1={y + 7}
              x2="62"
              y2={y + 7}
              stroke={colors.muted}
              strokeWidth="3"
              strokeLinecap="round"
              opacity={index === 0 ? 0.8 : 0.35}
            />
          </Fragment>
        ))}
        <Rect x="90" y="49" width="21" height="21" rx="5" fill={colors.raised} />
        <Path
          d="M100 54l-3 5 3 5m4-10l3 5-3 5"
          stroke={colors.accent}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <Line
          x1="121"
          y1="55"
          x2="209"
          y2="55"
          stroke={colors.text}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <Line
          x1="121"
          y1="66"
          x2="173"
          y2="66"
          stroke={colors.muted}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.4}
        />
        <Line
          x1="93"
          y1="87"
          x2="218"
          y2="87"
          stroke={colors.muted}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.45}
        />
        <Line
          x1="93"
          y1="98"
          x2="193"
          y2="98"
          stroke={colors.muted}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.25}
        />
        <Rect
          x="89"
          y="113"
          width="139"
          height="34"
          rx="5"
          fill={colors.panel}
          stroke={colors.border}
        />
        <Path
          d="M100 125l4 4-4 4m10 0h9"
          stroke={colors.muted}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1="132"
          y1="125"
          x2="198"
          y2="125"
          stroke={colors.muted}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.4}
        />
        <Line
          x1="132"
          y1="135"
          x2="170"
          y2="135"
          stroke={colors.muted}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.2}
        />
        <Path
          d="M44 163v6h178"
          stroke={colors.border}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M183 101c37 0 18 66 54 66"
          stroke={colors.muted}
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
        />
        <Circle cx="183" cy="101" r="3" fill={colors.text} />
        <Rect
          x="239"
          y="45"
          width="87"
          height="137"
          rx="15"
          fill={colors.background}
          stroke={colors.muted}
          strokeWidth="1.2"
        />
        <Rect x="270" y="52" width="25" height="4" rx="2" fill={colors.border} />
        <Rect x="251" y="67" width="63" height="25" rx="5" fill={colors.raised} />
        <Path d="M258 74h6l2 2h8v10h-16z" stroke={colors.text} fill="none" strokeWidth="1.2" />
        <Line
          x1="281"
          y1="76"
          x2="306"
          y2="76"
          stroke={colors.text}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Line
          x1="281"
          y1="84"
          x2="297"
          y2="84"
          stroke={colors.muted}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.5}
        />
        <Line
          x1="253"
          y1="105"
          x2="296"
          y2="105"
          stroke={colors.text}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.8}
        />
        <Line
          x1="253"
          y1="114"
          x2="310"
          y2="114"
          stroke={colors.muted}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.45}
        />
        <Line
          x1="253"
          y1="122"
          x2="290"
          y2="122"
          stroke={colors.muted}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.3}
        />
        <Rect x="251" y="136" width="63" height="25" rx="5" fill={colors.text} />
        <Path
          d="M261 148l3 3 5-6"
          stroke={colors.background}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1="278"
          y1="148"
          x2="304"
          y2="148"
          stroke={colors.background}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.7}
        />
        <Line
          x1="275"
          y1="173"
          x2="291"
          y2="173"
          stroke={colors.muted}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.5}
        />
      </Svg>
      <Body muted style={{ fontSize: fontSize.small, lineHeight: 19 }}>
        {copy("Projeler · AI oturumları · Onaylar", "Projects · AI sessions · Approvals")}
      </Body>
    </View>
  );
}
