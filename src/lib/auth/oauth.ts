export function farmerOAuthRedirectTo(origin: string, next = "/"): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next.startsWith("/") ? next : "/");
  return url.toString();
}
