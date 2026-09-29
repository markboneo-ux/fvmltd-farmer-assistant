/**
 * Capacitor / native-shell helpers for the farmer mobile beta.
 * Safe to import from Client Components only (dynamic import of Cap core).
 */

export const NATIVE_APP_ID = "com.farmersvaluemart.fvmcropsolution";
export const NATIVE_APP_NAME = "FVM Crop Solution";
export const NATIVE_URL_SCHEME = "fvmcropsolution";

/** True when running inside the Capacitor iOS/Android WebView. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** True for Capacitor Android. */
export function isNativeAndroid(): boolean {
  if (!isNativeApp()) return false;
  const cap = (
    window as Window & {
      Capacitor?: { getPlatform?: () => string };
    }
  ).Capacitor;
  return cap?.getPlatform?.() === "android";
}

/** True for Capacitor iOS. */
export function isNativeIos(): boolean {
  if (!isNativeApp()) return false;
  const cap = (
    window as Window & {
      Capacitor?: { getPlatform?: () => string };
    }
  ).Capacitor;
  return cap?.getPlatform?.() === "ios";
}

/**
 * Staff / admin dashboards stay on the web for FVMLTD staff.
 * Farmer mobile shells must not surface those routes in navigation or CTAs.
 */
export function isStaffOrAdminPath(pathname: string): boolean {
  return (
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/ai-lab" ||
    pathname.startsWith("/ai-lab/")
  );
}
