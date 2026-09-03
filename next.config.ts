import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  // Keep the OpenAI SDK external so Node resolves it at runtime in Route Handlers.
  serverExternalPackages: ["openai"],
  ...(basePath && basePath !== "/"
    ? { basePath: basePath.startsWith("/") ? basePath : `/${basePath}` }
    : {}),
};

export default nextConfig;
