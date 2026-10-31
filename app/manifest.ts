import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mirai · Tu futuro financiero",
    short_name: "Mirai",
    description: "Finanzas personales y familiares para Colombia.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#F5F5F5",
    theme_color: "#1F2B4B",
    lang: "es-CO",
    icons: [
      { src: "/brand/mirai-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/mirai-logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
