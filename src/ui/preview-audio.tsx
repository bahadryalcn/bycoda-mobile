import { View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Pause from "lucide-react-native/icons/pause";
import Play from "lucide-react-native/icons/play";
import { Body, IconButton } from "./primitives";
import { formatPlaybackTime } from "./preview-audio-model";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { space } from "./tokens";

/** A downloaded audio file with play/pause and a position readout. */
export function AudioPlayer({ uri, name }: { uri: string; name: string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.duration > 0 && status.currentTime >= status.duration) void player.seekTo(0);
      player.play();
    }
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <IconButton label={status.playing ? copy("Duraklat", "Pause") : copy("Oynat", "Play")} onPress={toggle}>
        {status.playing ? <Pause size={22} color={colors.text} /> : <Play size={22} color={colors.text} />}
      </IconButton>
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{name}</Body>
        <Body muted>{formatPlaybackTime(status.currentTime)} / {formatPlaybackTime(status.duration)}</Body>
      </View>
    </View>
  );
}
