import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform } from "react-native";
import type { NativeSelectableTextProps } from "./src/types";
export type * from "./src/types";

/**
 * The native selectable text layer, or null on web, in tests and in builds without the module.
 * Callers keep a JS fallback (the selection sheet) for null.
 */
export const NativeSelectableText: ComponentType<NativeSelectableTextProps> | null =
  Platform.OS !== "web" && requireOptionalNativeModule("BycodaTextSelection")
    ? requireNativeView<NativeSelectableTextProps>("BycodaTextSelection")
    : null;
