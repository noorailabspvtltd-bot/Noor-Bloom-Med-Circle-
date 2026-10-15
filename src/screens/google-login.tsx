import React, { useEffect } from "react";
import { Image, Platform, Text, View, useWindowDimensions } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth, useSSO } from "@clerk/expo";
import { Redirect } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { BloomLogo } from "../branding";
import { useClinic } from "../store";
import {
  Body,
  Button,
  Card,
  Entrance,
  Icon,
  theme,
  Title,
} from "../components";
import { setAuthFlow, useAuthFlow } from "../auth-flow";
import { GentleMotion } from "../welcome";
import { AuthLayout } from "../auth-layout";
WebBrowser.maybeCompleteAuthSession();
export function GoogleLogin() {
  const { height } = useWindowDimensions();
  const { state, cloud } = useClinic();
  const { isSignedIn } = useAuth();
  const { startSSOFlow } = useSSO();
  const { busy, error } = useAuthFlow();
  const expoGo =
    Platform.OS !== "web" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
  if (state.session)
    return (
      <Redirect
        href={
          state.session.role === "Patient" && !state.onboarded
            ? "/onboarding"
            : "/(tabs)"
        }
      />
    );
  async function signIn() {
    if (expoGo) {
      setAuthFlow({
        busy: false,
        error: "Google sign-in requires the installed BLOOM MED APK.",
      });
      return;
    }
    if (busy) return;
    setAuthFlow({ busy: true, error: "" });
    let failureMessage = "";
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "bloommed",
        path: "sso-callback",
      });
      if (__DEV__) console.info("[Google sign-in] callback:", redirectUrl);
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });
      if (__DEV__)
        console.info("[Google sign-in] result", {
          browser: result.authSessionResult?.type,
          sessionCreated: !!result.createdSessionId,
          signInStatus: result.signIn?.status,
          signUpStatus: result.signUp?.status,
          missingFields: result.signUp?.missingFields,
        });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      } else {
        const missing = result.signUp?.missingFields?.join(", ");
        failureMessage =
          result.authSessionResult?.type === "cancel" ||
          result.authSessionResult?.type === "dismiss"
            ? "Google sign-in closed before creating a session. Please try again."
            : missing
              ? "Google sign-up needs: " +
                missing +
                ". Review required fields in Clerk."
              : "Google did not create a session (" +
                (result.signIn?.status ||
                  result.signUp?.status ||
                  "callback incomplete") +
                "). Ensure bloommed://sso-callback is saved in this Clerk development instance's mobile SSO allowlist.";
      }
    } catch (failure) {
      const details = failure as {
        errors?: { code?: string; longMessage?: string; message?: string }[];
      };
      const first = details.errors?.[0];
      if (__DEV__)
        console.warn("[Google sign-in] error code:", first?.code || "unknown");
      failureMessage =
        first?.longMessage ||
        first?.message ||
        (failure instanceof Error
          ? failure.message
          : "Google sign-in could not complete.");
    } finally {
      setAuthFlow({ busy: false, error: failureMessage });
    }
  }
  return (
    <AuthLayout>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 8,
        }}
      >
        <BloomLogo />
        <Text
          style={{
            fontSize: 18,
            fontWeight: "800",
            letterSpacing: 1.4,
            color: theme.ink,
          }}
        >
          BLOOM MED
        </Text>
      </View>
      {height > 700 && (
        <GentleMotion>
          <View>
            <Image
              source={require("../../assets/care-welcome.png")}
              style={{
                width: "100%",
                height: Math.min(180, height - 580),
                borderRadius: 24,
              }}
              resizeMode="cover"
            />
            <View
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                backgroundColor: "#FFFFFFF2",
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Icon name="heart-outline" size={16} />
              <Text
                style={{ color: theme.green, fontSize: 12, fontWeight: "700" }}
              >
                A little closer to care
              </Text>
            </View>
          </View>
        </GentleMotion>
      )}
      <Title>Care that stays with you.</Title>
      <Body muted>
        Sign in securely and keep your care updates connected across devices.
      </Body>
      <Entrance>
        <Card>
          <Title small>
            {isSignedIn ? "Connect your care space" : "Welcome to BLOOM MED"}
          </Title>
          {!isSignedIn && expoGo && (
            <Body muted>
              Google sign-in needs the installed BLOOM MED development app; Expo
              Go cannot complete this callback.
            </Body>
          )}
          {!isSignedIn ? (
            <Button
              title={busy ? "Opening Google…" : "Continue with Google"}
              icon="logo-google"
              disabled={busy}
              onPress={signIn}
            />
          ) : (
            <>
              <Body muted>
                {cloud?.error || "Loading your cloud care space…"}
              </Body>
              <Button
                title="Retry connection"
                onPress={() => void cloud?.refresh()}
              />
              <Button
                title="Open my personal care space"
                secondary
                onPress={() => void cloud?.select("")}
              />
              <Button
                title="Sign out"
                secondary
                onPress={() => void cloud?.signOut()}
              />
            </>
          )}
          {!!error && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.red, lineHeight: 20 }}
            >
              {error}
            </Text>
          )}
          <Body muted>
            Google is the only sign-in option. Your care team access is assigned
            securely.
          </Body>
        </Card>
      </Entrance>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="shield-checkmark-outline" size={15} />
        <Text style={{ fontSize: 12, color: theme.muted }}>
          Private records � Connected care
        </Text>
      </View>
      <Text style={{ textAlign: "center", color: theme.muted, fontSize: 12 }}>
        NoorAI Labs · Your care, connected.
      </Text>
    </AuthLayout>
  );
}
