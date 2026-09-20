import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    connection: vi.fn(async () => undefined),
  };
});

describe("GET /api/build-info", () => {
  const env = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, env);
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";
    process.env.VERCEL_GIT_COMMIT_REF = "cursor/crop-health-reasoning-89f1";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BUILD_TIMESTAMP = "2026-09-20T20:00:00.000Z";
  });

  afterEach(() => {
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!(key in env)) delete process.env[key];
    }
  });

  it("returns sha, short sha, branch, vercel env, and timestamp fields", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      sha: string | null;
      shortSha: string | null;
      branch: string | null;
      vercelEnv: string | null;
      builtAt: string | null;
      VERCEL_GIT_COMMIT_SHA: string | null;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-fvm-build-sha")).toBe("abcdef1234567890");
    expect(body.sha).toBe("abcdef1234567890");
    expect(body.VERCEL_GIT_COMMIT_SHA).toBe("abcdef1234567890");
    expect(body.shortSha).toBe("abcdef1");
    expect(body.branch).toBe("cursor/crop-health-reasoning-89f1");
    expect(body.vercelEnv).toBe("preview");
    expect(body.builtAt).toBe("2026-09-20T20:00:00.000Z");
  });
});
