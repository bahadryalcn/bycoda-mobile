import { useMemo } from "react";
import { useMobileTheme } from "./theme";
import { sandboxPreviewHtml } from "./media-policy";
export function HtmlPreview({ html, height = 420, trustedRuntime }: { html: string; height?: number; trustedRuntime?: string }) {
  const { colors } = useMobileTheme();
  const document = useMemo(() => sandboxPreviewHtml(`<style>html,body{background:${colors.panel};color:${colors.text}}</style>${html}`, true, trustedRuntime), [html, trustedRuntime, colors.panel, colors.text]);
  return <iframe title="HTML preview" srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: "100%", height, border: 0 }} />;
}
