import { absoluteAppUrl, getAppUrl } from "@/lib/config/urls";
import { isNativeApp } from "@/lib/mobile/native";

/**
 * OAuth / magic-link return URL. Prefer the canonical public app origin so
 * Supabase redirect allow-lists and cookies stay consistent inside the
 * Capacitor WebView (where `window.location.origin` may differ briefly).
 */
export function authCallbackUrl(nextPath = "/"): string {
  const path = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const query = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
  const fromEnv = absoluteAppUrl(`/auth/callback${query}`);
  if (fromEnv.startsWith("http")) return fromEnv;

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback${query}`;
  }

  const fallback = getAppUrl() || "https://crop.farmersvaluemart.com";
  return `${fallback}/auth/callback${query}`;
}

/** Open an external https URL in the system browser when native (OAuth, terms). */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isNativeApp()) {
    if (typeof window !== "undefined") window.location.assign(url);
    return;
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    if (typeof window !== "undefined") window.location.assign(url);
  }
}
