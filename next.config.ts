import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.arhiv.pzs.si",
      },
    ],
  },
};

export default nextConfig;
