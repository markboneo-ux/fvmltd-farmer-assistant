"use client";

import { farmerOAuthRedirectTo } from "@/lib/auth/oauth";

export function FarmerOAuthButtons({
  next = "/",
  onError,
}: {
  next?: string;
  onError: (message: string) => void;
}) {
  async function oauth(provider: "google" | "apple") {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: farmerOAuthRedirectTo(window.location.origin, next) },
      });
      if (error) {
        onError(
          provider === "google"
            ? "Google sign-in is not ready yet. Use email for now."
            : "Apple sign-in is not ready yet. Use email for now.",
        );
      }
    } catch {
      onError(
        provider === "google"
          ? "Google sign-in is not ready yet. Use email for now."
          : "Apple sign-in is not ready yet. Use email for now.",
      );
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void oauth("google")}
        className="min-h-12 w-full rounded-full bg-surface text-sm font-medium text-ink ring-1 ring-line"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => void oauth("apple")}
        className="min-h-12 w-full rounded-full bg-surface text-sm font-medium text-ink ring-1 ring-line"
      >
        Continue with Apple
      </button>
    </div>
  );
}
