/**
 * Internal App Router paths for the farmer registration → dashboard flow.
 * Always use these relative paths — never absolute Vercel/preview/localhost URLs.
 */
export const FARMER_DASHBOARD_PATH = "/dashboard";

/**
 * sessionStorage flag set after a successful registration so the dashboard
 * can show the success screen without putting IDs or secrets in the URL.
 */
export const JUST_REGISTERED_KEY = "fvmltd_just_registered";

export function markJustRegistered(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(JUST_REGISTERED_KEY, "1");
}

export function clearJustRegistered(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(JUST_REGISTERED_KEY);
}

export function peekJustRegistered(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(JUST_REGISTERED_KEY) === "1";
}

/**
 * Navigate to an internal relative route. Prefer App Router soft navigation;
 * fall back to a same-origin assign if the soft transition does not complete
 * (seen on some mobile Safari / interrupted client navigations).
 */
export function navigateInternal(
  router: { replace: (href: string) => void; push?: (href: string) => void },
  href: string,
  mode: "replace" | "push" = "replace",
): void {
  if (!href.startsWith("/")) {
    throw new Error("navigateInternal only accepts relative app paths");
  }

  const targetPath = href.split("?")[0] ?? href;

  if (mode === "push" && router.push) {
    router.push(href);
  } else {
    router.replace(href);
  }

  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    if (window.location.pathname !== targetPath) {
      window.location.assign(href);
    }
  }, 1200);
}
