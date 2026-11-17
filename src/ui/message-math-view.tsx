import { SvgXml } from "react-native-svg";
import { ScrollView, Text, View, type TextStyle } from "react-native";
import { radii, space } from "./tokens";
import { latexToText } from "./message-math";
import { renderMathSvg } from "./message-math-svg";

/**
 * Typeset TeX drawn as SVG (MathJax, no WebView). Inline formulas sit on the text baseline; block
 * formulas are centered and scroll horizontally when wide. A parse error shows the monospace text.
 */
export default function MessageMath({
  tex,
  block,
  display,
  fontSize,
  color,
  panelColor,
  fallbackStyle,
}: {
  tex: string;
  block: boolean;
  display: boolean;
  fontSize: number;
  /** Theme text token; replaces the SVG's currentColor. */
  color: string;
  panelColor?: string;
  fallbackStyle: TextStyle;
}) {
  const math = renderMathSvg(tex, block || display);
  if (!math) {
    const text = <Text style={[fallbackStyle, { fontStyle: "italic" }]}>{latexToText(tex)}</Text>;
    return block ? (
      <ScrollView horizontal accessibilityLabel={tex} style={{ backgroundColor: panelColor, borderRadius: radii.control }} contentContainerStyle={{ padding: space.sm }}>
        {text}
      </ScrollView>
    ) : (
      text
    );
  }
  // MathJax measures in ex; 1ex = 0.5em, so size the SVG from the surrounding font size.
  const scale = fontSize * (block ? 1.1 : 1) * 0.5;
  const formula = (
    <View accessible accessibilityRole="image" accessibilityLabel={tex} style={block ? undefined : { transform: [{ translateY: math.depthEx * scale }] }}>
      <SvgXml xml={math.svg.replace(/currentColor/g, color)} width={math.widthEx * scale} height={math.heightEx * scale} />
    </View>
  );
  if (!block) return formula;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.sm }}>
      {formula}
    </ScrollView>
  );
}
