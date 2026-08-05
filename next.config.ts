import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the OpenAI SDK external so Node resolves it at runtime in Route Handlers.
  serverExternalPackages: ["openai"],
};

export default nextConfig;
