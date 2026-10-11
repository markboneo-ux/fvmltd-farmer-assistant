"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isNativeApp,
  isStaffOrAdminPath,
} from "@/lib/mobile/native";

/**
 * Boots Capacitor plugins and keeps farmer mobile shells off staff/admin routes.
 * Safe no-op on the public web deployment.
 */
export function NativeAppBootstrap() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;

    async function boot() {
      try {
        const [{ App }, { StatusBar, Style }, { SplashScreen }] =
          await Promise.all([
            import("@capacitor/app"),
            import("@capacitor/status-bar"),
            import("@capacitor/splash-screen"),
          ]);

        if (cancelled) return;

        await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
        await StatusBar.setBackgroundColor({ color: "#1b4332" }).catch(
          () => undefined,
        );
        await SplashScreen.hide().catch(() => undefined);

        const appUrlListener = await App.addListener(
          "appUrlOpen",
          ({ url }) => {
            try {
              const parsed = new URL(url);
              // Custom scheme: fvmcropsolution://auth/callback?... or https app links
              const path =
                parsed.protocol === "fvmcropsolution:"
                  ? `${parsed.pathname || "/"}${parsed.search}`
                  : `${parsed.pathname}${parsed.search}`;
              if (isStaffOrAdminPath(path.split("?")[0] || "/")) {
                router.replace("/");
                return;
              }
              router.push(path.startsWith("/") ? path : `/${path}`);
            } catch {
              // Ignore malformed deep links.
            }
          },
        );

        const backListener = await App.addListener(
          "backButton",
          ({ canGoBack }) => {
            if (canGoBack) {
              window.history.back();
            } else {
              void App.exitApp();
            }
          },
        );

        return () => {
          void appUrlListener.remove();
          void backListener.remove();
        };
      } catch {
        return undefined;
      }
    }

    let cleanup: (() => void) | undefined;
    void boot().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (pathname && isStaffOrAdminPath(pathname)) {
      router.replace("/");
    }
  }, [pathname, router]);

  return null;
}
