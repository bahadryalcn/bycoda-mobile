import { useLayoutEffect, useRef } from "react";
import type { PdfFrameProps } from "./pdf-frame-props";

/** Opaque-origin iframe isolates PDF.js from application storage and Host transport. */
export function PdfFrame({ html, title, fill, onMessage, onFailure }: PdfFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Accept state only from this document window; the parent validates its channel and schema.
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => { if (event.source === frame.current?.contentWindow) onMessage(event.data); };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onMessage]);
  return <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"
    onError={onFailure} style={{ width: "100%", border: 0, display: "block", ...(fill ? { flex: 1, minHeight: 0 } : { height: 480, flexShrink: 0 }) }} />;
}
