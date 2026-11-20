import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl ? [{
      protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
      hostname: supabaseUrl.hostname, port: supabaseUrl.port, pathname: "/storage/v1/object/public/**",
    }] : [],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
      bodySizeLimit: "3mb",
    },
  },
  // Required for Tailwind v4: compiles CSS through @tailwindcss/turbopack
  // (there is no PostCSS config in this repo).
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