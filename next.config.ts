import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output only when building container images (Dockerfile);
  // standard Render Node Web Services run `npm run build` + `npm run start`.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true"
    ? { output: "standalone" }
    : {}),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
