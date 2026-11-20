/** Shared [tr, en] copy for private records that cannot be read right now. Kept out of `@/ui/copy` so callers can use it without importing a hook. */
export const RECORD_ACCESS_UNAVAILABLE: readonly [string, string] = [
  "Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol et.",
  "Record access is unavailable. Check the original computer and project connection.",
];
