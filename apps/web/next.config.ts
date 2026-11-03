import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Paquetes del monorepo (código TypeScript sin compilar): Next los compila como parte de la app.
  transpilePackages: ["@mirai/domain", "@mirai/db", "@mirai/contracts", "@mirai/crypto"],
  partialPrefetching: true,
  // Fotos de facturas, préstamos y comprobantes para la IA (máx. 6 MB en la acción).
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  poweredByHeader: false,
  // Versión desplegada: la app la compara con /api/public/version para ofrecer "Hay una versión nueva" (features/pwa).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev" },
  // Cabeceras de seguridad (CSP, HSTS, iframes, permisos): lib/security/headers.ts.
  async headers() {
    const h = securityHeaders({ dev: process.env.NODE_ENV !== "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, enforceCsp: process.env.MIRAI_CSP_ENFORCE === "1" });
    return [
      { source: "/:path*", headers: h },
      // PWA (docs/PWA.md): el service worker siempre se revisa en la red (si no, las actualizaciones tardan hasta 24 h)
      // y vale para todo el sitio; el manifest y la página offline también se revisan siempre.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      // Íconos, splash y capturas: cambian solo al regenerarlos (npm run pwa:assets); un día de caché.
      { source: "/pwa/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
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
