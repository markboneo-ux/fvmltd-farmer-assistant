import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Application-side Google / Apple buttons are always present.
 * Whether the provider actually works depends on Supabase + Google/Apple
 * console configuration, which this process cannot verify without attempting OAuth.
 *
 * Env flags let the UI show an honest "not ready" state without pretending.
 */
export async function GET() {
  const googleReady = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const appleReady = process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true";
  return NextResponse.json({
    google: {
      attemptedByApp: true,
      configured: googleReady,
      status: googleReady ? "ready" : "manual_setup_required",
    },
    apple: {
      attemptedByApp: true,
      configured: appleReady,
      status: appleReady ? "ready" : "manual_setup_required",
    },
    email: { configured: true, status: "ready" },
  });
}
