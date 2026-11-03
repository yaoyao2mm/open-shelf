import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  // Dev-only: allow phones and tablets on the same LAN to load Next's dev
  // resources while you test the layout on a real screen.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
