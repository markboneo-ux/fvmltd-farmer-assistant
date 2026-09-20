import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  applyBuildShaHeader,
  getBuildInfo,
} from "@/lib/build-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public build identity — no secrets.
 * GET /api/build-info
 */
export async function GET() {
  await connection();
  const build = getBuildInfo();
  const response = NextResponse.json(
    {
      ok: true,
      sha: build.sha,
      shortSha: build.shortSha,
      branch: build.branch,
      vercelEnv: build.vercelEnv,
      deploymentId: build.deploymentId,
      builtAt: build.builtAt,
      VERCEL_GIT_COMMIT_SHA: build.sha,
    },
    { status: 200 },
  );
  applyBuildShaHeader(response.headers, build);
  return response;
}
