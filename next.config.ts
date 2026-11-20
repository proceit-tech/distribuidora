import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // BUILD-R02: el build operacional comprueba tipos solo de la aplicación (sin *.casos.ts). Sin ignoreBuildErrors: cualquier error de tipos de la app sigue rompiendo el build.
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
