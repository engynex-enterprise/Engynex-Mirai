import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Fotos de facturas, préstamos y comprobantes para la IA (máx. 6 MB en la acción).
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  poweredByHeader: false,
  // Cabeceras de seguridad (CSP, HSTS, iframes, permisos): lib/security/headers.ts.
  async headers() {
    const h = securityHeaders({ dev: process.env.NODE_ENV !== "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, enforceCsp: process.env.MIRAI_CSP_ENFORCE === "1" });
    return [{ source: "/:path*", headers: h }];
  },
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
