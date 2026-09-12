/** Project ref helpers. Never log JWT payloads beyond the `ref` claim. */

export function projectRefFromSupabaseUrl(url: string | null | undefined): string | null {
  const raw = url?.trim() ?? "";
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    const ref = host.split(".")[0]?.trim() ?? "";
    return ref || null;
  } catch {
    return null;
  }
}

/**
 * Decode the `ref` claim from a Supabase JWT (anon or service role).
 * New `sb_secret_` keys are not JWTs and return null.
 */
export function projectRefFromJwt(jwt: string | null | undefined): string | null {
  const raw = jwt?.trim() ?? "";
  if (!raw || raw.startsWith("sb_")) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(base64UrlToBase64(parts[1] ?? ""), "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: unknown };
    return typeof payload.ref === "string" && payload.ref.trim() ? payload.ref.trim() : null;
  } catch {
    return null;
  }
}

export function pkceVerifierCookieName(projectRef: string): string {
  return `sb-${projectRef}-auth-token-code-verifier`;
}

function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  return pad ? normalized + "=".repeat(4 - pad) : normalized;
}
