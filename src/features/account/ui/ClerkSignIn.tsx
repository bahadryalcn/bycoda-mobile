import { isClerkAPIResponseError, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { useRef, useState } from "react";
import { Body, Button, Input, Notice, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { CodeField } from "@/ui/code-field";
import { useMobileTheme } from "@/ui/theme";
import { SignInProviderMark } from "./SignInProviderMark";

/** Clerk e-mail verification codes are six digits. */
const CODE_LENGTH = 6;

type Provider = "google" | "facebook" | "apple" | "github";
type Step = { name: "choose" } | { name: "code"; mode: "signIn" | "signUp"; email: string };

const STRATEGY = {
  google: "oauth_google",
  facebook: "oauth_facebook",
  apple: "oauth_apple",
  github: "oauth_github",
} as const;

/** Sign-in choices backed by Clerk: Google, Facebook, Apple, GitHub and an e-mail code. No passwords. */
export default function ClerkSignIn() {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const working = useRef(false);
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { signIn, setActive: activateSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: activateSignUp, isLoaded: signUpLoaded } = useSignUp();
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (cause: unknown) => {
    const message = isClerkAPIResponseError(cause)
      ? (cause.errors[0]?.longMessage ?? cause.errors[0]?.message)
      : undefined;
    setError(message ?? copy("Giriş tamamlanamadı. Yeniden dene.", "Sign-in did not complete. Try again."));
  };
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
      } catch (cause) {
        const unknown = isClerkAPIResponseError(cause) && cause.errors.some((e) => e.code === "form_identifier_not_found");
        if (!unknown) throw cause;
        await signUp.create({ emailAddress: address });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setStep({ name: "code", mode: "signUp", email: address });
      }
    });

  const verify = (current: Extract<Step, { name: "code" }>) =>
    run("verify", async () => {
      if (current.mode === "signIn") {
        const result = await signIn!.attemptFirstFactor({ strategy: "email_code", code: code.trim() });
        if (result.status === "complete") await activateSignIn!({ session: result.createdSessionId });
        else throw new Error("incomplete");
      } else {
        const result = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
        if (result.status === "complete") await activateSignUp!({ session: result.createdSessionId });
        else throw new Error("incomplete");
      }
    });

  if (step.name === "code")
    return (
      <Stack>
        <Body muted>{copy("{p0} adresine bir kod gönderdik.", "We sent a code to {p0}.", { p0: step.email })}</Body>
        <CodeField
          label={copy("Doğrulama kodu", "Verification code")}
          value={code}
          onChangeText={setCode}
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
          label={copy("Geri", "Back")}
          tone="quiet"
          disabled={!!busy}
          onPress={() => {
            setStep({ name: "choose" });
            setCode("");
            setError(null);
          }}
        />
      </Stack>
    );

  const social: { provider: Provider; label: string }[] = [
    { provider: "apple", label: copy("Apple ile devam et", "Continue with Apple") },
    { provider: "google", label: copy("Google ile devam et", "Continue with Google") },
    { provider: "facebook", label: copy("Facebook ile devam et", "Continue with Facebook") },
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
        placeholder={copy("E-posta", "Email")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button
        label={copy("E-postayla kod gönder", "Email me a code")}
        tone="primary"
        fullWidth
        busy={busy === "email"}
        disabled={!signInLoaded || !signUpLoaded || !email.includes("@") || !!busy}
        onPress={() => void sendCode()}
      />
    </Stack>
  );
}
