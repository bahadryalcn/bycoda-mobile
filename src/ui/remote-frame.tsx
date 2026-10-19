import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { colors, radii } from "./tokens";
import { useMobileTheme } from "./theme";
import { framePoint, type FrameSize } from "./remote-frame-model";

/** Shared screenshot viewport; it owns native image geometry rather than a second button style. */
export function RemoteFrame({ uri, label, width, height, onPress, disabled }: {
  uri: string;
  label: string;
  width?: number;
  height?: number;
  onPress?: (point: { x: number; y: number }) => void;
  disabled?: boolean;
}) {
  useMobileTheme();
  const [natural, setNatural] = useState<FrameSize>({ width: 0, height: 0 });
  const [display, setDisplay] = useState<FrameSize>({ width: 0, height: 0 });
  const source = width && height ? { width, height } : natural;
  const interactive = !!onPress && !disabled && source.width > 0 && source.height > 0;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!onPress && !interactive }}
      disabled={!interactive}
      onLayout={(event) => setDisplay(event.nativeEvent.layout)}
      onPress={(event) => {
        const point = framePoint(event.nativeEvent.locationX, event.nativeEvent.locationY, display, source);
        if (point && interactive) onPress?.(point);
      }}
      style={{ minWidth: 0, width: "100%", overflow: "hidden", borderRadius: radii.preview, backgroundColor: colors.panel }}
    >
      <View pointerEvents="none" style={{ width: "100%", aspectRatio: source.width > 0 && source.height > 0 ? source.width / source.height : 0.5 }}>
        <Image
          source={{ uri }}
          accessibilityLabel={label}
          accessible={false}
          contentFit="contain"
          transition={0}
          onLoad={(event) => setNatural({ width: event.source.width, height: event.source.height })}
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    </Pressable>
  );
}
