type Copy = (tr: string, en: string) => string;

/** The fields read from a Clerk API error; `isClerkAPIResponseError` narrows to this shape. */
type ClerkErrorLike = { errors?: readonly { code?: string }[] };

/**
 * Sign-in failures in the app's language. Clerk's own `message`/`longMessage` is English only, so
 * known codes map to product wording and anything else falls back to one localized sentence.
 */
export function clerkErrorMessage(cause: ClerkErrorLike | undefined, copy: Copy): string {
  const codes = cause?.errors?.map((error) => error.code) ?? [];
  const has = (...wanted: string[]) => codes.some((code) => code !== undefined && wanted.includes(code));
  if (has("form_code_incorrect", "verification_failed"))
    return copy("Kod doğru değil. E-postadaki kodu kontrol edip yeniden dene.", "That code is not correct. Check the code in the email and try again.");
  if (has("verification_expired"))
    return copy("Kodun süresi doldu. Yeni bir kod iste.", "This code has expired. Request a new code.");
  if (has("too_many_requests", "rate_limit_exceeded"))
    return copy("Çok fazla deneme yapıldı. Biraz bekleyip yeniden dene.", "Too many attempts. Wait a moment, then try again.");
  if (has("form_param_format_invalid", "form_identifier_invalid", "form_param_nil"))
    return copy("Geçerli bir e-posta adresi gir.", "Enter a valid email address.");
  if (has("user_locked"))
    return copy("Bu hesap geçici olarak kilitlendi. Biraz sonra yeniden dene.", "This account is temporarily locked. Try again later.");
  if (has("not_allowed_access", "identifier_not_allowed_access", "sign_up_restricted"))
    return copy("Bu e-posta adresiyle giriş yapılamıyor.", "This email address cannot be used to sign in.");
  if (has("session_exists"))
    return copy("Zaten giriş yapılmış. Uygulamayı yeniden aç.", "You are already signed in. Reopen the app.");
  return copy("Giriş tamamlanamadı. Yeniden dene.", "Sign-in did not complete. Try again.");
}

/** A minimal address check so the send button can explain itself; Clerk still validates the address. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Seconds before another code can be requested after one was sent. */
export const RESEND_DELAY_SECONDS = 30;
