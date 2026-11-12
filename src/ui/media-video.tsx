import { useState } from "react";
import { View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import Maximize from "lucide-react-native/icons/maximize-2";
import { Body, IconButton } from "./primitives";
import { ScreenOverlay } from "./overlays";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { radii, space } from "./tokens";
import { formatAttachmentSize } from "./media-inline-policy";
import { useRotatableScreen } from "./media-orientation";

function Player({ uri, name, fill }: { uri: string; name: string; fill?: boolean }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls accessibilityLabel={name} contentFit="contain" fullscreenOptions={{ enable: false }}
    style={fill ? { flex: 1 } : { width: "100%", aspectRatio: 16 / 9 }} />;
}

/** A downloaded video plays in the chat with native controls; the full-screen view may rotate to landscape. */
export function InlineVideo({ uri, name, size }: { uri: string; name: string; size?: number }) {
  const { colors } = useMobileTheme(), copy = useCopy(), insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  return <View style={{ gap: space.xs }}>
    <View style={{ borderRadius: radii.control, overflow: "hidden", backgroundColor: colors.viewer }}>
      {full ? <View style={{ width: "100%", aspectRatio: 16 / 9 }} /> : <Player uri={uri} name={name} />}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Body muted style={{ flex: 1 }} numberOfLines={1}>{[name, size !== undefined ? formatAttachmentSize(size) : ""].filter(Boolean).join(" · ")}</Body>
      <IconButton label={copy("Tam ekran", "Full screen")} density="compact" onPress={() => setFull(true)}><Maximize size={16} color={colors.muted} /></IconButton>
    </View>
    {full ? <VideoFullScreen uri={uri} name={name} onClose={() => setFull(false)} top={insets.top} /> : null}
  </View>;
}

function VideoFullScreen({ uri, name, top, onClose }: { uri: string; name: string; top: number; onClose(): void }) {
  const { colors } = useMobileTheme(), copy = useCopy();
  useRotatableScreen(true);
  return <ScreenOverlay visible label={name} onClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.viewer }}>
      <Player uri={uri} name={name} fill />
      <View style={{ position: "absolute", top: 0, left: 0, paddingTop: top, paddingHorizontal: space.sm }}>
        <IconButton label={copy("Kapat", "Close")} onPress={onClose}><X size={22} color={colors.viewerText} /></IconButton>
      </View>
    </View>
  </ScreenOverlay>;
}
