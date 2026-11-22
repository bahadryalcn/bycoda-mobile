import { forwardRef, useImperativeHandle, useMemo, useRef, type ComponentRef } from "react";
import { findNodeHandle, Platform, useWindowDimensions, View } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { WebView } from "react-native-webview";
import { hideTerminalKeyboard, showTerminalKeyboard } from "../../modules/bycoda-key-commands";
import { useChatDisplay } from "./chat-display";
import { withTerminalFontSize } from "./terminal-viewport-model";
import { terminalDocument, readTerminalPacket, type TerminalPacket } from "./terminal-document";
export type TerminalViewportHandle = {
  post: (packet: Record<string, unknown>) => void;
  focusInput: () => void;
  hideInput: () => void;
};
export const TerminalViewport = forwardRef<
  TerminalViewportHandle,
  { nonce: string; onPacket: (packet: TerminalPacket) => void; onLost: () => void }
>(function TerminalViewport({ nonce, onPacket, onLost }, ref) {
  const web = useRef<WebView<object>>(null);
  const container = useRef<ComponentRef<typeof View>>(null);
  const keyboardRequest = useRef<string | null>(null);
  const size = useChatDisplay((state) => state.terminalSize);
  // xterm measures its cells from fontSize. Android WebView text zoom scales the glyphs separately.
  const { fontScale } = useWindowDimensions();
  const terminalScale = Platform.OS === "android" ? fontScale : 1;
  const source = useMemo(
    () => ({ html: withTerminalFontSize(terminalDocument(nonce), size, terminalScale), baseUrl: "about:blank" }),
    [nonce, size, terminalScale],
  );
  useImperativeHandle(
    ref,
    () => {
      const post = (packet: Record<string, unknown>) => {
        web.current?.injectJavaScript(
          `window.byCodaTerminalAccept(${JSON.stringify({ ...packet, nonce })});true;`,
        );
      };
      return {
        post,
        focusInput: () => {
          keyboardRequest.current = nonce;
          post({ type: "focus" });
        },
        hideInput: () => {
          keyboardRequest.current = null;
          const tag = findNodeHandle(container.current);
          if (typeof tag !== "number") return;
          void (hideTerminalKeyboard(tag) ?? KeyboardController.dismiss()).catch(() => undefined);
        },
      };
    },
    [nonce],
  );
  return (
    <View ref={container} collapsable={false} style={{ flex: 1 }}>
    <WebView
      ref={web}
      source={source}
      style={{ flex: 1 }}
      textZoom={100}
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
        if (packet?.type === "focused") {
          if (keyboardRequest.current !== nonce) return;
          keyboardRequest.current = null;
          const tag = findNodeHandle(container.current);
          if (typeof tag === "number") void showTerminalKeyboard(tag).catch(() => undefined);
        } else if (packet) onPacket(packet);
      }}
      onError={onLost}
      onContentProcessDidTerminate={onLost}
      onRenderProcessGone={onLost}
    />
    </View>
  );
});
