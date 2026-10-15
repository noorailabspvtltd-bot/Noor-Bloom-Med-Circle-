import React, { useState } from "react";
import {
  Image,
  Keyboard,
  Modal,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect, router } from "expo-router";
import { AuthLayout } from "../auth-layout";
import { useClinic } from "../store";
import { BloomLogo } from "../branding";
import { cloudMode } from "../cloud-config";
import { GoogleLogin } from "./google-login";
import { brand, doctors, nurses, Role, roles } from "../clinic";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chips,
  Field,
  Entrance,
  Icon,
  Label,
  Screen,
  Touch,
  styles,
  theme,
  useKeyboardOpen,
} from "../components";
import { WelcomeGate } from "../welcome";
export default function AuthScreen() {
  return (
    <WelcomeGate>
      {cloudMode ? <GoogleLogin /> : <DemoAuthScreen />}
    </WelcomeGate>
  );
}
function DemoAuthScreen() {
  const { state, dispatch } = useClinic();
  const [step, setStep] = useState<"login" | "otp">("login");
  const [role, setRole] = useState<Role>("Patient");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [providerId, setProviderId] = useState("1");
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const { height } = useWindowDimensions();

  const keyboardOpen = useKeyboardOpen();
  function continueLogin() {
    const clean = identifier.trim();
    if (!/^\S+@\S+\.\S+$/.test(clean) && !/^\+?\d[\d\s-]{8,14}$/.test(clean)) {
      setError("Enter a valid email or mobile number.");
      return;
    }
    setIdentifier(clean);
    setError("");
    Keyboard.dismiss();
    setStep("otp");
  }
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
  const staff = role === "Nurse" ? nurses : doctors;
  return (
    <AuthLayout>
      {!keyboardOpen && (
        <View style={[styles.row, { marginVertical: 4 }]}>
          <BloomLogo size={44} />
          <Text
            style={{
              color: theme.ink,
              fontSize: 18,
              fontWeight: "800",
              letterSpacing: 1.4,
            }}
          >
            {brand.name}
          </Text>
        </View>
      )}
      {step === "login" && !keyboardOpen && height > 680 && (
        <Image
          source={require("../../assets/care-welcome.png")}
          accessibilityLabel="A care professional supporting a loved one at home"
          style={{
            width: "100%",
            height: Math.min(176, Math.max(0, height - 650)),
            borderRadius: 24,
          }}
          resizeMode="cover"
        />
      )}
      {!keyboardOpen && height > 650 && (
        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: height < 700 ? 22 : 28,
              lineHeight: 32,
              color: theme.ink,
              fontWeight: "800",
            }}
          >
            Care that fits into your life.
          </Text>
          {height > 750 && <Body muted>Thoughtful care, right at home.</Body>}
        </View>
      )}
      <Entrance key={step}>
        <Card
          style={{
            borderRadius: 26,
            padding: 16,
            gap: keyboardOpen || height < 700 ? 8 : 12,
          }}
        >
          {!keyboardOpen && (
            <Text style={[styles.title, { fontSize: 21, lineHeight: 26 }]}>
              {step === "login"
                ? "Your care starts here"
                : "One small step to care"}
            </Text>
          )}
          {!keyboardOpen && (
            <Body muted>
              {step === "login"
                ? "Choose a role to explore your local care space."
                : "Use the demo code 123456. No SMS is sent."}
            </Body>
          )}
          {step === "login" ? (
            <>
              <Touch
                label="Choose demo role"
                onPress={() => setChoosing(true)}
                style={{
                  paddingVertical: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: theme.green, fontWeight: "700" }}>
                  {role}
                  {["Doctor", "Nurse"].includes(role)
                    ? " � " + staff.find((p) => p.id === providerId)?.name
                    : " care space"}
                </Text>
                <Icon name="chevron-down" size={18} />
              </Touch>
              <Field
                label="Email or mobile number"
                value={identifier}
                onChange={(value) => {
                  setIdentifier(value);
                  setError("");
                }}
                placeholder="you@example.com"
                error={error}
                inputProps={{
                  autoCapitalize: "none",
                  autoCorrect: false,
                  keyboardType: "email-address",
                  autoComplete: "email",
                  returnKeyType: "go",
                  onSubmitEditing: continueLogin,
                }}
              />
              <Button
                title="Continue"
                icon="arrow-forward"
                onPress={continueLogin}
              />
            </>
          ) : (
            <>
              <Field
                label="Verification code"
                value={code}
                onChange={(value) => {
                  setCode(value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="123456"
                numeric
                error={error}
                inputProps={{
                  maxLength: 6,
                  autoComplete: "one-time-code",
                  textContentType: "oneTimeCode",
                  autoCorrect: false,
                  autoCapitalize: "none",
                }}
              />
              <Button
                title="Enter my care space"
                onPress={() => {
                  if (code !== "123456")
                    return setError("Enter demo code 123456.");
                  if (
                    dispatch({
                      type: "session",
                      session: {
                        role,
                        providerId: ["Doctor", "Nurse"].includes(role)
                          ? providerId
                          : "",
                        identifier,
                      },
                    })
                  ) {
                    Keyboard.dismiss();
                  }
                }}
              />
              <Button
                title="Change login details"
                secondary
                onPress={() => {
                  setError("");
                  setStep("login");
                }}
              />
            </>
          )}
        </Card>
      </Entrance>
      {!keyboardOpen && (
        <View
          style={{
            gap: 8,
            alignItems: "center",
            paddingTop: 6,
            paddingBottom: 0,
          }}
        >
          <View
            style={[styles.row, { justifyContent: "center", flexWrap: "wrap" }]}
          >
            <Icon name="shield-checkmark-outline" size={16} />
            <Body muted>Local demo · Fictional data only</Body>
          </View>
          <Text
            style={{
              color: theme.muted,
              textAlign: "center",
              fontSize: 11,
              lineHeight: 16,
            }}
          >
            {brand.company} · Your care, connected.
          </Text>
        </View>
      )}
      <Modal
        visible={choosing}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosing(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#162C3580",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Card style={{ maxHeight: "80%" }}>
            <Text style={styles.cardTitle}>Choose your demo care space</Text>
            <ScrollView>
              <View style={{ gap: 14 }}>
                <Chips
                  values={roles}
                  value={role}
                  onChange={(v) => {
                    setRole(v as Role);
                    setProviderId(v === "Nurse" ? "n1" : "1");
                  }}
                />
                {["Doctor", "Nurse"].includes(role) && (
                  <>
                    <Label>Care professional</Label>
                    <Chips
                      values={staff.map((p) => p.name)}
                      value={
                        staff.find((p) => p.id === providerId)?.name ||
                        staff[0].name
                      }
                      onChange={(name) =>
                        setProviderId(staff.find((p) => p.name === name)!.id)
                      }
                    />
                  </>
                )}
              </View>
            </ScrollView>
            <Button title="Done" onPress={() => setChoosing(false)} />
          </Card>
        </View>
      </Modal>
    </AuthLayout>
  );
}
export function ProfileForm({ onboarding = false }: { onboarding?: boolean }) {
  const { state, dispatch, notify } = useClinic();
  const [profile, setProfile] = useState(state.profile);
  const set = (key: keyof typeof profile, value: string | boolean) =>
    setProfile((p) => ({ ...p, [key]: value }));
  return (
    <Screen
      title={onboarding ? "Make yourself at home" : "Edit your health profile"}
      subtitle="A little context helps your care team."
      back={!onboarding}
      allowed={["Patient"]}
    >
      <Card>
        <View style={styles.row}>
          <Avatar />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Your personal details</Text>
            <Body muted>Use fictional details in this demo.</Body>
          </View>
        </View>
        {(["name", "age", "contact", "address"] as const).map((key) => (
          <Field
            key={key}
            label={
              {
                name: "Full name",
                age: "Age",
                contact: "Emergency contact",
                address: "Home visit address",
              }[key]
            }
            value={profile[key]}
            numeric={key === "age"}
            onChange={(v) => set(key, v)}
          />
        ))}
        <Label>Gender</Label>
        <Chips
          values={["Female", "Male", "Other", "Prefer not to say"]}
          value={profile.gender}
          onChange={(v) => set("gender", v)}
        />
        <Label>Preferred language</Label>
        <Chips
          values={["English", "Hindi", "Malayalam"]}
          value={profile.language}
          onChange={(v) => set("language", v)}
        />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Your health context</Text>
        {(["conditions", "allergies", "medicines", "notes"] as const).map(
          (key) => (
            <Field
              key={key}
              label={
                {
                  conditions: "Conditions",
                  allergies: "Allergies",
                  medicines: "Current medicines",
                  notes: "Care notes",
                }[key]
              }
              value={profile[key]}
              onChange={(v) => set(key, v)}
              multiline={key === "notes"}
            />
          ),
        )}
      </Card>
      <Button
        title={onboarding ? "Let’s begin" : "Save profile"}
        icon="checkmark"
        onPress={() => {
          if (dispatch({ type: "profile", profile, onboarding })) {
            notify("Your profile is saved.");
            router.replace("/(tabs)");
          }
        }}
      />
      <Body muted>
        Language preference is saved; the demo interface is in English.
      </Body>
    </Screen>
  );
}
