import { useMemo } from "react";
import { sandboxPreviewHtml } from "./media-policy";
export function HtmlPreview({ html, height = 420, trustedRuntime }: { html: string; height?: number; trustedRuntime?: string }) {
  const document = useMemo(() => sandboxPreviewHtml(html, true, trustedRuntime), [html, trustedRuntime]);
  return <iframe title="HTML preview" srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: "100%", height, border: 0 }} />;
}
