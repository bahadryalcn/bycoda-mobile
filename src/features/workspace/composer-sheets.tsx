import { useMobileTheme } from "@/ui/theme";
import Check from "lucide-react-native/icons/check";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import ListPlus from "lucide-react-native/icons/list-plus";
import Send from "lucide-react-native/icons/send";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import LayoutTemplate from "lucide-react-native/icons/layout-template";
import { IconTile } from "@/ui/icon-tile";
import { NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { TemplateLibrary } from "@/features/management/templates/template-library";
import type { ComposerDelivery } from "./composer-delivery";
import type { SessionScope } from "./session-types";

/** Delivery mode, add-to-message and phone template sheets opened from the composer toolbar. */
export function ComposerSheets({
  scope,
  projectId,
  mode,
  options,
  onChooseMode,
  modeOpen,
  onModeClose,
  pickerOpen,
  onPickerClose,
  templateOpen,
  onTemplateOpen,
  onTemplateClose,
  onChoose,
  onInsertTemplate,
}: {
  scope: SessionScope;
  projectId?: string;
  mode: ComposerDelivery;
  options: { value: ComposerDelivery; label: string }[];
  onChooseMode: (mode: ComposerDelivery) => void;
  modeOpen: boolean;
  onModeClose: () => void;
  pickerOpen: boolean;
  onPickerClose: () => void;
  templateOpen: boolean;
  onTemplateOpen: () => void;
  onTemplateClose: () => void;
  onChoose: (kind: "photo" | "document") => void;
  onInsertTemplate: (body: string) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
    <>
      <Sheet visible={modeOpen} title={copy("Gönderme biçimi", "Delivery mode")} size="compact" onClose={onModeClose}>
        <NavigationGroup>
          {options.map((option) => (
            <NavigationRow
              key={option.value}
              label={option.label}
              icon={
                <IconTile>
                  {option.value === "steer" ? <CornerDownRight size={18} strokeWidth={2} color={colors.muted} /> : option.value === "queue" ? <ListPlus size={18} strokeWidth={2} color={colors.muted} /> : <Send size={18} strokeWidth={2} color={colors.muted} />}
                </IconTile>
              }
              detail={
                option.value === "steer"
                  ? copy("Aktif çalışmayı bu mesajla yönlendirir.", "Redirects the active turn with this message.")
                  : option.value === "queue"
                    ? copy(
                        "Tur bitince gönderilir. Duraklatılmış bir sıra için Sırayı başlat’ı seç.",
                        "Sends after this turn. Choose Start queue if the queue is paused.",
                      )
                    : copy("Hemen gönderir.", "Sends right away.")
              }
              trailing={option.value === mode ? <Check size={18} strokeWidth={2.4} color={colors.accent} /> : undefined}
              onPress={() => {
                onChooseMode(option.value);
                onModeClose();
              }}
            />
          ))}
        </NavigationGroup>
      </Sheet>
      <Sheet
        visible={templateOpen}
        title={copy("Telefon şablonları", "Phone templates")}
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
            label={copy("Telefon şablonları", "Phone templates")}
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
        </NavigationGroup>
      </Sheet>
    </>
  );
}
