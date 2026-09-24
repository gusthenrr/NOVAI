import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint:{
    ignoreDuringBuilds: true, // Ignora erros de linting durante a construção
  }
};

export default nextConfig;
