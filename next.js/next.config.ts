import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint:{
    ignoreDuringBuilds: true, // Ignora erros de linting durante a construção
  }
};

export default nextConfig;
