import type { CapacitorConfig } from "@capacitor/cli";

/**
 * FVM Crop Solution — Capacitor mobile beta.
 *
 * The native shells load the same Next.js deployment that Vercel already serves
 * (API routes, Supabase auth, cases, weather, photos, voice). Local `webDir`
 * is only a bootstrap/offline fallback; production beta uses `server.url`.
 *
 * Push notifications: leave room for @capacitor/push-notifications later.
 * Do not register notification plugins or APNs/FCM yet.
 */

const APP_URL =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://crop.farmersvaluemart.com";

const config: CapacitorConfig = {
  appId: "com.farmersvaluemart.fvmcropsolution",
  appName: "FVM Crop Solution",
  webDir: "www",
  appendUserAgent: " FVMCropSolutionNative/1",
  server: {
    url: APP_URL.replace(/\/+$/, ""),
    cleartext: false,
    allowNavigation: [
      "crop.farmersvaluemart.com",
      "*.farmersvaluemart.com",
      "*.supabase.co",
      "accounts.google.com",
      "*.google.com",
      "appleid.apple.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#1b4332",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1b4332",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#1b4332",
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: "#1b4332",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    // Keep staff/admin reachable on web only; farmer shell loads the public URL.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
