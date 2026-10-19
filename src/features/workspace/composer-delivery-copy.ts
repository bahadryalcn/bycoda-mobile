/** Local validation is translated; detailed host errors retain their original evidence. */
export function composerDeliveryError(error: unknown, copy: (tr: string, en: string) => string) {
  const messages = {
    "This queued message has missing files. Repair its attachments on your computer before sending.":
      [
        "Sıradaki mesajın dosyaları eksik. Göndermeden önce bilgisayarda eklerini düzelt.",
        "This queued message has missing files. Repair its attachments on your computer before sending.",
      ],
    "Send this queued message from your computer to preserve its special content.": [
      "Özel içeriğini korumak için sıradaki bu mesajı bilgisayardan gönder.",
      "Send this queued message from your computer to preserve its special content.",
    ],
    "This queued message changed on another computer. Reopen it before editing.": [
      "Sıradaki mesaj başka bir bilgisayarda değişti. Düzenlemeden önce güncel mesajı yükle.",
      "This queued message changed on another computer. Reopen it before editing.",
    ],
    "The queue is controlled elsewhere. Reopen the message before editing.": [
      "Sıra başka bir istemcinin kontrolünde. Düzenlemeden önce mesajı yeniden aç.",
      "The queue is controlled elsewhere. Reopen the message before editing.",
    ],
    "The saved queued edit could not be read.": [
      "Sıradaki mesajın kayıtlı düzenlemesi okunamadı.",
      "The saved queued edit could not be read.",
    ],
    "Write a message or keep an attachment before saving.": [
      "Kaydetmeden önce bir mesaj yaz veya bir ek bırak.",
      "Write a message or keep an attachment before saving.",
    ],
    "This queued message is no longer available. Your edit is kept on this device.": [
      "Bu mesaj artık sırada değil. Düzenlemen bu cihazda korunuyor.",
      "This queued message is no longer available. Your edit is kept on this device.",
    ],
    "Refresh the running turn before steering it.": [
      "Yönlendirmeden önce çalışan turu yenile.",
      "Refresh the running turn before steering it.",
    ],
    "Wait for this turn, queue your message, or choose Steer.": [
      "Turun bitmesini bekle, mesajı sıraya al veya Yönlendir’i seç.",
      "Wait for this turn, queue your message, or choose Steer.",
    ],
    "Remove attachments before compacting context.": [
      "Bağlamı sıkıştırmadan önce ekleri kaldır.",
      "Remove attachments before compacting context.",
    ],
    "Refresh or resume the queue before sending.": [
      "Göndermeden önce sırayı yenile veya sürdür.",
      "Refresh or resume the queue before sending.",
    ],
    "This queued message uses different model settings. Restore its model before sending.": [
      "Sıradaki mesaj farklı model ayarları kullanıyor. Göndermeden önce modelini geri yükle.",
      "This queued message uses different model settings. Restore its model before sending.",
    ],
    "The queue is unavailable. Refresh it before making changes.": [
      "Sıraya ulaşılamıyor. Değişiklik yapmadan önce yenile.",
      "The queue is unavailable. Refresh it before making changes.",
    ],
    "Wait for the queued send to finish before changing the queue.": [
      "Sırayı değiştirmeden önce sıradaki gönderimin tamamlanmasını bekle.",
      "Wait for the queued send to finish before changing the queue.",
    ],
  } as const;
  const message = error instanceof Error ? (error.message as keyof typeof messages) : undefined;
  return message && messages[message]
    ? copy(...(messages[message] as readonly [string, string]))
    : undefined;
}
