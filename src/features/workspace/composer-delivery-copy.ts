/** Local validation is translated; detailed host errors retain their original evidence. */
export function composerDeliveryError(error: unknown, copy: (tr: string, en: string) => string) {
  const messages = {
    "This turn is running in the desktop app. Steer it there or queue your message.": [
      "Bu tur masaüstü uygulamasında çalışıyor. Oradan yönlendir veya mesajı sıraya al.",
      "This turn is running in the desktop app. Steer it there or queue your message.",
    ],
    "Update bycoda on this computer to send note context. Your draft is preserved.": [
      "Not bağlamını göndermek için bilgisayardaki bycoda’yı güncelle. Taslağın korunuyor.",
      "Update bycoda on this computer to send note context. Your draft is preserved.",
    ],
    "Turn off Plan mode or remove the note.": [
      "Plan modunu kapat veya notu kaldır.",
      "Turn off Plan mode or remove the note.",
    ],
    "Turn off Draft mode or remove the note.": [
      "Taslak modunu kapat veya notu kaldır.",
      "Turn off Draft mode or remove the note.",
    ],
    "Remove the command at the start of the message or remove the note.": [
      "Mesajın başındaki komutu sil veya notu kaldır.",
      "Remove the command at the start of the message or remove the note.",
    ],
    "To keep the note, send this message after the current turn finishes.": [
      "Notu korumak için bu mesajı mevcut tur bitince gönder.",
      "To keep the note, send this message after the current turn finishes.",
    ],
    "Delivery is unconfirmed. Review this message on the sending computer before resuming the queue.": [
      "Teslimat doğrulanamadı. Sırayı sürdürmeden önce mesajı gönderen bilgisayarda kontrol et.",
      "Delivery is unconfirmed. Review this message on the sending computer before resuming the queue.",
    ],
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
      "Turun bitmesini bekle, sonra yeniden gönder. Taslağın korunuyor.",
      "Wait for this turn to finish, then send again. Your draft is kept.",
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
