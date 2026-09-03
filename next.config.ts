import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  // Keep SDKs external so Node resolves them at runtime in Route Handlers.
  serverExternalPackages: ["openai", "@supabase/supabase-js", "@supabase/ssr"],
  ...(basePath && basePath !== "/"
    ? { basePath: basePath.startsWith("/") ? basePath : `/${basePath}` }
    : {}),
};

export default nextConfig;
