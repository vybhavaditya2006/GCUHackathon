import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev badge so it is not in the demo and the video. Errors still show.
  devIndicators: false,
};

export default nextConfig;
