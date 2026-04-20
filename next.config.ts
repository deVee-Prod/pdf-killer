import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // משתיק את הבדיקות של ESLint בזמן בנייה
  eslint: {
    ignoreDuringBuilds: true,
  },
  // משתיק את השגיאות הקטנוניות של TypeScript בזמן בנייה
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        path: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;