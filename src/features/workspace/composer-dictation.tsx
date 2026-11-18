import { View } from "react-native";
import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { ErrorNotice, Notice } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { isMicrophoneDenied, MicrophonePermissionNotice } from "../voice-settings/microphone-permission-notice";
import type { useDictation } from "./use-dictation";

type Dictation = ReturnType<typeof useDictation>;

/** Mic toggle for the composer toolbar; a blocked state stays visible with its reason as the label. */
export function ComposerDictationButton({ dictation }: { dictation: Dictation }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const { view } = dictation;
  const labels = {
    start: copy("Sesle yaz", "Dictate message"),
    stop: copy("Kaydı bitir", "Finish recording"),
    preparing: copy("Mikrofon hazırlanıyor", "Preparing microphone"),
    transcribing: copy("Yazıya çevriliyor", "Transcribing"),
    "no-computer": copy("Sesle yazmak için bir bilgisayar bağla", "Connect a computer to dictate"),
    update: copy("Sesle yazmak için bilgisayarındaki Bycoda'yı güncelle", "Update bycoda on your computer to dictate"),
    busy: copy("Sesli görüşme veya kayıt sürüyor", "A voice call or recording is in progress"),
  } as const;
  return <ChatCircleAction label={labels[view.action]} active={view.active} disabled={view.disabled} busy={view.busy} onPress={dictation.toggle}>
    {view.active ? <Square size={13} strokeWidth={0} fill={colors.primaryText} color={colors.primaryText} /> : <Mic size={19} strokeWidth={2.2} color={view.disabled && !view.busy ? colors.tertiary : colors.text} />}
  </ChatCircleAction>;
}

/** Recording and failure feedback shown above the composer; permission loss offers system Settings. */
export function ComposerDictationFeedback({ dictation }: { dictation: Dictation }) {
  const copy = useCopy();
  const { phase, error } = dictation;
  if (error) return <View style={{ paddingBottom: space.xs }}>
    {isMicrophoneDenied(error) ? <MicrophonePermissionNotice />
      : <ErrorNotice error={error} message={copy("Sesle yazma kullanılamıyor. Mikrofon iznini ve bilgisayardaki ses kurulumunu kontrol et.", "Dictation is unavailable. Check microphone permission and voice setup on your computer.")} />}
  </View>;
  if (phase === "recording") return <View accessibilityLiveRegion="polite" style={{ paddingBottom: space.xs }}>
    <Notice message={copy("Dinleniyor (en fazla 30 saniye). Bitirmek için kareye dokun.", "Listening (up to 30 seconds). Tap the square to finish.")} />
  </View>;
  return null;
}
