import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { terminalDocument, readTerminalPacket, type TerminalPacket } from "./terminal-document";
import type { TerminalViewportHandle } from "./terminal-viewport";
export const TerminalViewport = forwardRef<
  TerminalViewportHandle,
  { nonce: string; onPacket: (packet: TerminalPacket) => void; onLost: () => void }
>(function TerminalViewport({ nonce, onPacket }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const source = useMemo(() => terminalDocument(nonce), [nonce]);
  const callback = useRef(onPacket);
  callback.current = onPacket;
  useImperativeHandle(
    ref,
    () => ({
      post: (packet) =>
        frame.current?.contentWindow?.postMessage(JSON.stringify({ ...packet, nonce }), "*"),
    }),
    [nonce],
  );
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== "string") return;
      const packet = readTerminalPacket(event.data, nonce);
      if (packet) callback.current(packet);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [nonce]);
  return (
    <iframe
      ref={frame}
      title="Interactive terminal"
      srcDoc={source}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={{ width: "100%", height: "100%", border: 0, flex: 1 }}
    />
  );
});
