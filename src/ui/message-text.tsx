import { memo, type ComponentProps } from "react";
import { MessageContent } from "./message-content";
import { DocumentNavigation } from "./document-navigation";
export { ScopedFilePreview } from "./document-file-preview";

/** Public rich-message surface; standalone renderers depend only on file-open callbacks. */
export const MessageText = memo(function MessageText(
  props: Omit<ComponentProps<typeof MessageContent>, "onOpenFile">,
) {
  return (
    <DocumentNavigation>
      {(open) => <MessageContent {...props} onOpenFile={open} />}
    </DocumentNavigation>
  );
});
