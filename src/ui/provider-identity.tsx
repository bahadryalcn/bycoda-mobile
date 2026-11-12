import { Image } from "expo-image";
import { Image as WebImage } from "react-native";
import type { RemoteProvider } from "@/domain/types";
import { useMobileTheme } from "./theme";

// Reuse the product's shipped provider artwork; no desktop UI/runtime is imported.
const providerAssets: Record<RemoteProvider, number> = {
  codex: require("../../../src/assets/providers/codex.svg"),
  claude: require("../../../src/assets/providers/claude.svg"),
  cursor: require("../../../src/assets/providers/cursor.svg"),
  grok: require("../../../src/assets/providers/grok.svg"),
  opencode: require("../../../src/assets/providers/opencode.svg"),
  pi: require("../../../src/assets/providers/pi.svg"),
  omp: require("../../../src/assets/providers/omp.svg"),
  fx: require("../../../src/assets/providers/fx.svg"),
  hermes: require("../../../src/assets/providers/hermes.svg"),
  antigravity: require("../../../src/assets/providers/antigravity.svg"),
  acp: require("../../../src/assets/providers/acp.svg"),
};

// Native SVG decoders do not resolve CSS currentColor or OKLCH gradient stops.
// These local copies retain the original geometry with explicit compatible paints.
const nativeProviderAssets: Record<RemoteProvider, number> = {
  ...providerAssets,
  cursor: require("../../assets/providers/cursor.svg"),
  grok: require("../../assets/providers/grok.svg"),
  opencode: require("../../assets/providers/opencode.svg"),
  pi: require("../../assets/providers/pi.svg"),
  omp: require("../../assets/providers/omp.svg"),
  fx: require("../../assets/providers/fx.svg"),
  acp: require("../../assets/providers/acp.svg"),
};

const monochromeProviders = new Set<RemoteProvider>([
  "cursor", "grok", "opencode", "pi", "fx", "hermes", "acp",
]);

/** Decorative identity beside an existing provider label, never an icon-only choice. */
export function ProviderIcon({ provider, size = 24 }: { provider: RemoteProvider; size?: number }) {
  const { colors } = useMobileTheme();
  // RN Web keeps a single measured image surface; Expo's animated web image wrapper
  // can paint an empty surface for small static SVG assets. Native keeps Expo decoding.
  if (process.env.EXPO_OS === "web") return (
    <WebImage
      source={providerAssets[provider]}
      resizeMode="contain"
      tintColor={monochromeProviders.has(provider) ? colors.text : undefined}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
  return (
    <Image
      source={nativeProviderAssets[provider]}
      contentFit="contain"
      tintColor={monochromeProviders.has(provider) ? colors.text : undefined}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}

/** Keep transport identifiers and existing searchable/accessibility labels unchanged. */
export function providerSelectionOption<T extends RemoteProvider>(provider: T) {
  return { value: provider, label: provider, icon: <ProviderIcon provider={provider} /> };
}
