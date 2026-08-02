import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tunedyota.app",
  appName: "Tuned Yota",
  webDir: "www",
  // Cluster slate behind the WebView so launch + overscroll never flash white.
  ios: { contentInset: "always", backgroundColor: "#1D2226" },
  android: { backgroundColor: "#1D2226", allowMixedContent: false },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    CapacitorHttp: { enabled: true },
    StatusBar: { style: "DARK", backgroundColor: "#1D2226", overlaysWebView: false },
    SplashScreen: { backgroundColor: "#1D2226", showSpinner: false },
  },
};

export default config;
