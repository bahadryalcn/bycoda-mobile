import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Share } from "react-native";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { RemoteHostError } from "@/remote/host-error";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { useSingleFlight } from "@/state/actions";
import { mediaQueryKey, type MessageContext } from "@/ui/media-policy";
import { usePrivateContentAccess } from "@/ui/private-access";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { useCopy } from "@/ui/copy";
import { startContentReport } from "../reporting/report-store";
import { matchesTranscriptNote, transcriptNoteTitle } from "./transcript-action-model";

export type TranscriptActionsProps = { text: string; responseText?: string; context?: MessageContext; reportable: boolean; onClose(): void };
type Action = "share" | "note" | "check" | "report";
type NoteState = { status: "idle" | "saved" | "uncertain"; error?: unknown; checkError?: unknown; missing?: boolean };
const targetKey = (context?: MessageContext) => JSON.stringify(mediaQueryKey(context, ["message-actions"]));

/** One opening and one action flight; note recovery is independent of other feedback. */
export function useTranscriptActions(props: TranscriptActionsProps) {
  const copy = useCopy(), permission = usePrivateContentAccess(), flight = useSingleFlight<void>();
  const [opening] = useState(() => ({ text: props.text, context: props.context ? { ...props.context } : undefined, key: targetKey(props.context), noteId: randomUUID() }));
  const current = useRef(props); current.current = props;
  const access = useRef(permission); access.current = permission;
  const live = useRef(false), closed = useRef(false), selectingRef = useRef(false), retiredRef = useRef(false);
  const revision = useRef(0), noteIssued = useRef(false);
  const [epoch, setEpoch] = useState(0), [closing, setClosing] = useState(false), [selecting, setSelecting] = useState(false);
  const sameTarget = () => targetKey(current.current.context) === opening.key && current.current.context?.client === opening.context?.client;
  const [retired, setRetired] = useState(false);
  const changed = retired || props.text !== opening.text || !sameTarget();
  if (changed) { retiredRef.current = true; if (!retired) setRetired(true); }
  const [pending, setPending] = useState<Action>();
  const [shareError, setShareError] = useState<unknown>(null), [cancelled, setCancelled] = useState(false), [reportError, setReportError] = useState<unknown>(null);
  const [note, setNote] = useState<NoteState>({ status: "idle" });
  const noteRef = useRef(note);
  const publishNote = (patch: Partial<NoteState>) => { noteRef.current = { ...noteRef.current, ...patch }; if (live.current) setNote(noteRef.current); };
  const allowed = () => { const state = useSecurity.getState(); return isAppAccessAllowed() && state.appState === "active" && state.windowFocused && access.current.allowed && access.current.check(); };
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const retireAccess = () => {
    if (live.current && !allowed()) {
      revision.current++; setEpoch(revision.current);
      if (noteIssued.current) publishNote({ status: "uncertain", missing: false });
    }
  };
  useLayoutEffect(() => useSecurity.subscribe(retireAccess), []);
  useLayoutEffect(retireAccess, [permission]);
  const validScope = (expected = epoch) => live.current && !closed.current && expected === revision.current && sameTarget() && allowed();
  const validSource = (expected = epoch) => {
    if (current.current.text !== opening.text || !sameTarget()) { if (live.current && !retiredRef.current) setRetired(true); retiredRef.current = true; }
    return validScope(expected) && !retiredRef.current && !selectingRef.current;
  };
  const sourceEnabled = !changed && !closing && !selecting;
  const messageCopy = useClipboardFeedback(opening.text, sourceEnabled, flight);
  const responseText = props.responseText || "";
  const hasResponse = !!responseText && responseText !== opening.text;
  const responseCopy = useClipboardFeedback(responseText, sourceEnabled && hasResponse, flight);
  const busy = !!pending || messageCopy.inFlight || responseCopy.inFlight;
  const finish = () => { if (!live.current || closed.current) return; closed.current = true; setClosing(true); current.current.onClose(); };
  useEffect(() => { if ((messageCopy.copied || responseCopy.copied) && validSource()) finish(); }, [messageCopy.copied, responseCopy.copied, changed, epoch]);
  const run = (action: Action, permitted: () => boolean, work: (expected: number) => Promise<unknown> | void, failure: (cause: unknown, expected: number) => void) => {
    if (!permitted() || flight.isPending()) return;
    const expected = epoch;
    void flight.run(async () => {
      if (!permitted() || expected !== revision.current) return;
      setPending(action);
      try { await work(expected); } catch (cause) { failure(cause, expected); }
      finally { if (action === "note") noteIssued.current = false; if (live.current) setPending(undefined); }
    });
  };
  const save = () => run("note", () => validSource() && !!opening.context && noteRef.current.status === "idle", async expected => {
    publishNote({ error: null, checkError: null, missing: false });
    opening.context!.client.assertCurrentAccess();
    noteIssued.current = true;
    const saved = await opening.context!.client.request("notes.upsert", { note: { id: opening.noteId, title: transcriptNoteTitle(opening.text, copy("Sohbet notu", "Chat note")), body: opening.text, tags: [], sourceSessionId: opening.context!.sessionId, sourceCwd: opening.context!.cwd }, expectedUpdatedAt: 0 }, { retry: false });
    if (validScope(expected) && matchesTranscriptNote(saved, opening.noteId, opening.text)) publishNote({ status: "saved", error: null });
    else if (live.current) publishNote({ status: "uncertain", error: validScope(expected) ? new Error(copy("Kaydedilen not doğrulanamadı. Kaydı yeniden kontrol edin.", "The saved note could not be verified. Check it again.")) : null });
  }, (cause, expected) => {
    if (live.current) publishNote({ status: noteIssued.current && (!validScope(expected) || cause instanceof RemoteHostError && cause.uncertain) ? "uncertain" : "idle", error: validScope(expected) ? cause : null });
  });
  const saveNote = () => { save(); };
  const check = () => run("check", () => validScope() && !selectingRef.current && noteRef.current.status === "uncertain" && !!opening.context, async expected => {
    publishNote({ checkError: null, missing: false });
    opening.context!.client.assertCurrentAccess();
    const saved = await opening.context!.client.request("notes.get", { id: opening.noteId }, { retry: false });
    if (!validScope(expected)) return;
    if (saved === null) publishNote({ status: "idle", error: null, checkError: null, missing: true });
    else if (matchesTranscriptNote(saved, opening.noteId, opening.text)) publishNote({ status: "saved", error: null, checkError: null });
    else publishNote({ checkError: new Error(copy("Kaydedilen not doğrulanamadı. Kaydı yeniden kontrol edin.", "The saved note could not be verified. Check it again.")) });
  }, (cause, expected) => { if (validScope(expected)) publishNote({ checkError: cause }); });
  const share = (anchor?: number | null) => run("share", validSource, async expected => {
    setShareError(null); setCancelled(false);
    const result = await Share.share({ message: opening.text }, anchor == null ? undefined : { anchor });
    if (validSource(expected)) setCancelled(result.action === "dismissedAction");
  }, (cause, expected) => { if (validSource(expected)) setShareError(cause); });
  const report = () => run("report", () => validSource() && current.current.reportable, () => {
    setReportError(null); startContentReport(opening.text); finish(); router.push("/report");
  }, cause => { if (validSource()) setReportError(cause); });
  const select = () => { if (!validSource() || flight.isPending() || !opening.context?.sessionId) return; selectingRef.current = true; setSelecting(true); };
  const visible = sameTarget() && allowed();
  return { opening, changed, selecting: selecting && !changed, busy, pending, disabled: busy || changed || closing || !visible,
    messageCopy: { ...messageCopy, copy: () => { if (validSource() && !flight.isPending()) messageCopy.copy(); } },
    responseCopy: { ...responseCopy, copy: () => { if (validSource() && !flight.isPending()) responseCopy.copy(); } }, hasResponse: hasResponse || responseCopy.inFlight,
    note: visible ? note : { status: "idle" as const, error: null, checkError: null, missing: false }, shareError: visible ? shareError : null, cancelled: visible && cancelled, reportError: visible ? reportError : null,
    checkDisabled: busy || !visible || closing, saveNote, check, share, report, select,
    close: () => { if (live.current && epoch === revision.current && !busy) finish(); },
  };
}
