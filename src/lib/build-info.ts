/**
 * Immutable build identity for Preview/production proof.
 * Read at request time so Safari can confirm which SHA answered.
 */

export type BuildInfo = {
  sha: string | null;
  shortSha: string | null;
  branch: string | null;
  vercelEnv: string | null;
  deploymentId: string | null;
  builtAt: string | null;
};

function trimEnv(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function getBuildInfo(): BuildInfo {
  const sha =
    trimEnv(process.env.VERCEL_GIT_COMMIT_SHA) ||
    trimEnv(process.env.GITHUB_SHA) ||
    null;
  const shortSha = sha ? sha.slice(0, 7) : null;
  return {
    sha,
    shortSha,
    branch:
      trimEnv(process.env.VERCEL_GIT_COMMIT_REF) ||
      trimEnv(process.env.VERCEL_GIT_COMMIT_BRANCH) ||
      null,
    vercelEnv: trimEnv(process.env.VERCEL_ENV),
    deploymentId: trimEnv(process.env.VERCEL_DEPLOYMENT_ID),
    builtAt:
      trimEnv(process.env.VERCEL_BUILD_TIMESTAMP) ||
      trimEnv(process.env.BUILD_TIME) ||
      trimEnv(process.env.VERCEL_BUILD_COMPLETED_AT) ||
      null,
  };
}

export const BUILD_SHA_HEADER = "x-fvm-build-sha";

export function buildShaHeaderValue(info: BuildInfo = getBuildInfo()): string | null {
  return info.sha || info.shortSha;
}

export function applyBuildShaHeader(
  headers: Headers,
  info: BuildInfo = getBuildInfo(),
): Headers {
  const value = buildShaHeaderValue(info);
  if (value) headers.set(BUILD_SHA_HEADER, value);
  return headers;
}
