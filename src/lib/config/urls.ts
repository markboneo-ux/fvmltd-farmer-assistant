/**
 * Public website / app URLs. Never hardcode preview or vercel.app hosts.
 * Auth callbacks, emails, and the Farmersvaluemart header link use these.
 */

const DEFAULT_MAIN_WEBSITE = "https://farmersvaluemart.com";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Canonical public origin of this app (custom domain or preview). */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  return raw ? trimSlash(raw) : "";
}

/** Farmersvaluemart company website — header return link. */
export function getMainWebsiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_MAIN_WEBSITE_URL?.trim();
  return trimSlash(raw || DEFAULT_MAIN_WEBSITE);
}

/** Optional path prefix when the app is mounted at /crop-solution. */
export function getPublicBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? trimSlash(raw) : `/${trimSlash(raw)}`;
}

export function withBasePath(pathname: string): string {
  const base = getPublicBasePath();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!base) return path;
  if (path === "/") return base;
  return `${base}${path}`;
}

export function absoluteAppUrl(pathname: string): string {
  const origin = getAppUrl();
  const path = withBasePath(pathname);
  if (!origin) return path;
  return `${origin}${path}`;
}

export const MAIN_WEBSITE_LABEL = "Farmersvaluemart";
export const DEFAULT_MAIN_WEBSITE_URL = DEFAULT_MAIN_WEBSITE;
