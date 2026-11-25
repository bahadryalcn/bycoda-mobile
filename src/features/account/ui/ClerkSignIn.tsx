import { isClerkAPIResponseError, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { useRef, useState } from "react";
import { Body, Button, HeaderBackButton, Input, Notice, Row, Stack } from "@/ui/primitives";
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
        returnKeyType="send"
        onSubmitEditing={() => {
          if (signInLoaded && signUpLoaded && email.includes("@")) void sendCode();
        }}
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
