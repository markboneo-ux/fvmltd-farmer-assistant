import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { saveFarmerAvatar } from "@/lib/auth/complete-farmer-auth";
import { farmerFacingError } from "@/lib/beta/farmer-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  if (!identity.authUserId) {
    return NextResponse.json({ error: "Log in to add a profile picture." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "I couldn’t upload that photo. Please try again." }, { status: 400 });
  }
  const file = form.get("file") ?? form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Please use a JPG, PNG, or WEBP photo." }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "That photo is a bit large. Try a smaller one." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const profile = await saveFarmerAvatar({
    authUserId: identity.authUserId,
    bytes,
    contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
  });
  if (!profile) {
    return NextResponse.json(
      { error: farmerFacingError("I couldn’t save that photo. Please try again.") },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, profile });
}
