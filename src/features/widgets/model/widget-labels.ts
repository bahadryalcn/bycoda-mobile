import type { WidgetLabels } from "./snapshot";

export function widgetLabels(copy: (tr: string, en: string) => string): WidgetLabels {
  return {
    title: copy("Oturumlar", "Sessions"),
    running: copy("Çalışıyor", "Running"),
    needsInput: copy("Yanıt bekliyor", "Needs input"),
    failed: copy("Başarısız", "Failed"),
    done: copy("Tamamlandı", "Completed"),
    waitingAnswer: copy("Yanıtın bekleniyor", "Waiting for your answer"),
    started: copy("Başladı", "Started"),
    failureCategories: {
      auth_expired: copy("Sağlayıcı oturumu sona erdi", "Provider sign-in expired"),
      rate_limited: copy("Kullanım sınırına ulaşıldı", "Rate limited"),
      crashed: copy("Ajan beklenmedik şekilde kapandı", "Agent crashed"),
      stopped: copy("Durduruldu", "Stopped"),
      failed: copy("Tur başarısız oldu", "Turn failed"),
    },
    empty: copy("Aktif oturum yok", "No active sessions"),
    clear: copy("Bekleyen bir iş yok", "Nothing needs your attention"),
    locked: copy("Devam etmek için bycoda'yı aç", "Open bycoda to continue"),
    setup: copy("Bağlanmak için bycoda'yı aç", "Open bycoda to connect"),
    stale: copy("Yenilemek için bycoda'yı aç", "Open bycoda to refresh"),
  };
}
