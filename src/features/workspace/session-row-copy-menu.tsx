import { useState } from "react";
import { Share } from "react-native";
import ShareIcon from "lucide-react-native/icons/share";
import { sessionSharePayload } from "./session-attention-model";
import Link from "lucide-react-native/icons/link";
import Copy from "lucide-react-native/icons/copy";
import FileText from "lucide-react-native/icons/file-text";
import MessagesSquare from "lucide-react-native/icons/messages-square";
import { useSingleFlight } from "@/state/actions";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { ErrorText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { SessionActionList, type SessionSheetAction } from "./session-action-list";
import { conversationText } from "./session-copy-model";
import type { HostSession } from "./wire";
import type { Requester } from "./wire-types";

/** Desktop "Copy Markdown reference": `[escaped title](link)`. */
export function sessionMarkdownReference(title: string, link: string) {
  // eslint-disable-next-line no-control-regex -- control characters must not reach the label.
  const label = (title.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || "Session").replace(/[\\`*_[\]<>!()#|~]/g, "\\$&");
  return `[${label}](${link})`;
}

/** Clipboard work stays within the reviewed sheet's private-content lifetime. */
export function SessionRowCopyMenu({ actions, sessionId, projectId, title, link, client, current, busy }: {
  actions: SessionSheetAction[];
  sessionId: string;
  projectId: string;
  title?: string;
  link: string | null;
  client: Requester | null;
  current(): boolean;
  busy: boolean;
}) {
  const copy = useCopy();
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<unknown>(null);
  const flight = useSingleFlight<void>();
  const linkCopy = useClipboardFeedback(link ?? "", !!link && !busy, flight);
  const idCopy = useClipboardFeedback(sessionId, !busy, flight);
  const markdownCopy = useClipboardFeedback(link ? sessionMarkdownReference(title ?? "", link) : "", !!link && !busy, flight);
  const textCopy = useClipboardFeedback(sessionId, !!client && !busy, flight, async () => {
    if (!client || !current()) throw new Error("The session project is no longer available.");
    const value = await client.request<HostSession>("sessions.get", { sessionId });
    if (!current() || value.projectId !== projectId || value.session.id !== sessionId)
      throw new Error("The session project is no longer available.");
    if (value.history || value.historyLoading) throw new Error("Conversation text is incomplete.");
    return conversationText(value.session.blocks);
  });
  const copying = linkCopy.inFlight || idCopy.inFlight || textCopy.inFlight || markdownCopy.inFlight;
  const error = linkCopy.error || idCopy.error || textCopy.error || markdownCopy.error;
  const failure = error?.message === "Conversation exceeds the copy limit."
    ? copy("Konuşma kopyalama sınırını aşıyor.", "Conversation exceeds the copy limit.")
    : error?.message === "Conversation text is incomplete."
      ? copy("Konuşma metni eksik. Yenileyip tekrar deneyin.", "Conversation text is incomplete. Refresh and try again.")
      : error?.message === "No conversation text to copy."
        ? copy("Kopyalanacak konuşma metni yok.", "No conversation text to copy.")
        : copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again.");
  const row = (key: string, label: string, icon: SessionSheetAction["icon"], feedback: typeof idCopy, disabled = false): SessionSheetAction => ({
    key, label: feedback.copied ? copy("Kopyalandı", "Copied") : label, icon,
    group: "copy",
    disabled: busy || copying || disabled, busy: feedback.busy, onPress: feedback.copy,
  });
  const share: SessionSheetAction = {
    key: "share", label: copy("Paylaş", "Share"), icon: <ShareIcon />, group: "copy",
    disabled: busy || copying || sharing || !link, busy: sharing,
    onPress: () => {
      if (!link || !current() || sharing) return;
      void flight.run(async () => {
        if (!current()) return;
        setSharing(true); setShareError(null);
        try { await Share.share(sessionSharePayload(title ?? sessionId, link)); }
        catch (error) { if (current()) setShareError(error); }
        finally { setSharing(false); }
      }).catch(setShareError);
    },
  };
  const copies = [share,
    row("copy-link", copy("Oturum bağlantısını kopyala", "Copy session link"), <Link />, linkCopy, !link),
    row("copy-markdown", copy("Markdown referansını kopyala", "Copy Markdown reference"), <FileText />, markdownCopy, !link),
    row("copy-id", copy("Oturum kimliğini kopyala", "Copy session ID"), <Copy />, idCopy),
    row("copy-conversation", copy("Konuşmayı metin olarak kopyala", "Copy conversation as text"), <MessagesSquare />, textCopy, !client),
  ];
  // Desktop session menu order; the copy group sits between editing and managing actions.
  const order = ["settle", "pin", "rename", "unread", "snooze", "move", "copy-link", "copy-markdown", "copy-id", "copy-conversation", "share", "details", "archive", "stop", "delete"];
  return <>
    <SessionActionList actions={[...actions, ...copies].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map(action => ({ ...action, disabled: action.disabled || copying || sharing }))} />
    <ErrorText error={shareError} message={copy("Paylaşılamadı. Yeniden deneyin.", "Could not share. Try again.")} />
    <ErrorText error={error} message={failure} />
  </>;
}
