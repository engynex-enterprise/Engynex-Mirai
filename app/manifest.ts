import type { MetadataRoute } from "next"
import { buildManifest } from "@/lib/pwa/manifest"

// /manifest.webmanifest: Mirai instalado como app (íconos, accesos directos, compartir, enlaces). Ver docs/PWA.md.
export default function manifest(): MetadataRoute.Manifest {
  return buildManifest()
}
