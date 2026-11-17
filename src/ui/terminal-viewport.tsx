import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { WebView } from "react-native-webview";
import { useChatDisplay } from "./chat-display";
import { withTerminalFontSize } from "./terminal-viewport-model";
import { terminalDocument, readTerminalPacket, type TerminalPacket } from "./terminal-document";
export type TerminalViewportHandle = { post: (packet: Record<string, unknown>) => void };
export const TerminalViewport = forwardRef<
  TerminalViewportHandle,
  { nonce: string; onPacket: (packet: TerminalPacket) => void; onLost: () => void }
>(function TerminalViewport({ nonce, onPacket, onLost }, ref) {
  const web = useRef<WebView<object>>(null);
  const size = useChatDisplay((state) => state.terminalSize);
  const source = useMemo(
    () => ({ html: withTerminalFontSize(terminalDocument(nonce), size), baseUrl: "about:blank" }),
    [nonce, size],
  );
  useImperativeHandle(
    ref,
    () => ({
      post: (packet) => {
        web.current?.injectJavaScript(
          `window.byCodaTerminalAccept(${JSON.stringify({ ...packet, nonce })});true;`,
        );
      },
    }),
    [nonce],
  );
  return (
    <WebView
      ref={web}
      source={source}
      style={{ flex: 1 }}
      originWhitelist={["about:blank"]}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows
      onOpenWindow={() => {}}
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
      onMessage={(event) => {
        const packet = readTerminalPacket(event.nativeEvent.data, nonce);
        if (packet) onPacket(packet);
      }}
      onError={onLost}
      onContentProcessDidTerminate={onLost}
      onRenderProcessGone={onLost}
    />
  );
});
