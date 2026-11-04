import { useMobileTheme } from "@/ui/theme";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Button, ErrorText, Row, Sheet } from "./primitives";
import { useMediaSharing } from "./use-media-sharing";
import { useCopy } from "./copy";
import { colors, space } from "./tokens";
import type { MessageContext } from "./media-policy";
import { ReaderContext } from "./reader-context";

type MediaViewerProps = { uri: string; name: string; visible: boolean; onClose: () => void; context?: MessageContext };

/** Zoom and error state belong to one image and one opening, so a new uri or reopening remounts the body. */
export function MediaViewer(props: MediaViewerProps) {
  const [opening, setOpening] = useState({ visible: props.visible, count: 0 });
  let count = opening.count;
  if (props.visible !== opening.visible) {
    count = props.visible ? opening.count + 1 : opening.count;
    setOpening({ visible: props.visible, count });
  }
  return <MediaViewerBody key={`${count}:${props.uri}`} {...props} />;
}

function MediaViewerBody({ uri, name, visible, onClose, context }: MediaViewerProps) {
  useMobileTheme();
  const copy = useCopy();
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const imageOwner = useRef({ visible, attempt }); imageOwner.current = { visible, attempt };
  const sharing = useMediaSharing({ uri, name, enabled: visible && uri.startsWith("file:") });
  const scale = useSharedValue(1); const saved = useSharedValue(1);
  const x = useSharedValue(0); const y = useSharedValue(0); const originX = useSharedValue(0); const originY = useSharedValue(0);
  const pinch = Gesture.Pinch().onUpdate((event) => { scale.value = Math.min(5, Math.max(1, saved.value * event.scale)); }).onEnd(() => { saved.value = scale.value; if (scale.value === 1) { x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; } });
  const pan = Gesture.Pan().onUpdate((event) => { if (scale.value > 1) { x.value = originX.value + event.translationX; y.value = originY.value + event.translationY; } }).onEnd(() => { originX.value = x.value; originY.value = y.value; });
  const tap = Gesture.Tap().numberOfTaps(2).onEnd(() => { scale.value = scale.value > 1 ? 1 : 2.5; saved.value = scale.value; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const footer = <>
    <Row style={{ gap: space.sm }}><Button label={copy("Yakınlaştırmayı sıfırla", "Reset zoom")} tone="quiet" onPress={() => { scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; }} />
      {uri.startsWith("file:") ? <Button label={copy("Paylaş / kaydet", "Share / save")} tone="quiet" busy={sharing.busy} onPress={sharing.share} /> : null}</Row>
    <ErrorText error={sharing.error} />
    <ErrorText error={previewError} />
    {previewError ? <Button label={copy("Yeniden dene", "Retry")} tone="quiet" onPress={() => { setPreviewError(null); setAttempt(value => value + 1); }} /> : null}
  </>;
  return <Sheet visible={visible} title={name} size="full" scroll={false} onClose={onClose} footer={footer}>
    <ReaderContext context={context} bounded />
    <View style={{ flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: colors.background }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}><Animated.View style={[{ flex: 1 }, style]}><Image key={attempt} source={{ uri }} accessibilityLabel={name} contentFit="contain" onError={() => { if (imageOwner.current.visible && imageOwner.current.attempt === attempt) setPreviewError(new Error(copy("Önizleme açılamadı.", "Preview could not be opened."))); }} style={{ flex: 1 }} /></Animated.View></GestureDetector>
    </View>
  </Sheet>;
}
