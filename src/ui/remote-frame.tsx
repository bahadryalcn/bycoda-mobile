import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { radii } from "./tokens";
import { useMobileTheme } from "./theme";
import { framePoint, knownFrameSize, type FrameSize } from "./remote-frame-model";

/** Shared screenshot viewport; it owns native image geometry rather than a second button style. */
export function RemoteFrame({ uri, label, width, height, onPress, disabled }: {
  uri: string;
  label: string;
  width?: number;
  height?: number;
  onPress?: (point: { x: number; y: number }) => void;
  disabled?: boolean;
}) {
  const { colors } = useMobileTheme();
  const [natural, setNatural] = useState<FrameSize | undefined>(undefined);
  const [display, setDisplay] = useState<FrameSize>({ width: 0, height: 0 });
  // Known payload dimensions size the first frame; the decoded image size is only the fallback.
  const source = knownFrameSize(width, height) ?? natural;
  const interactive = !!onPress && !disabled && !!source;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!onPress && !interactive }}
      disabled={!interactive}
      onLayout={(event) => setDisplay(event.nativeEvent.layout)}
      onPress={(event) => {
        const point = source && framePoint(event.nativeEvent.locationX, event.nativeEvent.locationY, display, source);
        if (point && interactive) onPress?.(point);
      }}
      style={{ minWidth: 0, width: "100%", overflow: "hidden", borderRadius: radii.preview, backgroundColor: colors.panel }}
    >
      <View pointerEvents="none" style={{ width: "100%", aspectRatio: source ? source.width / source.height : 0.5 }}>
        <Image
          source={{ uri }}
          accessibilityLabel={label}
          accessible={false}
          // Remote screens are private and change per poll: never keep them in the disk or memory image cache.
          cachePolicy="none"
          contentFit="contain"
          transition={0}
          // Keep the previous size object when it did not change, so a Live frame does not add a render.
          onLoad={(event) => {
            const next = knownFrameSize(event.source.width, event.source.height);
            setNatural((previous) =>
              previous && next && previous.width === next.width && previous.height === next.height ? previous : next,
            );
          }}
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    </Pressable>
  );
}
