import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // O repositório possui outro package-lock na raiz. Fixar a raiz evita que o
  // standalone seja gerado em .next/standalone/next.js/server.js, enquanto a
  // imagem de produção espera .next/standalone/server.js.
  outputFileTracingRoot: process.cwd(),
  eslint:{
    ignoreDuringBuilds: true, // Ignora erros de linting durante a construção
  }
};

export default nextConfig;
