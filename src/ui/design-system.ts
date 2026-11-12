import { cn } from "panelui-native/utils/cn";
import type { ButtonProps } from "./component-props";

/** Product variants shared by every screen; raw upstream defaults stay behind the UI facade. */
const toneClasses = {
  default: "border-transparent bg-fill",
  primary: "border-transparent bg-primary",
  secondary: "border-transparent bg-transparent active:bg-fill",
  quiet: "border-transparent bg-transparent",
  info: "border-transparent bg-info-surface",
  success: "border-transparent bg-success-surface",
  warning: "border-transparent bg-warning-surface",
  danger: "border-transparent bg-danger-surface",
} satisfies Record<NonNullable<ButtonProps["tone"]>, string>;

export function controlClasses({
  tone = "default",
  density = "regular",
  selected,
}: Pick<ButtonProps, "tone" | "density" | "selected"> = {}) {
  return cn(
    "min-h-control min-w-visual active:opacity-75 flex-row items-center justify-center gap-ui-xs rounded-control border-0 shadow-none px-ui-md py-ui-xs web:focus-visible:outline-2 web:focus-visible:outline-ring",
    toneClasses[tone],
    density === "compact" && "min-h-chip px-ui-sm",
    selected && "bg-info-surface",
  );
}

export const fieldClasses =
  "min-h-control rounded-control border border-border bg-fill text-foreground px-ui-md py-ui-xs web:focus-visible:outline-2 web:focus-visible:outline-ring";
export const surfaceClasses = "rounded-card border-0 bg-card shadow-none p-ui-md gap-ui-sm";
export const rowClasses =
  "min-h-control rounded-none border-0 bg-transparent px-ui-lg py-ui-row active:bg-panel";
export const bodyClasses = "text-base text-foreground";
export const metadataClasses = "text-xs text-muted-foreground";
