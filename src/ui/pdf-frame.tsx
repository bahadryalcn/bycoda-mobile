import { useLayoutEffect, useMemo, useRef } from "react";
import { WebView } from "react-native-webview";
import { previewNavigationAllowed } from "./media-policy";
import type { PdfFrameProps } from "./pdf-frame-props";

/** Trusted offline document renderer; no file, network, cookie or navigation authority. */
export function PdfFrame({ html, title, fill, onMessage, onFailure }: PdfFrameProps) {
  const source = useMemo(() => ({ html, baseUrl: "about:blank" }), [html]);
  const live = useRef(true);
  // Late native events belong to this frame, not a replacement reader.
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return <WebView source={source} accessibilityLabel={title}
    style={fill ? { flex: 1, minHeight: 0 } : { height: 480, flex: 0 }}
    originWhitelist={["*"]} javaScriptEnabled domStorageEnabled={false} incognito cacheEnabled={false}
    sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false}
    allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
    javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows onOpenWindow={() => {}}
    onShouldStartLoadWithRequest={request => previewNavigationAllowed(request.url)}
    onMessage={event => { if (live.current) onMessage(event.nativeEvent.data); }}
    onError={() => { if (live.current) onFailure(); }}
    onContentProcessDidTerminate={() => { if (live.current) onFailure(); }}
    onRenderProcessGone={() => { if (live.current) onFailure(); }}
    allowsBackForwardNavigationGestures={false} />;
}
