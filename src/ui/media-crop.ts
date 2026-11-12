import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export type CropPreset = "free" | "1:1" | "4:3" | "16:9";
export const CROP_PRESETS: readonly CropPreset[] = ["free", "1:1", "4:3", "16:9"];
/** A crop rectangle in fractions (0..1) of the image, so it survives layout changes. */
export type CropRect = { x: number; y: number; w: number; h: number };

const MIN = 0.1;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ratio = (preset: CropPreset) => preset === "1:1" ? 1 : preset === "4:3" ? 4 / 3 : preset === "16:9" ? 16 / 9 : 0;

/** Width/height of the image as drawn; a fixed pixel ratio r means h = w * aspect / r in fractions. */
function heightFor(w: number, preset: CropPreset, aspect: number) { return w * aspect / ratio(preset); }

/** Largest centred rectangle of the preset ratio; free starts as a 80% inset. */
export function initialCrop(preset: CropPreset, aspect: number): CropRect {
  if (preset === "free") return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  let w = 0.9, h = heightFor(w, preset, aspect);
  if (h > 0.9) { h = 0.9; w = h * ratio(preset) / aspect; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Moves the rectangle by a fraction delta, keeping it fully inside the image. */
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect {
  return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
}

/** Drags the bottom-right corner; fixed presets keep their ratio. */
export function resizeCrop(rect: CropRect, dw: number, dh: number, preset: CropPreset, aspect: number): CropRect {
  let w = clamp(rect.w + dw, MIN, 1 - rect.x);
  if (preset === "free") return { ...rect, w, h: clamp(rect.h + dh, MIN, 1 - rect.y) };
  let h = heightFor(w, preset, aspect);
  if (h > 1 - rect.y) { h = 1 - rect.y; w = h * ratio(preset) / aspect; }
  return { ...rect, w, h };
}

/** Whole-pixel crop box for expo-image-manipulator, never leaving the image. */
export function toPixelCrop(rect: CropRect, width: number, height: number) {
  const originX = clamp(Math.round(rect.x * width), 0, width - 1), originY = clamp(Math.round(rect.y * height), 0, height - 1);
  return {
    originX, originY,
    width: clamp(Math.round(rect.w * width), 1, width - originX),
    height: clamp(Math.round(rect.h * height), 1, height - originY),
  };
}

/** Renders the crop to a new local file; PNG sources stay lossless. */
export async function cropImage(uri: string, rect: CropRect, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri).crop(toPixelCrop(rect, width, height));
  const image = await context.renderAsync();
  const png = /\.png(\?|$)/i.test(uri);
  const result = await image.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.92 });
  return result.uri;
}
