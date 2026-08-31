import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@berlin/shared"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
