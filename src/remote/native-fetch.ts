/** Expo's native transport enforces redirect:error before forwarding secrets. */
export const nativeHostFetch: typeof fetch = async (input, init) => {
  if (process.env.EXPO_OS === "android" || process.env.EXPO_OS === "ios") {
    const nativeFetch = (await import("expo/fetch")).fetch as typeof fetch;
    return nativeFetch(input, init);
  }
  return globalThis.fetch(input, init);
};
