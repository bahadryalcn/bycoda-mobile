import { tva } from "@gluestack-ui/utils/nativewind-utils";

/** Product variants shared by every screen; raw upstream defaults stay behind the UI facade. */
export const controlClasses = tva({
  base: "min-h-control min-w-touch flex-row items-center justify-center gap-ui-sm rounded-control border px-ui-lg py-ui-sm web:focus-visible:outline-2 web:focus-visible:outline-ring data-[disabled=true]:opacity-45",
  variants: {
    tone: {
      default: "border-separator bg-raised dark:border-separator dark:bg-raised active:bg-accent",
      primary: "border-primary bg-primary active:opacity-80",
      secondary: "border-transparent bg-secondary active:bg-accent",
      quiet: "border-transparent bg-transparent active:bg-accent",
      info: "border-info-border bg-info-surface active:opacity-80",
      success: "border-success-border bg-success-surface active:opacity-80",
      warning: "border-warning-border bg-warning-surface active:opacity-80",
      danger: "border-danger-border bg-danger-surface active:opacity-80",
    },
    density: { regular: "min-h-control", compact: "min-h-control px-ui-md" },
    selected: { true: "border-ring bg-accent", false: "" },
  },
  defaultVariants: { tone: "default", density: "regular" },
});

export const fieldClasses =
  "min-h-control rounded-control border border-input bg-panel text-foreground px-ui-md py-ui-sm web:focus-visible:outline-2 web:focus-visible:outline-ring";
export const surfaceClasses = "rounded-card border-0 bg-card p-ui-md gap-ui-sm";
export const rowClasses =
  "min-h-control rounded-control border-0 bg-panel p-ui-md active:bg-raised";
export const bodyClasses = "text-base text-foreground";
export const metadataClasses = "text-xs text-muted-foreground";
