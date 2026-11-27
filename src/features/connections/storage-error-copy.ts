import { SAVED_COMPUTERS_LOAD_FAILED, SAVED_COMPUTERS_RECOVERY_FAILED } from "@/state/machines";

type Copy = (turkish: string, english: string) => string;

/**
 * The saved-computers store keeps a stable English key (also the catalog key); every surface shows it
 * translated. Copy pairs stay literal for the locale extractor, so keep them equal to the keys.
 */
export function storageErrorText(error: string | null | undefined, copy: Copy): string | undefined {
  if (!error) return undefined;
  if (error === SAVED_COMPUTERS_RECOVERY_FAILED)
    return copy(
      "Bağlantı geri yüklenemedi. Bağlantıları yeniden yükle ve bu bilgisayarı yeniden eşleştir.",
      "Connection recovery failed. Reload connections and pair this computer again.",
    );
  if (error === SAVED_COMPUTERS_LOAD_FAILED)
    return copy(
      "Kaydedilmiş bilgisayarlar yüklenemedi. Bağlantıları değiştirmeden önce yeniden dene.",
      "Saved computers could not be loaded. Retry before changing connections.",
    );
  return copy("Kaydedilmiş bilgisayarlar kullanılamıyor.", "Saved computers are unavailable.");
}
