import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // זה התיקון הקריטי: אומר ל-Webpack להתעלם מהמודולים האלו לחלוטין
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    
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