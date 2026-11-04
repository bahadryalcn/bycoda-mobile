import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMobileTheme } from "./theme";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { HtmlPreviewControls, type HtmlPreviewInteraction } from "./html-preview-controls";
import { useCopy } from "./copy";
import { space } from "./tokens";
import { previewNavigationAllowed, sandboxPreviewHtml } from "./media-policy";

type HtmlPreviewProps = { html: string; height?: number; fill?: boolean; trustedRuntime?: string; interaction?: HtmlPreviewInteraction };

export function HtmlPreview({ html, height = 420, fill = false, trustedRuntime, interaction }: HtmlPreviewProps) {
  const { colors } = useMobileTheme();
  // Interaction is a reader choice: replacing the source must not turn scripts back on.
  const [localJavascript, setJavascript] = useState(true);
  const javascript = interaction?.enabled ?? localJavascript;
  const source = useMemo(() => ({ html: sandboxPreviewHtml(`<style>html,body{background:${colors.panel};color:${colors.text}}</style>${html}`, javascript, trustedRuntime), baseUrl: "about:blank" }), [html, javascript, trustedRuntime, colors.panel, colors.text]);
  const [opening, setOpening] = useState({ source, revision: 0 });
  let revision = opening.revision;
  if (source !== opening.source) {
    revision++;
    setOpening({ source, revision });
  }
  return <PreviewSession key={revision} source={source} height={height} fill={fill}
    javascript={javascript} onToggle={interaction?.toggle ?? (() => setJavascript(value => !value))} />;
}

function PreviewSession({ source, height, fill, javascript, onToggle }: {
  source: { html: string; baseUrl: string }; height: number; fill: boolean;
  javascript: boolean; onToggle(): void;
}) {
  const copy = useCopy();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const controls = <HtmlPreviewControls fill={fill} javascript={javascript} onToggle={onToggle}
    loading={loading} error={error} onRetry={() => {
      setError(null); setLoading(true); setAttempt(value => value + 1);
    }} />;
  return <View style={{ gap: space.sm, ...(fill ? { flex: 1, minHeight: 0 } : {}) }}>
    {!fill ? controls : null}
    <PreviewAttempt key={attempt} source={source} javascript={javascript} height={height} fill={fill}
      onLoadEnd={() => setLoading(false)} onFailure={(terminated) => {
        setLoading(false);
        setError(new Error(terminated ? copy("Önizleme kapandı. Yeniden açabilirsin.", "Preview stopped. You can retry.") : copy("Önizleme açılamadı.", "Preview could not be opened.")));
      }} />
    {fill ? controls : null}
  </View>;
}

/** Native events belong to this WebView attempt, including after Retry or source replacement. */
function PreviewAttempt({ source, javascript, height, fill, onLoadEnd, onFailure }: {
  source: { html: string; baseUrl: string }; javascript: boolean; height: number; fill: boolean;
  onLoadEnd(): void; onFailure(terminated: boolean): void;
}) {
  const live = useRef(true);
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return <WebView source={source} style={fill ? { flex: 1, minHeight: 0 } : { height, flex: 0 }} originWhitelist={["*"]}
    javaScriptEnabled={javascript} domStorageEnabled={false} incognito cacheEnabled={false}
    sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false}
    allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
    javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
    onOpenWindow={() => {}} onShouldStartLoadWithRequest={(request) => previewNavigationAllowed(request.url)}
    onLoadEnd={() => { if (live.current) onLoadEnd(); }}
    onError={() => { if (live.current) onFailure(false); }}
    onContentProcessDidTerminate={() => { if (live.current) onFailure(true); }}
    allowsInlineMediaPlayback mediaPlaybackRequiresUserAction allowsBackForwardNavigationGestures={false}
  />;
}
