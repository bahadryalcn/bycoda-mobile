import { useCallback, useState, type ReactNode } from "react";
import { ScopedFilePreview } from "./document-file-preview";
import type { MessageContext, OpenDocument } from "./media-policy";

/** Navigation is composed outside selectable native text; renderers never import their owners. */
export function DocumentNavigation({ children }: { children: (open: OpenDocument) => ReactNode }) {
  const [file, setFile] = useState<{ path: string; context: MessageContext } | null>(null);
  const open = useCallback<OpenDocument>((path, context) => setFile({ path, context }), []);
  return (
    <>
      {children(open)}
      {file ? (
        <ScopedFilePreview path={file.path} context={file.context} onClose={() => setFile(null)} />
      ) : null}
    </>
  );
}
