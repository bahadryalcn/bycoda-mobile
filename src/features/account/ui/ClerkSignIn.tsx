import { isClerkAPIResponseError, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { useEffect, useRef, useState } from "react";
import { Body, Button, HeaderBackButton, Input, Notice, Row, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { CodeField } from "@/ui/code-field";
import { useMobileTheme } from "@/ui/theme";
import { SignInProviderMark } from "./SignInProviderMark";
import { clerkErrorMessage, looksLikeEmail, RESEND_DELAY_SECONDS } from "./clerk-error-copy";

/** Clerk e-mail verification codes are six digits. */
const CODE_LENGTH = 6;

type Provider = "google" | "apple" | "github";
type Step = { name: "choose" } | { name: "code"; mode: "signIn" | "signUp"; email: string };

const STRATEGY = {
  google: "oauth_google",
  apple: "oauth_apple",
  github: "oauth_github",
} as const;

/** Sign-in choices backed by Clerk: Apple, Google, GitHub and an e-mail code. No passwords. */
export default function ClerkSignIn({ onStepChange }: { onStepChange?: (step: Step["name"]) => void }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const working = useRef(false);
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { signIn, setActive: activateSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: activateSignUp, isLoaded: signUpLoaded } = useSignUp();
  const [step, setStepState] = useState<Step>({ name: "choose" });
  const setStep = (next: Step) => {
    setStepState(next);
    onStepChange?.(next.name);
  };
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Reason: one-second countdown before another code may be requested; stops at zero.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);
  const emailValid = looksLikeEmail(email);
  const emailError = emailTouched && email.trim() && !emailValid
    ? copy("Geçerli bir e-posta adresi gir.", "Enter a valid email address.")
    : undefined;

  // Clerk's own messages are English only; known codes map to the app's language.
  const fail = (cause: unknown) => setError(clerkErrorMessage(isClerkAPIResponseError(cause) ? cause : undefined, copy));
  const run = async (key: string, task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (cause) {
      fail(cause);
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  const withProvider = (provider: Provider) =>
    run(provider, async () => {
      // Apple uses the native sheet on iOS; every other case opens the system browser session.
      const result =
        provider === "apple" && process.env.EXPO_OS === "ios"
          ? await startAppleAuthenticationFlow()
          : await startSSOFlow({ strategy: STRATEGY[provider] });
      if (result.createdSessionId && result.setActive) await result.setActive({ session: result.createdSessionId });
      // No session means the person dismissed the sheet or browser; nothing to report.
    });

  const sendCode = () =>
    run("email", async () => {
      if (!signInLoaded || !signUpLoaded) return;
      const address = email.trim();
      try {
        await signIn.create({ strategy: "email_code", identifier: address });
        setStep({ name: "code", mode: "signIn", email: address });
        setResendIn(RESEND_DELAY_SECONDS);
      } catch (cause) {
        const unknown = isClerkAPIResponseError(cause) && cause.errors.some((e) => e.code === "form_identifier_not_found");
        if (!unknown) throw cause;
        await signUp.create({ emailAddress: address });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setStep({ name: "code", mode: "signUp", email: address });
        setResendIn(RESEND_DELAY_SECONDS);
      }
    });

  const resendCode = (current: Extract<Step, { name: "code" }>) =>
    run("resend", async () => {
      if (current.mode === "signIn") {
        const factor = signIn!.supportedFirstFactors?.find((item) => item.strategy === "email_code");
        if (!factor || !("emailAddressId" in factor)) throw new Error("no email factor");
        await signIn!.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      } else {
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      }
      setCode("");
      setResendIn(RESEND_DELAY_SECONDS);
    });

  const verify = (current: Extract<Step, { name: "code" }>, value = code) =>
    run("verify", async () => {
      if (current.mode === "signIn") {
        const result = await signIn!.attemptFirstFactor({ strategy: "email_code", code: value.trim() });
        if (result.status === "complete") await activateSignIn!({ session: result.createdSessionId });
        else throw new Error("incomplete");
      } else {
        const result = await signUp!.attemptEmailAddressVerification({ code: value.trim() });
        if (result.status === "complete") await activateSignUp!({ session: result.createdSessionId });
        else throw new Error("incomplete");
      }
    });

  if (step.name === "code")
    return (
      <Stack>
        {/* The shared back chevron leads the step, as on every other pushed step; the shell has no header here. */}
        <Row style={{ flexWrap: "nowrap" }}>
          <HeaderBackButton
            label={copy("Geri", "Back")}
            disabled={!!busy}
            onPress={() => {
              setStep({ name: "choose" });
              setCode("");
              setError(null);
            }}
          />
          <Body muted style={{ flex: 1 }}>{copy("{p0} adresine bir kod gönderdik.", "We sent a code to {p0}.", { p0: step.email })}</Body>
        </Row>
        <CodeField
          label={copy("Doğrulama kodu", "Verification code")}
          value={code}
          onChangeText={setCode}
          onComplete={(value) => void verify(step, value)}
          disabled={!!busy}
        />
        {error ? <Notice tone="danger" message={error} /> : null}
        <Button
          label={copy("Giriş yap", "Sign in")}
          tone="primary"
          busy={busy === "verify"}
          disabled={code.length < CODE_LENGTH || !!busy}
          onPress={() => void verify(step)}
        />
        <Button
          label={resendIn > 0
            ? copy("Kodu yeniden gönder ({p0} sn)", "Resend code ({p0}s)", { p0: resendIn })
            : copy("Kodu yeniden gönder", "Resend code")}
          tone="default"
          busy={busy === "resend"}
          disabled={resendIn > 0 || !!busy}
          onPress={() => void resendCode(step)}
        />
      </Stack>
    );

  const apple = { provider: "apple" as const, label: copy("Apple ile devam et", "Continue with Apple") };
  const google = { provider: "google" as const, label: copy("Google ile devam et", "Continue with Google") };
  // The platform's own account provider leads: Google on Android, Apple elsewhere.
  const social: { provider: Provider; label: string }[] = [
    ...(process.env.EXPO_OS === "android" ? [google, apple] : [apple, google]),
    { provider: "github", label: copy("GitHub ile devam et", "Continue with GitHub") },
  ];
  return (
    <Stack>
      {social.map(({ provider, label }) => (
        <Button
          key={provider}
          label={label}
          tone="default"
          fullWidth
          busy={busy === provider}
          disabled={!!busy}
          onPress={() => void withProvider(provider)}
        ><SignInProviderMark provider={provider} color={colors.text} /></Button>
      ))}
      <Input
        label={copy("E-posta", "Email")}
        placeholder={copy("ornek@eposta.com", "name@example.com")}
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmailTouched(true)}
        error={emailError}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        returnKeyType="send"
        onSubmitEditing={() => {
          setEmailTouched(true);
          if (signInLoaded && signUpLoaded && emailValid) void sendCode();
        }}
      />
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button
        label={copy("E-postayla kod gönder", "Email me a code")}
        tone="primary"
        fullWidth
        busy={busy === "email"}
        disabled={!signInLoaded || !signUpLoaded || !emailValid || !!busy}
        onPress={() => void sendCode()}
      />
    </Stack>
  );
}
