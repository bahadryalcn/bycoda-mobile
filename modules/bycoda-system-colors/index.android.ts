import { requireOptionalNativeModule } from "expo";
import { parseSystemColorSwatches, type SystemColorSwatches } from "./swatches";

/** Synchronous read precedes the first cached palette resolution, including cold start. */
export function readSystemColorSwatches(dark: boolean): SystemColorSwatches | null {
  const native = requireOptionalNativeModule<{ getSwatches(dark: boolean): unknown }>("BycodaSystemColors");
  return parseSystemColorSwatches(native?.getSwatches(dark));
}
