type Copy = (tr: string, en: string) => string;
export function socialLabel(value: string, copy: Copy) {
  const labels: Record<string, string> = {
    read: copy("Oku", "Read"), draft: copy("Taslak", "Draft"), publish: copy("Yayınla", "Publish"), reply: copy("Yanıt", "Reply"), message: copy("Mesaj", "Message"), comment: copy("Yorum", "Comment"),
    available: copy("Kullanılabilir", "Available"), unavailable: copy("Kullanılamıyor", "Unavailable"), unsupported: copy("Desteklenmiyor", "Unsupported"), blocked: copy("Engellendi", "Blocked"),
    automatic: copy("Otomatik", "Automatic"), approval: copy("Onay iste", "Ask for approval"),
    pending: copy("Bekliyor", "Pending"), connected: copy("Bağlandı", "Connected"), disconnected: copy("Bağlı değil", "Disconnected"), failed: copy("Başarısız", "Failed"),
    awaiting_selection: copy("Hesap seçimi bekleniyor", "Choose an account"), awaiting_callback: copy("Tarayıcı onayı bekleniyor", "Waiting for browser approval"),
  };
  return labels[value] ?? value;
}
