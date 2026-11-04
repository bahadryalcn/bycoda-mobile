import { useMemo, useState } from "react";
import { View } from "react-native";
import { useMobileTheme } from "./theme";
import { sandboxPreviewHtml } from "./media-policy";
import { HtmlPreviewControls, type HtmlPreviewInteraction } from "./html-preview-controls";
import { useCopy } from "./copy";
import { space } from "./tokens";
export function HtmlPreview({ html, height = 420, fill = false, trustedRuntime, interaction }: { html: string; height?: number; fill?: boolean; trustedRuntime?: string; interaction?: HtmlPreviewInteraction }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [localJavascript, setJavascript] = useState(true);
  const javascript = interaction?.enabled ?? localJavascript;
  const document = useMemo(() => sandboxPreviewHtml(`<style>html,body{background:${colors.panel};color:${colors.text}}</style>${html}`, javascript, trustedRuntime), [html, javascript, trustedRuntime, colors.panel, colors.text]);
  const controls = <HtmlPreviewControls fill={fill} javascript={javascript} onToggle={interaction?.toggle ?? (() => setJavascript(value => !value))} />;
  return <View style={{ gap: space.sm, ...(fill ? { flex: 1, minHeight: 0 } : {}) }}>
    {!fill ? controls : null}
    <iframe key={String(javascript)} title={copy("HTML önizleme", "HTML preview")} srcDoc={document}
      sandbox={javascript ? "allow-scripts" : ""} referrerPolicy="no-referrer"
      style={{ width: "100%", border: 0, display: "block", ...(fill ? { flex: 1, minHeight: 0 } : { height, flexShrink: 0 }) }} />
    {fill ? controls : null}
  </View>;
}
