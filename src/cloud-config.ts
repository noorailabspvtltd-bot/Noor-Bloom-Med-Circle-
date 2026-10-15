export const cloudMode = process.env.EXPO_PUBLIC_APP_MODE === "cloud";
export const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(
  /\/$/,
  "",
);
export const configurationError =
  cloudMode && (!clerkKey.startsWith("pk_") || !apiUrl.startsWith("https://"))
    ? "Cloud configuration is incomplete. Add the Clerk publishable key and HTTPS API URL to .env.local, then restart Expo."
    : "";
