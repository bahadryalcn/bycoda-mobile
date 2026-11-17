import { requireOptionalNativeModule } from "expo";
export * from "./src/types";
import type { FoldNative } from "./src/types";

/** Android only. iOS, web and Expo Go have no module; the foldable iPhone is handled by window size. */
export function nativeFold(): FoldNative | null {
  return requireOptionalNativeModule<FoldNative>("BycodaFold");
}
