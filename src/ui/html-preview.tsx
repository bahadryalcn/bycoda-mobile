import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { Button, ErrorText, Loading, Row } from "./primitives";
import { useCopy } from "./copy";
import { space } from "./tokens";
import { previewNavigationAllowed, sandboxPreviewHtml } from "./media-policy";

export function HtmlPreview({ html, height = 420, trustedRuntime }: { html: string; height?: number; trustedRuntime?: string }) {
  const copy = useCopy();
  const [javascript, setJavascript] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const source = useMemo(() => ({ html: sandboxPreviewHtml(html, javascript, trustedRuntime), baseUrl: "about:blank" }), [html, javascript, trustedRuntime]);
  return <View style={{ gap: space.sm }}>
    <Row><Button density="compact" tone="quiet" label={javascript ? copy("Etkileşim açık", "Interaction on") : copy("Etkileşim kapalı", "Interaction off")} onPress={() => { setJavascript(!javascript); setLoading(true); }} /></Row>
    {loading ? <Loading /> : null}
    <ErrorText error={error} />
    {error ? <Button label={copy("Yeniden dene", "Retry")} onPress={() => { setError(null); setLoading(true); setAttempt(attempt + 1); }} /> : null}
    <WebView key={`${attempt}:${javascript}`} source={source} style={{ height, flex: 0 }} originWhitelist={["*"]}
      javaScriptEnabled={javascript} domStorageEnabled={false} incognito cacheEnabled={false}
      sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false}
      allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
      javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
      onOpenWindow={() => {}} onShouldStartLoadWithRequest={(request) => previewNavigationAllowed(request.url)}
      onLoadEnd={() => setLoading(false)} onError={() => { setLoading(false); setError(new Error(copy("Önizleme açılamadı.", "Preview could not be opened."))); }}
      onContentProcessDidTerminate={() => { setLoading(false); setError(new Error(copy("Önizleme kapandı. Yeniden açabilirsin.", "Preview stopped. You can retry."))); }}
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction allowsBackForwardNavigationGestures={false}
    />
  </View>;
}
