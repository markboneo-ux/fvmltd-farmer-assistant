import { NextResponse } from "next/server";
import { normalizeFarmerEmail } from "@/lib/auth/farmer-otp";
import { staffPasswordLogin } from "@/lib/staff/login";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = checkCombinedRateLimit({
    rule: RATE_LIMITS.login,
    ip: clientIp(request),
  });
  if (!limited.ok) {
    logOps("rate_limit", { route: "staff-login" });
    return NextResponse.json(
      {
        error: FARMER_RATE_LIMIT_MESSAGE,
        stage: "invalid_credentials",
      },
      { status: 429 },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    email = typeof body.email === "string" ? normalizeFarmerEmail(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json(
      { error: "Enter your email and password.", stage: "invalid_credentials" },
      { status: 400 },
    );
  }
  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password.", stage: "invalid_credentials" },
      { status: 400 },
    );
  }

  const result = await staffPasswordLogin({ email, password });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        stage: result.debug.stage,
        debug: result.debug,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    staff: {
      id: result.staff.id,
      fullName: result.staff.fullName,
      role: result.staff.role,
    },
    stage: result.debug.stage,
    debug: result.debug,
  });
}
