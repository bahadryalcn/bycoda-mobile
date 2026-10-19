import { useMobileTheme } from "@/ui/theme";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Button, ErrorText, Row, Sheet } from "./primitives";
import { useCopy } from "./copy";
import { colors, space } from "./tokens";

export function MediaViewer({ uri, name, visible, onClose }: { uri: string; name: string; visible: boolean; onClose: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  const [error, setError] = useState<unknown>(null);
  const scale = useSharedValue(1); const saved = useSharedValue(1);
  const x = useSharedValue(0); const y = useSharedValue(0); const originX = useSharedValue(0); const originY = useSharedValue(0);
  useEffect(() => { scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; setError(null); }, [uri, visible]);
  const pinch = Gesture.Pinch().onUpdate((event) => { scale.value = Math.min(5, Math.max(1, saved.value * event.scale)); }).onEnd(() => { saved.value = scale.value; if (scale.value === 1) { x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; } });
  const pan = Gesture.Pan().onUpdate((event) => { if (scale.value > 1) { x.value = originX.value + event.translationX; y.value = originY.value + event.translationY; } }).onEnd(() => { originX.value = x.value; originY.value = y.value; });
  const tap = Gesture.Tap().numberOfTaps(2).onEnd(() => { scale.value = scale.value > 1 ? 1 : 2.5; saved.value = scale.value; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <Sheet visible={visible} title={name} size="full" scroll={false} onClose={onClose}>
    <View style={{ flex: 1, minHeight: 300, overflow: "hidden", backgroundColor: colors.background }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}><Animated.View style={[{ flex: 1 }, style]}><Image source={{ uri }} accessibilityLabel={name} contentFit="contain" style={{ flex: 1 }} /></Animated.View></GestureDetector>
    </View>
    <Row style={{ gap: space.sm }}><Button label={copy("Yakınlaştırmayı sıfırla", "Reset zoom")} tone="quiet" onPress={() => { scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; }} />
      {uri.startsWith("file:") ? <Button label={copy("Paylaş / kaydet", "Share / save")} tone="quiet" onPress={() => { void Sharing.isAvailableAsync().then((available) => { if (!available) throw new Error(copy("Bu cihazda paylaşım kullanılamıyor.", "Sharing is unavailable on this device.")); return Sharing.shareAsync(uri, { dialogTitle: name }); }).catch(setError); }} /> : null}</Row>
    <ErrorText error={error} />
  </Sheet>;
}
