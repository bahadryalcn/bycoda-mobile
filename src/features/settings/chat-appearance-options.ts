import type { useCopy } from "@/ui/copy";

/** One value/label mapping for the preference editor and its current-value row. */
export function chatTextSizeOptions(copy: ReturnType<typeof useCopy>) {
  return [
    { value: "compact" as const, label: copy("Küçük", "Small") },
    { value: "standard" as const, label: copy("Normal", "Standard") },
    { value: "large" as const, label: copy("Büyük", "Large") },
  ];
}

export function toolVisibilityOptions(copy: ReturnType<typeof useCopy>) {
  return [
    { value: "all" as const, label: copy("Tümü", "Show all") },
    { value: "hide-successful" as const, label: copy("Başarılıları gizle", "Hide successful") },
    { value: "hide-all" as const, label: copy("Tümünü gizle", "Hide all") },
    { value: "zen" as const, label: copy("Zen", "Zen") },
  ];
}

/** Code and terminal sizes share one stepped scale. */
export function codeSizeOptions(copy: ReturnType<typeof useCopy>) {
  return [
    { value: "small" as const, label: copy("Küçük", "Small") },
    { value: "standard" as const, label: copy("Normal", "Standard") },
    { value: "large" as const, label: copy("Büyük", "Large") },
  ];
}
