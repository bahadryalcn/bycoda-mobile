import { useMobileTheme } from "@/ui/theme";
import type { ReactNode } from "react";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import LayoutTemplate from "lucide-react-native/icons/layout-template";
import { IconTile } from "@/ui/icon-tile";
import { Body, NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { TemplateLibrary } from "@/features/management/templates/template-library";
import type { SessionScope } from "./session-types";

/** Add-to-message and phone template sheets opened from the composer toolbar. */
export function ComposerSheets({
  scope,
  projectId,
  pickerOpen,
  onPickerClose,
  draftDetails,
  draftDetailsOpen,
  onDraftDetailsOpen,
  onDraftDetailsClose,
  templateOpen,
  onTemplateOpen,
  onTemplateClose,
  onChoose,
  onInsertTemplate,
}: {
  scope: SessionScope;
  projectId?: string;
  pickerOpen: boolean;
  onPickerClose: () => void;
  draftDetails?: ReactNode;
  draftDetailsOpen: boolean;
  onDraftDetailsOpen?: () => void;
  onDraftDetailsClose: () => void;
  templateOpen: boolean;
  onTemplateOpen: () => void;
  onTemplateClose: () => void;
  onChoose: (kind: "photo" | "document") => void;
  onInsertTemplate: (body: string) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const draftLabel = copy("Taslak", "Draft");
  return (
    <>
      <Sheet visible={draftDetailsOpen} title={draftLabel} size="form" onClose={onDraftDetailsClose}>
        {draftDetails ?? <Body muted>{copy("Henüz içerik yok", "No content yet")}</Body>}
      </Sheet>
      <Sheet
        visible={templateOpen}
        title={copy("Şablonlar", "Templates")}
        size="full"
        scroll={false}
        onClose={onTemplateClose}
      >
        {templateOpen ? (
          <TemplateLibrary scope={scope} projectId={projectId} onClose={onTemplateClose} onInsert={onInsertTemplate} />
        ) : null}
      </Sheet>
      <Sheet visible={pickerOpen} title={copy("Mesaja ekle", "Add to message")} size="compact" onClose={onPickerClose}>
        <NavigationGroup>
          <NavigationRow
            intent="navigate"
            label={copy("Şablonlar", "Templates")}
            icon={<IconTile><LayoutTemplate size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            onPress={onTemplateOpen}
          />
          <NavigationRow
            label={copy("Fotoğraflar", "Photos")}
            intent="command"
            icon={<IconTile><ImageIcon size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            onPress={() => onChoose("photo")}
          />
          <NavigationRow
            label={copy("Dosyalar", "Files")}
            intent="command"
            icon={<IconTile><File size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            onPress={() => onChoose("document")}
          />
          {onDraftDetailsOpen ? (
            <NavigationRow label={draftLabel} intent="navigate" onPress={onDraftDetailsOpen}
              icon={<IconTile><File size={18} strokeWidth={2} color={colors.muted} /></IconTile>} />
          ) : null}
        </NavigationGroup>
      </Sheet>
    </>
  );
}
