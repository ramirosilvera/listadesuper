import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La Server Action de importación de catálogo (src/app/(app)/ajustes/
  // import-seed-action.ts) lee data/seed/*.csv con fs en tiempo de
  // ejecución. Next/Vercel solo empaqueta en la función serverless los
  // archivos que puede rastrear estáticamente, y un fs.readFile con path
  // armado dinámicamente no lo es — sin esto, el import funciona en
  // `next dev` pero rompe (ENOENT) una vez deployado.
  outputFileTracingIncludes: {
    "/ajustes": ["./data/seed/*.csv"],
  },
};

export default nextConfig;
