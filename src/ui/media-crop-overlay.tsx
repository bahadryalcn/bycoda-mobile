import { useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import Check from "lucide-react-native/icons/check";
import { Button, ErrorText, IconButton } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { space } from "./tokens";
import { CROP_PRESETS, cropImage, initialCrop, moveCrop, resizeCrop, type CropPreset, type CropRect } from "./media-crop";

const HANDLE = 44;

/** Crop stage for one local image: drag the frame, drag its corner, pick free or a fixed ratio. */
export function MediaCropOverlay({ uri, name, width, height, onCancel, onApply }: {
  uri: string; name: string; width: number; height: number; onCancel(): void; onApply(uri: string): void;
}) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const aspect = width / height;
  const [preset, setPreset] = useState<CropPreset>("free");
  const [rect, setRect] = useState<CropRect>(() => initialCrop("free", aspect));
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const start = useRef(rect);
  // The image is drawn with contentFit contain, so the crop frame lives in that fitted box.
  const scale = stage.w && stage.h ? Math.min(stage.w / width, stage.h / height) : 0;
  const box = { w: width * scale, h: height * scale };
  const onLayout = (event: LayoutChangeEvent) => setStage({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height });
  const labels: Record<CropPreset, string> = { free: copy("Serbest", "Free"), "1:1": "1:1", "4:3": "4:3", "16:9": "16:9" };
  const choose = (next: CropPreset) => { setPreset(next); setRect(initialCrop(next, aspect)); };
  const move = Gesture.Pan().runOnJS(true).onBegin(() => { start.current = rect; })
    .onUpdate((event) => setRect(moveCrop(start.current, event.translationX / box.w, event.translationY / box.h)));
  const resize = Gesture.Pan().runOnJS(true).onBegin(() => { start.current = rect; })
    .onUpdate((event) => setRect(resizeCrop(start.current, event.translationX / box.w, event.translationY / box.h, preset, aspect)));
  const apply = async () => {
    setBusy(true); setError(null);
    try { onApply(await cropImage(uri, rect, width, height)); } catch (cause) { setError(cause); setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: colors.viewer }}>
    <View onLayout={onLayout} style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
      <Image source={{ uri }} accessibilityLabel={name} contentFit="contain" style={{ width: stage.w, height: stage.h, position: "absolute" }} />
      {scale ? <View style={{ width: box.w, height: box.h }} pointerEvents="box-none">
        <GestureDetector gesture={move}>
          <View style={{ position: "absolute", left: rect.x * box.w, top: rect.y * box.h, width: rect.w * box.w, height: rect.h * box.h, borderWidth: 2, borderColor: colors.viewerText, backgroundColor: colors.scrim }} />
        </GestureDetector>
        <GestureDetector gesture={resize}>
          <View style={{ position: "absolute", left: (rect.x + rect.w) * box.w - HANDLE / 2, top: (rect.y + rect.h) * box.h - HANDLE / 2, width: HANDLE, height: HANDLE, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.viewerText }} />
          </View>
        </GestureDetector>
      </View> : null}
    </View>
    <View style={{ paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, paddingHorizontal: Math.max(space.sm, insets.left), gap: space.xs, backgroundColor: colors.scrim }}>
      <ErrorText error={error} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <IconButton label={copy("Kırpmayı iptal et", "Cancel crop")} disabled={busy} onPress={onCancel}><X size={22} color={colors.viewerText} /></IconButton>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: space.xs }}>
          {CROP_PRESETS.map((value) => <Button key={value} label={labels[value]} tone="secondary" density="compact" selected={preset === value} disabled={busy} onPress={() => choose(value)} />)}
        </View>
        <IconButton label={copy("Kırpmayı uygula", "Apply crop")} busy={busy} onPress={() => { void apply(); }}><Check size={22} color={colors.viewerText} /></IconButton>
      </View>
    </View>
  </View>;
}
