import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import ClipboardList from "lucide-react-native/icons/clipboard-list";
import CircleDashed from "lucide-react-native/icons/circle-dashed";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import LayoutTemplate from "lucide-react-native/icons/layout-template";
import { Body, NavigationGroup, NavigationRow, RowIcon, SectionHeader, Sheet } from "@/ui/primitives";

type RowGlyph = ComponentProps<typeof RowIcon>["glyph"];
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { TemplateLibrary } from "@/features/management/templates/template-library";
import type { ComposerMode } from "./composer-mode";
import type { SessionScope } from "./session-types";

/**
 * "Add to message" and its phone template sheet, opened from the composer's Add control. Content
 * (photos, files, templates) comes first; the turn modes for this message (Plan mode, Save as
 * draft) follow as selection rows with their blocked reasons, so the toolbar needs no mode icon.
 */
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
  modes,
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
  /** Turn modes for this message; omitted where the composer has none. */
  modes?: {
    active: ComposerMode | null;
    blockedReasons: Partial<Record<ComposerMode, string>>;
    onSelect: (mode: ComposerMode) => void;
  };
}) {
  const copy = useCopy();
  const contentsLabel = copy("Taslak içeriği", "Draft contents");
  const modeRow = (mode: ComposerMode, label: string, description: string, icon: RowGlyph) => {
    const blocked = modes?.active !== mode ? modes?.blockedReasons[mode] : undefined;
    return (
      <NavigationRow
        key={mode}
        label={label}
        detail={blocked ?? description}
        detailLines={2}
        icon={<RowIcon glyph={icon} />}
        selected={modes?.active === mode}
        disabled={!!blocked}
        onPress={() => modes?.onSelect(mode)}
      />
    );
  };
  return (
    <>
      <Sheet visible={draftDetailsOpen} title={contentsLabel} size="form" onClose={onDraftDetailsClose}>
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
        <View style={{ gap: space.lg }}>
          <NavigationGroup>
            <NavigationRow
              label={copy("Fotoğraflar", "Photos")}
              intent="command"
              icon={<RowIcon glyph={ImageIcon} />}
              onPress={() => onChoose("photo")}
            />
            <NavigationRow
              label={copy("Dosyalar", "Files")}
              intent="command"
              icon={<RowIcon glyph={File} />}
              onPress={() => onChoose("document")}
            />
            <NavigationRow
              intent="navigate"
              label={copy("Şablonlar", "Templates")}
              icon={<RowIcon glyph={LayoutTemplate} />}
              onPress={onTemplateOpen}
            />
            {onDraftDetailsOpen ? (
              <NavigationRow label={contentsLabel} intent="navigate" onPress={onDraftDetailsOpen}
                icon={<RowIcon glyph={ClipboardList} />} />
            ) : null}
          </NavigationGroup>
          {modes ? (
            <View>
              <SectionHeader title={copy("Bu mesaj için", "For this message")} />
              <NavigationGroup>
                {modeRow(
                  "plan",
                  copy("Plan modu", "Plan mode"),
                  copy("Yapmadan önce bir planı incele", "Review a plan before building"),
                  Lightbulb,
                )}
                {modeRow(
                  "draft",
                  copy("Taslak olarak kaydet", "Save as draft"),
                  copy("Ajanı başlatmadan kaydet", "Save this message without starting the agent"),
                  CircleDashed,
                )}
              </NavigationGroup>
            </View>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
