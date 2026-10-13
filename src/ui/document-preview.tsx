import type { ComponentProps } from "react";
import { DocumentContent, ProjectMediaContent } from "./document-content";
import { DocumentNavigation } from "./document-navigation";

export function DocumentPreview(props: Omit<ComponentProps<typeof DocumentContent>, "onOpenFile">) {
  return (
    <DocumentNavigation>
      {(open) => <DocumentContent {...props} onOpenFile={open} />}
    </DocumentNavigation>
  );
}
export function ProjectMedia(
  props: Omit<ComponentProps<typeof ProjectMediaContent>, "onOpenFile">,
) {
  return (
    <DocumentNavigation>
      {(open) => <ProjectMediaContent {...props} onOpenFile={open} />}
    </DocumentNavigation>
  );
}
