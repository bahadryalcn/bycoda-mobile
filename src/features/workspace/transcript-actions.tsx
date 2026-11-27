import Copy from "lucide-react-native/icons/copy";
import Flag from "lucide-react-native/icons/flag";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import Pencil from "lucide-react-native/icons/pencil";
import TextSelect from "lucide-react-native/icons/text-select";
import Share2 from "lucide-react-native/icons/share-2";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useMobileTheme } from "@/ui/theme";
import { useRef, type PropsWithChildren } from "react";
import { findNodeHandle, View, type HostInstance } from "react-native";
import { Body, ErrorText, NavigationGroup, NavigationRow, Notice, RowIcon, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RemoteHostError } from "@/remote/host-error";
import { space } from "@/ui/tokens";
import { SelectedText } from "./selected-text";
import { useTranscriptActions, type TranscriptActionsProps } from "./use-transcript-actions";

function Feedback({ error, notice, children }: PropsWithChildren<{ error?: unknown; notice?: string }>) {
  return <View style={{ gap: space.xxs }}>{children}<ErrorText error={error} />{notice ? <Body muted>{notice}</Body> : null}</View>;
}

const glyph = (G: typeof Copy) => <RowIcon glyph={G} />;

export function TranscriptActions(props: TranscriptActionsProps & { onRewind?: () => void; onRemove?: () => void; role?: "user" | "assistant" | "activity" }) {
  useMobileTheme(); const copy = useCopy(), actions = useTranscriptActions(props), anchor = useRef<HostInstance>(null);
  const { note } = actions;
  if (actions.selecting && actions.opening.context?.sessionId) return <SelectedText text={actions.opening.text} role={props.role}
    scope={{ machineId: actions.opening.context.machineId, sessionId: actions.opening.context.sessionId }} client={actions.opening.context.client} onClose={actions.close} />;
  return <Sheet visible title={copy("Mesaj seçenekleri", "Message options")} size="compact" dismissible={!actions.busy} onClose={actions.close}>
    {actions.changed ? <Notice tone="warning" message={copy("Seçim veya kaynak değişti. Devam etmeden önce bağlamı yeniden inceleyin.", "The selection or source changed. Review the context again before continuing.")} /> : null}
    <NavigationGroup>
      {props.onRewind ? <NavigationRow intent="command" icon={glyph(Pencil)} label={copy("Buradan düzenle", "Edit from here")} disabled={actions.disabled} onPress={() => { actions.close(); props.onRewind?.(); }} /> : null}
      {actions.opening.context?.sessionId ? <NavigationRow intent="navigate" icon={glyph(TextSelect)} label={copy("Metin seç", "Select text")} disabled={actions.disabled} onPress={actions.select} /> : null}
      <Feedback error={actions.messageCopy.error}><NavigationRow intent="command" icon={glyph(Copy)} label={copy("Mesajı kopyala", "Copy message")} disabled={actions.disabled} busy={actions.messageCopy.inFlight} onPress={actions.messageCopy.copy} /></Feedback>
      {actions.hasResponse ? <Feedback error={actions.responseCopy.error}><NavigationRow intent="command" icon={glyph(Copy)} label={copy("Yanıtın tamamını kopyala", "Copy complete response")} disabled={actions.disabled} busy={actions.responseCopy.inFlight} onPress={actions.responseCopy.copy} /></Feedback> : null}
      <View ref={anchor}><Feedback error={actions.shareError} notice={actions.cancelled ? copy("Paylaşım iptal edildi.", "Sharing was cancelled.") : undefined}>
        <NavigationRow intent="command" icon={glyph(Share2)} label={copy("Paylaş", "Share")} disabled={actions.disabled} busy={actions.pending === "share"} onPress={() => actions.share(process.env.EXPO_OS === "ios" && anchor.current ? findNodeHandle(anchor.current) : undefined)} />
      </Feedback></View>
      {actions.opening.context ? <View>
        <Feedback error={note.error} notice={note.status === "uncertain" && !(note.error instanceof RemoteHostError && note.error.uncertain) ? copy("Not işleminin sonucu belirsiz. Yeniden denemeden önce kaydedilen notu kontrol edin.", "The note result is uncertain. Check the saved note before retrying.") : note.missing ? copy("Not bulunamadı.", "Note not found.") : undefined}>
          <NavigationRow intent="command" icon={glyph(NotebookPen)} label={note.status === "saved" ? copy("Nota kaydedildi", "Saved to notes") : copy("Not olarak kaydet", "Save as note")} disabled={actions.disabled || note.status !== "idle"} busy={actions.pending === "note"} onPress={actions.saveNote} />
        </Feedback>
        {note.status === "uncertain" ? <Feedback error={note.checkError}><NavigationRow intent="command" label={copy("Notun kaydını kontrol et", "Check saved note")} disabled={actions.checkDisabled} busy={actions.pending === "check"} onPress={actions.check} /></Feedback> : null}
      </View> : null}
      {props.onRemove ? <NavigationRow intent="command" tone="danger" icon={<RowIcon glyph={Trash2} tone="danger" />} label={copy("Kaldır", "Remove")} disabled={actions.disabled} onPress={() => { actions.close(); props.onRemove?.(); }} /> : null}
      {props.reportable ? <Feedback error={actions.reportError}><NavigationRow intent="navigate" icon={glyph(Flag)} label={copy("İçerik şikâyet et", "Report content")} disabled={actions.disabled} onPress={actions.report} /></Feedback> : null}
    </NavigationGroup>
  </Sheet>;
}
