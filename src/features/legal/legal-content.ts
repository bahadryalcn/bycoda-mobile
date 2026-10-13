export type LegalDocumentId = "privacy" | "terms" | "help";
export type LegalCopy = (tr: string, en: string) => string;
export type LegalText = readonly [tr: string, en: string];
export type LegalSection = {
  title: LegalText;
  paragraphs: readonly LegalText[];
};

export const legalUpdatedDate: LegalText = ["11 Ekim 2026", "11 October 2026"];
export const supportEmail = "info@bahadrhllyalcn.com";
export const privacyPolicyUrl =
  "https://github.com/bahadryalcn/bycoda/blob/main/docs/guides/privacy-policy.md";
export const repositoryUrl = "https://github.com/bahadryalcn/bycoda";

const titles: Record<LegalDocumentId, LegalText> = {
  privacy: ["Gizlilik politikası", "Privacy policy"],
  terms: ["Kullanım koşulları", "Terms of use"],
  help: ["Yardım ve destek", "Help & support"],
};

export function legalDocumentTitle(document: LegalDocumentId, copy: LegalCopy) {
  return copy(...titles[document]);
}

export function isLegalDocument(value: unknown): value is LegalDocumentId {
  return value === "privacy" || value === "terms" || value === "help";
}

export const legalSections: Record<LegalDocumentId, readonly LegalSection[]> = {
  privacy: [
    {
      title: ["Kapsam ve iletişim", "Scope & contact"],
      paragraphs: [
        [
          "Bu politika bycoda mobil uygulamasını ve bağlandığın bycoda Host ile veri alışverişini açıklar. Uygulama, bahadryalcn tarafından bağımsız olarak sürdürülen açık kaynak projesidir. Gizlilik soruları ve talepler için info@bahadrhllyalcn.com adresine yazabilirsin.",
          "This policy explains the bycoda mobile app and its exchanges with your connected bycoda Host. The app is an open-source project independently maintained by bahadryalcn. For privacy questions and requests, contact info@bahadrhllyalcn.com.",
        ],
      ],
    },
    {
      title: ["bycoda hesabı ve takip", "bycoda accounts & tracking"],
      paragraphs: [
        [
          "bycoda hesabı oluşturman gerekmez. Mobil uygulama projelerini, konuşmalarını, bağlantı anahtarlarını veya kullanım geçmişini geliştiriciye göndermez. Geliştirici tarafından işletilen reklam, davranış takibi, analitik veya otomatik çökme raporu gönderimi içermez. Geliştirici etkinliğini izlemez, verilerini satmaz ve içeriğini model eğitimi için kullanmaz.",
          "You do not create a bycoda account. The mobile app does not send your projects, conversations, connection keys or usage history to the maintainer. It includes no maintainer-operated advertising, behavioral tracking, analytics or automatic crash-report uploads. The maintainer does not monitor your activity, sell your data or use your content to train models.",
        ],
        [
          "Bu, hiçbir veri saklanmadığı veya ağ kullanılmadığı anlamına gelmez. Veriler telefonunda, bağlandığın bilgisayarda ve seçtiğin servislerde işlenir.",
          "This does not mean no data is stored or that the network is never used. Data is processed on your phone, connected computer and chosen services.",
        ],
      ],
    },
    {
      title: ["Telefonunda saklanan veriler", "Data stored on your phone"],
      paragraphs: [
        [
          "Bilgisayar adları ve adresleri, bağlantı kimlikleri, seçili proje, dil ve bağlantı tercihleri uygulamanın yerel AsyncStorage alanında saklanır. Gönderilmemiş mesajlar, dosya düzenlemeleri ve not taslakları da yerel olarak saklanabilir. Bu alanların tamamının ayrıca şifrelendiği garantisi verilmez.",
          "Computer names and addresses, connection identifiers, selected projects, language and connection preferences are stored in the app’s local AsyncStorage. Unsent messages, file edits and note drafts may also be stored locally. These stores are not guaranteed to have additional application-level encryption.",
        ],
        [
          "Native uygulama bilgisayar erişim anahtarlarını işletim sisteminin korumalı SecureStore alanında tutar. Tarayıcı önizlemesinde bağlantı anahtarları yalnızca bellekte tutulur. Eşleşme kodunu veya erişim anahtarını başkalarıyla paylaşma.",
          "The native app keeps computer access keys in the operating system’s protected SecureStore. The browser preview keeps connection keys only in memory. Do not share pairing codes or access keys.",
        ],
        [
          "Proje dosyaları, oturum geçmişi, görevler, sosyal hesap verileri ve sağlayıcı kimlik bilgileri bağlı bilgisayarda veya ilgili serviste tutulur. Mobil uygulama, kullandığın ekranlar için bu verileri görüntüleyebilir ve bellekte geçici olarak önbelleğe alabilir.",
          "Project files, session history, tasks, social account data and provider credentials are held on the connected computer or relevant service. The mobile app can display this data and temporarily cache it in memory for the screens you use.",
        ],
      ],
    },
    {
      title: ["İzinler ve uygulama kilidi", "Permissions & app lock"],
      paragraphs: [
        [
          "Kamera yalnızca bilgisayar eşleştirme QR kodunu taramayı seçtiğinde istenir. QR taraması görüntü veya video kaydetmez ya da geliştiriciye göndermez. Kamera iznini reddedebilir ve elle bağlantı bilgilerini girebilirsin; izni telefon ayarlarından geri alabilirsin.",
          "Camera access is requested only when you choose to scan a computer pairing QR code. QR scanning does not record images or video or send them to the maintainer. You can decline camera access and enter connection details manually, and revoke permission in phone settings.",
        ],
        [
          "Uygulama kilidi parmak izi, yüz tanıma veya telefon ekran kilidi doğrulamasını işletim sistemine yaptırır. bycoda biyometrik şablonlarını veya ekran kilidi parolanı almaz ve saklamaz; yalnızca doğrulama sonucunu kullanır. Kilit tercihi korumalı yerel depoda saklanır.",
          "App lock asks the operating system to authenticate with a fingerprint, face recognition or your phone’s screen lock. bycoda does not receive or store biometric templates or your screen-lock passcode; it uses only the authentication result. The lock preference is kept in protected local storage.",
        ],
        [
          "Ayarlar → Güvenli erişim bölümünde yeniden doğrulama süresini hemen, 30 saniye, 1, 5 veya 15 dakika olarak seçebilirsin. Uygulamadan ayrıldığında içerik hemen gizlenir ve telefondan bilgisayar erişimi durur. Seçtiğin süre dolmadan dönersen yeniden doğrulama gerekmez. Uygulama yeniden başlatıldığında veya Şimdi kilitle seçildiğinde giriş her zaman tekrar doğrulanır.",
          "Settings → Secure access lets you require authentication immediately or after 30 seconds, 1, 5 or 15 minutes away. Content is hidden and phone-side computer access pauses as soon as you leave. Returning before the selected delay does not require authentication again. Restarting the app or choosing Lock now always requires authentication again.",
        ],
      ],
    },
    {
      title: ["Bağlı bilgisayar ve AI sağlayıcıları", "Connected computer & AI providers"],
      paragraphs: [
        [
          "Eşleştirdiğin bilgisayara komutlar, istemler, seçili dosyalar, kod ve çalışma bağlamı gönderilir. Dosyalar ve agent araçları bilgisayarında çalışır. Host veya sağlayıcı günlükleri ve geçmişi ayrıca saklanabilir. Bilgisayarın ya da ağ geçidinin işletmecisi bağlantı adresini ve istek bilgilerini görebilir.",
          "Commands, prompts, selected files, code and workspace context are sent to the computer you pair. Files and agent tools run on that computer. Host and provider logs and history may be stored separately. The computer or network gateway operator may see your connection address and request information.",
        ],
        [
          "AI özelliklerini kullandığında host üzerinde seçilen sağlayıcıya istemler, konuşma içeriği, kod, dosya ekleri ve araç sonuçları aktarılabilir. OpenAI/Codex, Anthropic/Claude, Google/Gemini, GitHub/Copilot veya seçtiğin özel uç nokta kendi gizlilik, saklama, model eğitimi ve ücret kurallarını uygular. Göndermeye yetkili olmadığın kişisel verileri veya sırları paylaşma.",
          "When you use AI features, prompts, conversation content, code, file attachments and tool results may be transmitted to the provider selected on your host. OpenAI/Codex, Anthropic/Claude, Google/Gemini, GitHub/Copilot or your chosen custom endpoint applies its own privacy, retention, model-training and billing rules. Do not share personal data or secrets you are not authorized to transmit.",
        ],
        [
          "Çalışma alanına erişmeden önce seçili bilgisayar ve bildirdiği sağlayıcılarla veri paylaşımı için açık izin istenir. İzin tercihin telefonunda AsyncStorage içinde, bilgisayar ve sağlayıcı listesine göre saklanır; başka bir bilgisayar veya değişen sağlayıcı listesi için yeniden izin gerekir. Ayarlar → Gizlilik ve veriler bölümünden iznini geri çekebilirsin. Bu, telefonun çalışma alanına erişimini durdurur; bilgisayarda zaten çalışan işleri veya daha önce iletilen verileri geri almaz.",
          "Before workspace access, you are asked for explicit permission to share data with the selected computer and its advertised providers. Your permission is stored on your phone in AsyncStorage for that computer and provider set; another computer or a changed provider set requires permission again. Withdraw permission in Settings → Privacy & data. This pauses workspace access from the phone; it does not stop work already running on the computer or recall data already transmitted.",
        ],
      ],
    },
    {
      title: ["Diğer bağlı servisler", "Other connected services"],
      paragraphs: [
        [
          "Git, inbox, MCP, tarayıcı ve sosyal özellikler, izin verdiğin işlemler için depo bilgilerini, hesap kimliklerini, mesajları, gönderileri, yorumları veya medyayı ilgili servisle paylaşabilir. Yetkilendirdiğin zamanlanmış görevler ve host üzerindeki arka plan işlemleri, mobil uygulama kapalıyken de çalışabilir.",
          "Git, inbox, MCP, browser and social features may exchange repository information, account identifiers, messages, posts, comments or media with their services for operations you authorize. Authorized scheduled tasks and background operations on your host may continue when the mobile app is closed.",
        ],
        [
          "YouTube özellikleri YouTube API Services kullanır; Google Gizlilik Politikası ve YouTube Hizmet Şartları geçerlidir. Sosyal bağlantıyı kaldırmak, platformdaki yayınları silmez veya platform yetkisini tek başına geri almaz. Yetkiyi ilgili platformun hesap ayarlarından da kaldır.",
          "YouTube features use YouTube API Services; Google’s Privacy Policy and YouTube’s Terms of Service apply. Disconnecting social access does not delete published content or by itself revoke platform authorization. Also revoke access in the platform’s account settings.",
        ],
        [
          "Bu metinler uygulamayla birlikte gelir ve çevrimdışı okunabilir. Harici bağlantılar yalnızca dokunduğunda tarayıcıda veya e-posta uygulamanda açılır. Bu servisler bağlantı bilgilerini kendi politikaları kapsamında işleyebilir.",
          "These documents are bundled with the app and can be read offline. External links open in your browser or email app only when you tap them. Those services may process connection information under their own policies.",
        ],
        [
          "Uygulamayı paylaş yalnızca herkese açık ürün veya mağaza bağlantısını hazırlar; bilgisayar adresini, eşleştirme kodunu, erişim anahtarlarını veya çalışma alanını eklemez. Geri bildirim ve içerik bildirimi destek e-postası taslağı açar. Açıklama ve isteğe bağlı düzenlenebilir alıntı yalnızca uygulama belleğinde tutulur; alıntı varsayılan olarak eklenmez. Taslağı silebilirsin; uygulama işlemi sonlandırılırsa taslak kaybolur. E-posta uygulamanda içeriği kontrol edip kendin gönderdiğinde seçtiğin bilgiler destek alıcısına ve e-posta servisine iletilir. bycoda gönderimi veya teslimatı doğrulamaz, host ve oturum günlüklerini otomatik yüklemez. Göndermeden önce özel bilgileri kaldır.",
          "Share app prepares only a public product or store link; it does not include computer addresses, pairing codes, access keys or workspace content. Feedback and content reports open a support email draft. The description and optional editable excerpt stay only in app memory; excerpts are excluded by default. You can discard the draft, and it is lost when the app process ends. When you review and send the message in your email app, your chosen information is shared with the support recipient and email service. bycoda does not verify sending or delivery or automatically upload host/session logs. Remove private information before sending.",
        ],
      ],
    },
    {
      title: ["Saklama ve silme", "Retention & deletion"],
      paragraphs: [
        [
          "Yerel veriler, ilgili kontrolü kullanarak kaldırana kadar tutulur; tüm veriler için tek bir otomatik silinme süresi yoktur. Ayarlar → Gizlilik ve veriler bölümünde kayıtlı bilgisayarları ve erişim anahtarlarını bu telefondan kaldırabilirsin; taslakların saklanır. Tüm bilgisayar bağlantılarını kaldırdıktan sonra ayrı bir işlemle kaydedilmiş mesaj, dosya ve not taslaklarını silebilirsin. Önce saklamak istediğin içeriği kopyala. Dil ve uygulama kilidi tercihlerin korunur.",
          "Local data remains until you remove it using the relevant controls; there is no single automatic expiration period for all data. Settings → Privacy & data lets you remove saved computers and access keys from this phone while retaining drafts. After removing all saved computer connections, a separate action deletes saved message, file and note drafts. Copy any content you want to keep first. Language and app-lock preferences are retained.",
        ],
        [
          "Telefonundan bir bilgisayar bağlantısını kaldırmak veya yerel verileri temizlemek host kayıtlarını, proje dosyalarını, sağlayıcı geçmişini, yedekleri veya yayımlanmış sosyal içeriği silmez. Telefona verilmiş erişimi host/masaüstü cihaz ayarlarından ayrıca iptal et. Uygulamayı kaldırmak tüm işletim sistemi yedeklerinin veya korumalı depodaki kayıtların silindiğini garanti etmez.",
          "Removing a computer connection or clearing local phone data does not delete host records, project files, provider history, backups or published social content. Separately revoke the phone’s access in host/desktop device settings. Uninstalling does not guarantee removal of every operating-system backup or protected-storage record.",
        ],
        [
          "bycoda kaydı veya merkezi kullanıcı hesabı bulunmadığından silinecek bir bycoda hesabı yoktur. Bağladığın üçüncü taraf hesabını silmek için o servisin kendi kontrollerini kullan. Geliştirici cihazına uzaktan erişemez ve senin adına yerel ya da sağlayıcı verilerini silemez.",
          "There is no bycoda registration or central user account to delete. Use each connected service’s own controls to delete a third-party account. The maintainer cannot remotely access your device or erase local or provider data on your behalf.",
        ],
      ],
    },
    {
      title: ["Talepler, destek ve değişiklikler", "Requests, support & changes"],
      paragraphs: [
        [
          "E-posta veya GitHub üzerinden destek için gönderdiğin bilgiler geliştiriciye ulaşır ve isteğini yanıtlamak için kullanılır; gerekli güvenlik ve proje kayıtları dışında yalnızca ihtiyaç duyulan süre boyunca saklanır. Günlüklerden sırları çıkar ve yalnızca gereken bilgiyi gönder. Açık GitHub konularında kişisel veri, erişim anahtarı, özel kod veya konuşma paylaşma.",
          "Information you voluntarily send by email or GitHub reaches the maintainer and is used to handle your request, retained only as needed apart from necessary security or project records. Remove secrets from logs and share only what is needed. Do not post personal data, access keys, private code or conversations in public GitHub issues.",
        ],
        [
          "Uygulanabilir mevzuattaki erişim, düzeltme, silme, itiraz ve yetkili makama şikâyet hakların bu politikayla kaldırılmaz. Geliştiriciye gönüllü gönderdiğin bilgilerle ilgili talepler için iletişim adresini kullan; sağlayıcının tuttuğu veriler için ayrıca sağlayıcıya başvur. Politika değişiklikleri tarihli olarak depoda yayımlanır ve sonraki uygulama sürümlerine eklenir.",
          "This policy does not remove rights under applicable law to access, correct or delete data, object to processing or complain to a competent authority. Contact the maintainer about information you voluntarily provided; also contact the provider about its own records. Policy changes are dated in the repository and included in subsequent app versions.",
        ],
      ],
    },
  ],
  terms: [
    {
      title: ["Uygulama ve lisans", "App & license"],
      paragraphs: [
        [
          "bycoda mobil, seçtiğin bilgisayardaki bycoda Host için bir yardımcı uygulamadır. bycoda hesabı veya uygulama içi sağlayıcı aboneliği oluşturmaz. Açık kaynak yazılım depodaki MIT lisansı altında sunulur. Bu kullanım açıklamaları lisansın verdiği hakları kısıtlamaz ve üçüncü taraf lisans bildirimlerini değiştirmez.",
          "bycoda mobile is a companion for bycoda Host on your chosen computer. It does not create a bycoda account or an in-app provider subscription. The open-source software is provided under the repository’s MIT license. These use notices do not restrict rights granted by that license or replace third-party license notices.",
        ],
      ],
    },
    {
      title: ["İşlemler ve izinler", "Actions & permissions"],
      paragraphs: [
        [
          "Yalnızca erişim yetkin olan bilgisayarları, projeleri ve servisleri bağla. Agentlar ve araçlar verdiğin izinler kapsamında dosyaları değiştirebilir, komut çalıştırabilir, veriyi dış servislere gönderebilir ve içerik yayımlayabilir. Zamanlanmış host işleri uygulama kapalıyken de devam edebilir. İzinleri ve sonuçları gözden geçir, yedek al ve erişim anahtarlarını koru.",
          "Connect only computers, projects and services you are authorized to access. Agents and tools can change files, execute commands, send data to external services and publish content within the permissions you grant. Scheduled host work can continue while the app is closed. Review permissions and results, keep backups and protect access keys.",
        ],
        [
          "AI çıktıları yanlış, eksik veya güvensiz olabilir. Üretilen kodu ve içeriği kullanmadan önce incele. bycoda profesyonel hukuk, finans veya benzeri danışmanlık sağlamaz.",
          "AI outputs can be inaccurate, incomplete or unsafe. Review generated code and content before using them. bycoda does not provide professional legal, financial or similar advice.",
        ],
      ],
    },
    {
      title: ["Üçüncü taraf servisleri", "Third-party services"],
      paragraphs: [
        [
          "Sağlayıcı hesapları, ücretler, abonelikler, kotalar ve koşullar seninle ilgili servis arasındadır. Geliştirici bu servisleri işletmez veya kullanılabilirliğini ya da çıktılarını garanti etmez. YouTube özelliklerini kullanmak YouTube Hizmet Şartlarına tabidir; diğer bağlı platformların koşulları da geçerlidir.",
          "Provider accounts, charges, subscriptions, quotas and terms are between you and the relevant service. The maintainer does not operate those services or guarantee their availability or outputs. YouTube features are subject to YouTube’s Terms of Service; other connected platforms’ terms also apply.",
        ],
      ],
    },
    {
      title: ["Garanti ve zorunlu haklar", "Warranty & mandatory rights"],
      paragraphs: [
        [
          "Yazılım MIT lisansında belirtildiği gibi mevcut haliyle, garanti olmadan sunulur. Kesintisiz çalışma, hatasız sonuç veya veri kurtarma taahhüdü verilmez. Uygulanabilir hukukun izin verdiği ölçüde lisansın sorumluluk sınırlamaları geçerlidir. Bu metin, kanunen dışlanamayacak sorumlulukları veya zorunlu tüketici ve veri koruma haklarını kaldırmaz.",
          "The software is provided as is, without warranty, as stated in the MIT license. Uninterrupted operation, error-free results and data recovery are not promised. The license’s liability limitations apply to the extent permitted by applicable law. This notice does not exclude liability that cannot lawfully be excluded or remove mandatory consumer and data-protection rights.",
        ],
      ],
    },
    {
      title: ["Gizlilik ve iletişim", "Privacy & contact"],
      paragraphs: [
        [
          "Veri saklama ve servislerle paylaşım gizlilik politikasında açıklanır. Güvenlik açıklarını ve hassas destek taleplerini info@bahadrhllyalcn.com adresine özel olarak ilet. Değişiklikler tarihli olarak depoda yayımlanır ve sonraki uygulama sürümlerine eklenir.",
          "The privacy policy explains data storage and service sharing. Report vulnerabilities and sensitive support requests privately to info@bahadrhllyalcn.com. Changes are dated in the repository and included in subsequent app versions.",
        ],
      ],
    },
  ],
  help: [
    {
      title: ["Bilgisayarına bağlan", "Connect your computer"],
      paragraphs: [
        [
          "Bilgisayarında bycoda ve bycoda Host açık olmalı. Masaüstünde Ayarlar → Bağlantılar alanından telefon eşleştirmeyi aç ve oluşan QR kodunu mobil uygulamada tara. Eşleştirme kodunu yalnızca kendi telefonunda kullan; ekran görüntüsünü paylaşma.",
          "bycoda and bycoda Host must be running on your computer. Open phone pairing from Settings → Connections on desktop, then scan the generated QR code in the mobile app. Use pairing codes only on your own phone; do not share screenshots.",
        ],
        [
          "Kamera kullanmak istemiyorsan elle giriş yapabilirsin. Uygulamanın istediği adres ve cihaz erişim anahtarını bilgisayarından al. Farklı ağlardan erişim için bilgisayarında yapılandırılmış, erişilebilir güvenli bağlantı gerekir.",
          "You can enter details manually if you prefer not to use the camera. Obtain the requested address and device access key from your computer. Access from another network requires a reachable secure connection configured on that computer.",
        ],
      ],
    },
    {
      title: ["Bağlantı çalışmıyorsa", "If connection fails"],
      paragraphs: [
        [
          "Bilgisayarın açık olduğunu, hostun çalıştığını, telefonun doğru ağa bağlı olduğunu ve bağlantı adresinin erişilebilir olduğunu kontrol et. Süresi dolan eşleştirme kodunu masaüstünde yenile. Cihaz erişimi iptal edildiyse yeniden eşleştir. Bağlantıyı kaldırmak yerine önce tekrar dene; gönderilmemiş taslaklarını koru.",
          "Check that your computer is on, the host is running, your phone is on the correct network and the connection address is reachable. Generate a fresh pairing code on desktop if it expired. Pair again if device access was revoked. Retry before removing a connection; keep your unsent drafts.",
        ],
      ],
    },
    {
      title: ["Veri ve erişimi yönet", "Manage data & access"],
      paragraphs: [
        [
          "Ayarlar → Gizlilik ve veriler bölümünden veri paylaşımı iznini geri çekebilir veya kayıtlı bilgisayarları ve telefondaki erişim anahtarlarını kaldırabilirsin. Taslaklar bağlantı kaldırma işleminde korunur; tüm bağlantıları kaldırdıktan sonra kaydedilmiş taslakları ayrı düğmeyle silebilirsin. Silmeden önce gereken içeriği kopyala. Dil ve uygulama kilidi tercihlerin korunur. Bu işlemler hosttaki dosyaları, oturumları veya sağlayıcı hesaplarını silmez; telefon erişimini masaüstü/host cihaz ayarlarından ayrıca iptal et.",
          "Settings → Privacy & data lets you withdraw data-sharing permission or remove saved computers and access keys from this phone. Removing connections retains drafts; after removing all connections, a separate button deletes saved drafts. Copy needed content first. Language and app-lock preferences are retained. These actions do not delete host files, sessions or provider accounts; separately revoke phone access in desktop/host device settings.",
        ],
        [
          "Güvenli giriş alanından uygulama kilidini yönetebilirsin. Kamera iznini telefon ayarlarından değiştirebilirsin. Sağlayıcı hesaplarını ve yayımlanmış içeriği silmek için ilgili servisin kendi ayarlarını kullan.",
          "Manage app lock under Secure access. Change camera permission in phone settings. Use each service’s own settings to delete provider accounts and published content.",
        ],
      ],
    },
    {
      title: ["Destek ve geri bildirim", "Support & feedback"],
      paragraphs: [
        [
          "Destek, gizlilik talepleri, güvenlik sorunları veya AI çıktısıyla ilgili geri bildirim için info@bahadrhllyalcn.com adresine yazabilirsin. E-posta düğmesi yalnızca e-posta uygulamanı açar; otomatik mesaj veya günlük göndermez. Göndermeden önce paylaşacağın bilgiyi kendin incele.",
          "For support, privacy requests, security issues or feedback about AI output, contact info@bahadrhllyalcn.com. The email button only opens your email app; it does not automatically send messages or logs. Review the information you choose to share before sending.",
        ],
        [
          "Sorunu yeniden oluşturma adımları, telefon işletim sistemi ve uygulama sürümü gibi gerekli ayrıntıları paylaş. Erişim anahtarları, eşleştirme kodları, özel proje dosyaları veya kişisel konuşmalar gönderme. GitHub konuları herkese açıktır; hassas talepler için e-posta kullan.",
          "Share necessary details such as reproduction steps, phone operating system and app version. Do not send access keys, pairing codes, private project files or personal conversations. GitHub issues are public; use email for sensitive requests.",
        ],
      ],
    },
  ],
};

// Preserve the repository license and attribution verbatim; this is not a new license.
export const mitLicense = `MIT License

Copyright (c) 2026 Nick

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
