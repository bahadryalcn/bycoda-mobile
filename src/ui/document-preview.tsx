import type { ComponentProps } from "react";
import { DocumentContent } from "./document-content";
import { ProjectMediaContent } from "./project-media-content";
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
  return <ProjectMediaContent {...props} />;
}
