import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar/group-image uploads go through Server Actions and allow files up
      // to 5 MB (see lib/actions/{profile,groups}.ts). Next's default body limit
      // is 1 MB, which silently rejected larger images. Raise it to fit them
      // (plus multipart/FormData overhead).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
