import React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./components";

/** Login uses a bounded native layout; keyboard resize keeps its controls visible. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -90,
          right: -90,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: "#E5F5EF80",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 10,
          left: -100,
          width: 230,
          height: 230,
          borderRadius: 115,
          backgroundColor: "#E8F0FF65",
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 480,
            alignSelf: "center",
            paddingHorizontal: 20,
            paddingVertical: 12,
            gap: 12,
            justifyContent: "center",
          }}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
